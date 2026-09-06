-- Two untracked bits of drift on email_settings, both surfaced by cross-AI
-- review of feature/follow-ups-tab-and-webhook-settings:
--
-- 1. gmail_account's column default had been set (outside any migration) to
--    the owner's real address, which `prisma db pull` then faithfully copied
--    into prisma/schema.prisma and committed to git. Reset it to the same
--    empty-string placeholder src/lib/schema.sql has always declared for a
--    fresh install, so the next db:pull stops reintroducing the leak.
alter table email_settings alter column gmail_account set default '';

-- 2. imap_host, imap_port, imap_user, imap_password, imap_tls, auto_sync and
--    sync_interval_mins had their NOT NULL constraints dropped on the hosted
--    database at some point with no migration recording it. This is not being
--    reverted: src/lib/schema.sql — the source of truth for these tables —
--    never declared NOT NULL on any of them either, so the hosted DB's actual
--    nullability already matches the app's intent. This migration exists only
--    to make that state explicit and reproducible rather than leaving it as
--    silent drift a future db:pull could reintroduce without explanation.
alter table email_settings
  alter column imap_host drop not null,
  alter column imap_port drop not null,
  alter column imap_user drop not null,
  alter column imap_password drop not null,
  alter column imap_tls drop not null,
  alter column auto_sync drop not null,
  alter column sync_interval_mins drop not null;
