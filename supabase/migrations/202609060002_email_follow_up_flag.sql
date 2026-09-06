alter table email_logs add column if not exists follow_up_done boolean not null default false;
