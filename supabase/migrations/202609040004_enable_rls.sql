-- Lock the anon and authenticated roles out of the app tables.
--
-- These three tables were fully exposed: anyone holding the project's anon key
-- could read or modify every row (229 applications, 561 events, 309 email logs).
--
-- No policies are created on purpose. A policy GRANTS access; with RLS enabled
-- and zero policies, anon and authenticated can do nothing. The app is
-- unaffected because src/lib/db.ts connects over direct Postgres as the
-- `postgres` role, which has rolbypassrls = true. Verified before writing this:
--
--   rolname        rolsuper  rolbypassrls
--   anon           f         f
--   authenticated  f         f
--   postgres       f         t
--
-- The Deno worker (supabase/functions/email-classifier-worker) reaches these
-- tables through the finalize_email_classification RPC using the service_role
-- key; service_role also has rolbypassrls = true, so it is unaffected too.
--
-- To roll back: alter table <name> disable row level security;

alter table public.applications       enable row level security;
alter table public.application_events enable row level security;
alter table public.email_logs         enable row level security;
