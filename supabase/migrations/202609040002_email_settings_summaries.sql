-- email_settings: scanner config table the app reads on every scan.
-- The local row carries no credentials (imap_* are empty), only a gmail address.
create table if not exists public.email_settings (
  id text primary key default 'default',
  imap_host text not null default '',
  imap_port integer not null default 993,
  imap_user text not null default '',
  imap_password text not null default '',
  imap_tls boolean not null default true,
  gmail_account text not null default '',
  auto_sync boolean not null default true,
  sync_interval_mins integer not null default 60,
  last_synced_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.email_settings (
  id, imap_port, imap_tls, gmail_account, auto_sync, sync_interval_mins, last_synced_at, updated_at
) values (
  'default', 993, true, 'gheorgheandrei13@gmail.com', true, 60,
  '2026-09-04T04:46:10.760501+00', '2026-08-22T12:01:31.470117+00'
)
on conflict (id) do nothing;

alter table public.email_settings enable row level security;
revoke all on public.email_settings from anon, authenticated;

-- email_summaries: one deterministic summary per classified email log.
-- Written by finalize_email_classification (no second model call).
create table if not exists public.email_summaries (
  id uuid primary key default gen_random_uuid(),
  email_log_id uuid not null unique references public.email_logs(id) on delete cascade,
  classification text not null,
  summary text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.email_summaries enable row level security;
revoke all on public.email_summaries from anon, authenticated;

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
  summary_text text;
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

  summary_text :=
    case resolved_classification
      when 'offer' then 'Offer from ' || coalesce(nullif(payload ->> 'company', ''), 'unknown company') || ' for ' || coalesce(nullif(payload ->> 'role', ''), 'the role') || ' (' || coalesce(payload ->> 'subject', 'no subject') || ')'
      when 'rejection' then 'Rejection from ' || coalesce(nullif(payload ->> 'company', ''), 'unknown company') || ' (' || coalesce(payload ->> 'subject', 'no subject') || ')'
      when 'interview' then 'Interview scheduled or requested: ' || coalesce(payload ->> 'subject', 'no subject')
      when 'assessment' then 'Assessment requested: ' || coalesce(payload ->> 'subject', 'no subject')
      when 'question' then 'Question from ' || coalesce(nullif(payload ->> 'sender', ''), 'recruiter') || ': ' || coalesce(payload ->> 'subject', 'no subject')
      when 'confirmation' then 'Application confirmed: ' || coalesce(payload ->> 'subject', 'no subject')
      else 'Email logged as unrelated: ' || coalesce(payload ->> 'subject', 'no subject')
    end;

  insert into public.email_summaries (email_log_id, classification, summary, updated_at)
  values (email_row.id, resolved_classification, summary_text, now())
  on conflict (email_log_id)
  do update set classification = excluded.classification,
                summary = excluded.summary,
                updated_at = now();

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
