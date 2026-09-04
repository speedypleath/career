export type WorkplaceType = "remote" | "hybrid" | "on-site"

export type ApplicationStatus =
  | "wishlist"
  | "applied"
  | "interview_pending"
  | "interviewing"
  | "technical_assessment"
  | "offer"
  | "rejected"
  | "archived"

export type ApplicationMethod =
  | "portal"
  | "email"
  | "linkedin"
  | "referral"
  | "recruiter"
  | "other"

export type PriorityLevel = "low" | "medium" | "high" | "top"

export interface Application {
  id: string
  title: string
  company: string
  workplace_type: WorkplaceType
  location: string
  status: ApplicationStatus
  application_method: ApplicationMethod
  url: string
  job_description: string
  info_provided: string
  cover_letter: string
  salary: string
  contact_email: string
  contact_name: string
  notes: string
  priority: PriorityLevel
  source: string
  applied_at: string
  created_at: string
  updated_at: string
  events?: ApplicationEvent[]
  emails?: EmailLog[]
  suggestedEmails?: EmailLog[]
  events_count?: number
  emails_count?: number
  latest_event_title?: string
  latest_event_time?: string
}

export interface ApplicationEvent {
  id: string
  application_id: string
  event_type: "status_change" | "email_received" | "interview_scheduled" | "note_added" | "created" | "updated"
  title: string
  description: string
  metadata?: Record<string, unknown>
  created_at: string
}

export interface EmailLog {
  id: string
  application_id: string | null
  message_id: string
  sender: string
  recipient: string
  subject: string
  snippet: string
  body: string
  classification:
    | "confirmation"
    | "interview"
    | "assessment"
    | "rejection"
    | "question"
    | "offer"
    | "unrelated"
    | "conference"
  classification_state?: "pending" | "resolved" | "failed"
  classification_source?: "gate" | "rule" | "queue" | "cloudflare" | "cache" | "fallback" | "manual" | "legacy"
  classifier_prompt_hash?: string | null
  classifier_prompt_tokens?: number | null
  classifier_completion_tokens?: number | null
  classification_error?: string | null
  classified_at?: string | null
  /** Set when a human corrects the classification; rescans must not overwrite it. */
  manual_override: boolean
  received_at: string
  created_at: string
  company?: string
  app_title?: string
}

export interface EmailSettings {
  id: string
  imap_host: string
  imap_port: number
  imap_user: string
  imap_password?: string
  imap_tls: boolean
  gmail_account: string
  auto_sync: boolean
  sync_interval_mins: number
  last_synced_at: string | null
  updated_at: string
}

export interface Stats {
  total: number
  wishlist: number
  applied: number
  interviewPending: number
  interviewing: number
  techAssessment: number
  offers: number
  rejected: number
  archived: number
  remoteCount: number
  hybridCount: number
  onsiteCount: number
  portalCount: number
  emailCount: number
  linkedinCount: number
  otherMethodCount: number
  recentEvents: (ApplicationEvent & { company?: string; title_job?: string })[]
}

export type TabId = "overview" | "applications" | "kanban" | "emails" | "webhook" | "settings"
