-- Migration 202609040003: Add conference category and prevent spurious application creation

-- 1. Update check constraint on email_classification_cache
alter table public.email_classification_cache
  drop constraint if exists email_classification_cache_classification_check;

alter table public.email_classification_cache
  add constraint email_classification_cache_classification_check
  check (classification in ('unrelated', 'confirmation', 'interview', 'assessment', 'question', 'rejection', 'offer', 'conference'));

-- 2. Update finalize_email_classification RPC with strict validation
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
  extracted_company text;
  extracted_role text;
begin
  if resolved_classification not in ('unrelated', 'confirmation', 'interview', 'assessment', 'question', 'rejection', 'offer', 'conference') then
    raise exception 'invalid email classification: %', resolved_classification;
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
  extracted_company := trim(coalesce(payload ->> 'company', ''));
  extracted_role := trim(coalesce(payload ->> 'role', ''));

  if resolved_classification in ('unrelated', 'conference') then
    final_app_id := null;
  elsif final_app_id is null and extracted_company <> '' and lower(extracted_company) not in (
    'unknown company', 'unknown role', 'unknown', 'linkedin', 'google forms', 'forms response receipts',
    'niv news', 'ground news', 'groundnews', 'joburi hipo', 'joburi hipo.ro', 'hipo', 'hipo.ro',
    'andrei gheorghe', 'gheorgheandrei13', 'smartrecruiters', 'greenhouse', 'workable', 'ashby', 'lever',
    'ziyue piao', 'adcx', 'ismir', 'news', 'newsletter'
  ) then
    insert into public.applications (
      title, company, workplace_type, status, application_method, contact_email,
      notes, priority, source, applied_at, created_at, updated_at
    ) values (
      coalesce(nullif(extracted_role, ''), 'Software Engineer'),
      extracted_company,
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

  if final_app_id is not null and resolved_classification not in ('unrelated', 'conference') then
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
