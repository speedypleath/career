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
  classification TEXT DEFAULT 'unrelated', -- 'confirmation', 'interview', 'rejection', 'question', 'offer', 'unrelated'
  received_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
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
