-- Career Job Application Tracker Schema

CREATE TABLE IF NOT EXISTS applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  workplace_type TEXT NOT NULL DEFAULT 'remote', -- 'remote', 'hybrid', 'on-site'
  location TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'applied', -- 'wishlist', 'applied', 'interview_pending', 'interviewing', 'technical_assessment', 'offer', 'rejected', 'archived'
  application_method TEXT NOT NULL DEFAULT 'portal', -- 'portal', 'email', 'linkedin', 'referral', 'recruiter', 'other'
  url TEXT DEFAULT '',
  job_description TEXT DEFAULT '',
  info_provided TEXT DEFAULT '',
  cover_letter TEXT DEFAULT '',
  salary TEXT DEFAULT '',
  contact_email TEXT DEFAULT '',
  contact_name TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  priority TEXT DEFAULT 'medium', -- 'low', 'medium', 'high', 'top'
  source TEXT DEFAULT 'manual', -- 'manual', 'webhook', 'cron', 'email_import', 'linkedin'
  applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS application_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID REFERENCES applications(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'status_change', 'email_received', 'interview_scheduled', 'note_added', 'created'
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
  message_id TEXT UNIQUE,
  sender TEXT DEFAULT '',
  recipient TEXT DEFAULT '',
  subject TEXT DEFAULT '',
  snippet TEXT DEFAULT '',
  body TEXT DEFAULT '',
  classification TEXT DEFAULT 'unrelated', -- 'confirmation', 'interview', 'assessment', 'rejection', 'question', 'offer', 'unrelated'
  classification_state TEXT NOT NULL DEFAULT 'resolved', -- 'pending', 'resolved', 'failed'
  classification_source TEXT NOT NULL DEFAULT 'legacy',
  classifier_prompt_hash TEXT,
  classifier_prompt_tokens INTEGER,
  classifier_completion_tokens INTEGER,
  classification_error TEXT,
  classified_at TIMESTAMPTZ,
  -- Set when a human corrects the classification in the UI. Rescans leave these rows alone.
  manual_override BOOLEAN DEFAULT FALSE,
  received_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS manual_override BOOLEAN DEFAULT FALSE;
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS classification_state TEXT NOT NULL DEFAULT 'resolved';
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS classification_source TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS classifier_prompt_hash TEXT;
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS classifier_prompt_tokens INTEGER;
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS classifier_completion_tokens INTEGER;
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS classification_error TEXT;
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS classified_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS email_classification_cache (
  prompt_hash TEXT PRIMARY KEY,
  classification TEXT NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP + INTERVAL '30 days'
);

CREATE TABLE IF NOT EXISTS email_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  imap_host TEXT DEFAULT '',
  imap_port INTEGER DEFAULT 993,
  imap_user TEXT DEFAULT '',
  imap_password TEXT DEFAULT '',
  imap_tls BOOLEAN DEFAULT TRUE,
  gmail_account TEXT DEFAULT 'owner@example.com',
  auto_sync BOOLEAN DEFAULT TRUE,
  sync_interval_mins INTEGER DEFAULT 60,
  last_synced_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Summaries written by the classification worker, one per email log.
-- Added by supabase/migrations/202609040002_email_settings_summaries.sql; this
-- file had drifted and did not declare it.
CREATE TABLE IF NOT EXISTS email_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_log_id UUID NOT NULL UNIQUE REFERENCES email_logs(id) ON DELETE CASCADE,
  classification TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed default email settings if not present
INSERT INTO email_settings (id, gmail_account)
VALUES ('default', 'owner@example.com')
ON CONFLICT (id) DO NOTHING;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_company ON applications(company);
CREATE INDEX IF NOT EXISTS idx_applications_created_at ON applications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_application_events_app_id ON application_events(application_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_message_id ON email_logs(message_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_app_id ON email_logs(application_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_classification_state ON email_logs(classification_state, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_summaries_email_log_id ON email_summaries(email_log_id);
