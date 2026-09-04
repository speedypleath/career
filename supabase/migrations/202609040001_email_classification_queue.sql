create extension if not exists pgmq;
create extension if not exists pg_net;
create extension if not exists pg_cron;
create extension if not exists supabase_vault;

select pgmq.create('email_classification_jobs');

alter table public.email_logs
  add column if not exists classification_state text not null default 'resolved',
  add column if not exists classification_source text not null default 'legacy',
  add column if not exists classifier_prompt_hash text,
  add column if not exists classifier_prompt_tokens integer,
  add column if not exists classifier_completion_tokens integer,
  add column if not exists classification_error text,
  add column if not exists classified_at timestamptz;

create index if not exists idx_email_logs_classification_state
  on public.email_logs (classification_state, created_at desc);

create table if not exists public.email_classification_cache (
  prompt_hash text primary key,
  classification text not null check (
    classification in ('unrelated', 'confirmation', 'interview', 'assessment', 'question', 'rejection', 'offer')
  ),
  prompt_tokens integer,
  completion_tokens integer,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);

alter table public.email_classification_cache enable row level security;
revoke all on public.email_classification_cache from anon, authenticated;

create or replace function public.read_email_classification_jobs(batch_size integer default 5)
returns table (msg_id bigint, read_ct integer, message jsonb)
language sql
security definer
set search_path = ''
as $$
  select q.msg_id, q.read_ct, q.message
  from pgmq.read('email_classification_jobs', 60, greatest(1, least(batch_size, 10))) as q;
$$;

create or replace function public.delete_email_classification_job(job_id bigint)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select pgmq.delete('email_classification_jobs', job_id);
$$;

create or replace function public.archive_email_classification_job(job_id bigint)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select pgmq.archive('email_classification_jobs', job_id);
$$;

revoke all on function public.read_email_classification_jobs(integer) from public, anon, authenticated;
revoke all on function public.delete_email_classification_job(bigint) from public, anon, authenticated;
revoke all on function public.archive_email_classification_job(bigint) from public, anon, authenticated;
grant execute on function public.read_email_classification_jobs(integer) to service_role;
grant execute on function public.delete_email_classification_job(bigint) to service_role;
grant execute on function public.archive_email_classification_job(bigint) to service_role;

create or replace function public.finalize_email_classification(
  payload jsonb,
  resolved_classification text,
  resolved_source text,
  prompt_token_count integer default null,
  completion_token_count integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  email_row public.email_logs%rowtype;
  app_row public.applications%rowtype;
  final_app_id uuid;
  next_status text;
  current_rank integer;
  next_rank integer;
begin
  if resolved_classification not in ('unrelated', 'confirmation', 'interview', 'assessment', 'question', 'rejection', 'offer') then
    raise exception 'invalid email classification';
  end if;

  select * into email_row
  from public.email_logs
  where id = (payload ->> 'emailLogId')::uuid
  for update;

  if not found then
    raise exception 'email log not found';
  end if;

  if email_row.manual_override then
    return email_row.id;
  end if;

  final_app_id := email_row.application_id;

  if resolved_classification <> 'unrelated' and final_app_id is null then
    insert into public.applications (
      title, company, workplace_type, status, application_method, contact_email,
      notes, priority, source, applied_at, created_at, updated_at
    ) values (
      coalesce(nullif(payload ->> 'role', ''), 'Unknown Role'),
      coalesce(nullif(payload ->> 'company', ''), 'Unknown Company'),
      'remote',
      case resolved_classification
        when 'interview' then 'interviewing'
        when 'assessment' then 'technical_assessment'
        when 'offer' then 'offer'
        when 'rejection' then 'rejected'
        else 'applied'
      end,
      'email',
      case when coalesce(payload ->> 'sender', '') ~* '(no-?reply|notifications?)@' then '' else coalesce(payload ->> 'sender', '') end,
      'Auto-detected from queued email: "' || coalesce(payload ->> 'subject', '') || '"',
      'medium', 'email_scanner', now(), now(), now()
    ) returning * into app_row;

    final_app_id := app_row.id;

    insert into public.application_events (application_id, event_type, title, description)
    values (
      final_app_id,
      'email_created',
      'Application Auto-Detected',
      'Created application from queued email classification'
    );
  elsif final_app_id is not null then
    select * into app_row from public.applications where id = final_app_id for update;
  end if;

  update public.email_logs
  set application_id = final_app_id,
      classification = resolved_classification,
      classification_state = 'resolved',
      classification_source = resolved_source,
      classifier_prompt_tokens = prompt_token_count,
      classifier_completion_tokens = completion_token_count,
      classification_error = null,
      classified_at = now()
  where id = email_row.id;

  if final_app_id is not null and resolved_classification <> 'unrelated' then
    next_status := case resolved_classification
      when 'offer' then 'offer'
      when 'rejection' then 'rejected'
      when 'interview' then 'interviewing'
      when 'assessment' then 'technical_assessment'
      when 'question' then case when app_row.status = 'applied' then 'interview_pending' else null end
      when 'confirmation' then 'applied'
      else null
    end;

    current_rank := case app_row.status
      when 'wishlist' then 0 when 'applied' then 1 when 'interview_pending' then 2
      when 'interviewing' then 3 when 'technical_assessment' then 4 when 'offer' then 5
      when 'rejected' then 6 when 'archived' then 7 else 0
    end;
    next_rank := case next_status
      when 'wishlist' then 0 when 'applied' then 1 when 'interview_pending' then 2
      when 'interviewing' then 3 when 'technical_assessment' then 4 when 'offer' then 5
      when 'rejected' then 6 when 'archived' then 7 else 0
    end;

    if next_status is not null and (
      (next_status = 'rejected' and app_row.status <> 'rejected') or
      (app_row.status not in ('rejected', 'archived') and next_rank > current_rank)
    ) then
      update public.applications set status = next_status, updated_at = now() where id = final_app_id;
    end if;

    insert into public.application_events (application_id, event_type, title, description, metadata)
    values (
      final_app_id,
      'email_received',
      'Email received: ' || upper(resolved_classification),
      'Classified asynchronously from queued email',
      jsonb_build_object(
        'messageId', payload ->> 'messageId',
        'classification', resolved_classification,
        'snippet', payload ->> 'snippet',
        'source', resolved_source
      )
    );
  end if;

  return email_row.id;
end;
$$;

revoke all on function public.finalize_email_classification(jsonb, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.finalize_email_classification(jsonb, text, text, integer, integer) to service_role;

create schema if not exists private;

create or replace function private.invoke_email_classifier_worker()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  project_url text;
  anon_key text;
begin
  select decrypted_secret into project_url
  from vault.decrypted_secrets where name = 'project_url' limit 1;
  select decrypted_secret into anon_key
  from vault.decrypted_secrets where name = 'anon_key' limit 1;

  if project_url is null or anon_key is null then
    return null;
  end if;

  return net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/email-classifier-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', anon_key,
      'Authorization', 'Bearer ' || anon_key
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end;
$$;

create or replace function private.wake_email_classifier_worker()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.invoke_email_classifier_worker();
  return new;
end;
$$;

drop trigger if exists wake_email_classifier_worker on pgmq.q_email_classification_jobs;
create trigger wake_email_classifier_worker
after insert on pgmq.q_email_classification_jobs
for each statement execute function private.wake_email_classifier_worker();

select cron.unschedule(jobid)
from cron.job
where jobname = 'email-classifier-recovery';

select cron.schedule(
  'email-classifier-recovery',
  '* * * * *',
  $$select private.invoke_email_classifier_worker();$$
);
