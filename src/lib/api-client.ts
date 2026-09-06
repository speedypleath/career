import type {
  Application,
  ApplicationStatus,
  EmailLog,
  EmailSettings,
  Stats,
} from "@/types"

/**
 * One typed function per endpoint.
 *
 * Twenty-two inline fetch calls were spread across six components, each with
 * its own idea of how to read an error: some checked res.ok, some checked a
 * field in the body, some did neither and let a failed request look like an
 * empty result. request() does it once — every route answers with { error }
 * on failure, so that is the message a caller gets.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    cache: "no-store",
    ...init,
    ...(init?.body ? { headers: { "Content-Type": "application/json", ...init.headers } } : {}),
  })

  const body = await res.json().catch(() => null)

  if (!res.ok) {
    throw new ApiError(body?.error || `Request failed (HTTP ${res.status})`, res.status)
  }

  return body as T
}

const json = (data: unknown) => JSON.stringify(data)

// ── applications ────────────────────────────────────────────────────────────

export interface ApplicationQuery {
  status?: string
  workplace?: string
  search?: string
  sort?: string
}

export async function getApplications(query: ApplicationQuery = {}): Promise<Application[]> {
  const params = new URLSearchParams(
    Object.entries(query).filter(([, v]) => v) as [string, string][],
  )
  const suffix = params.toString() ? `?${params}` : ""
  const data = await request<{ applications: Application[] }>(`/api/applications${suffix}`)
  return data.applications ?? []
}

/**
 * One application with everything the detail view needs. The route always
 * returns all three collections, so they are required here even though they
 * are optional on Application itself (the list route omits them).
 */
export type ApplicationDetail = Application &
  Required<Pick<Application, "events" | "emails" | "suggestedEmails">>

export async function getApplication(id: string): Promise<ApplicationDetail> {
  const data = await request<{ application: ApplicationDetail }>(`/api/applications/${id}`)
  return data.application
}

export async function createApplication(input: Partial<Application>): Promise<Application> {
  const data = await request<{ application: Application }>("/api/applications", {
    method: "POST",
    body: json(input),
  })
  return data.application
}

/** `note_entry` is not a column — it asks the server to add a timeline entry. */
export async function updateApplication(
  id: string,
  patch: Partial<Application> & { note_entry?: string },
): Promise<Application> {
  const data = await request<{ application: Application }>(`/api/applications/${id}`, {
    method: "PATCH",
    body: json(patch),
  })
  return data.application
}

export function updateApplicationStatus(
  id: string,
  status: ApplicationStatus,
): Promise<Application> {
  return updateApplication(id, { status })
}

export function deleteApplication(id: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/applications/${id}`, { method: "DELETE" })
}

// ── stats ───────────────────────────────────────────────────────────────────

export async function getStats(): Promise<Stats> {
  const data = await request<{ stats: Stats }>("/api/stats")
  return data.stats
}

// ── email ───────────────────────────────────────────────────────────────────

export interface EmailQuery {
  classification?: string
  search?: string
  excludeUnrelated?: boolean
  needsFollowUp?: boolean
}

export async function getEmailLogs(query: EmailQuery = {}): Promise<EmailLog[]> {
  const params = new URLSearchParams(
    Object.entries(query).filter(([, v]) => v) as [string, string][],
  )
  const suffix = params.toString() ? `?${params}` : ""
  const data = await request<{ emails: EmailLog[] }>(`/api/email/logs${suffix}`)
  return data.emails ?? []
}

/**
 * Setting a classification by hand marks the log as a manual override, which
 * every other writer in the pipeline then refuses to overwrite. It is not an
 * ordinary field update, hence its own name.
 */
export async function setEmailClassification(
  id: string,
  classification: string,
): Promise<EmailLog> {
  const data = await request<{ email: EmailLog }>("/api/email/logs", {
    method: "PATCH",
    body: json({ id, classification }),
  })
  return data.email
}

export async function linkEmailToApplication(
  id: string,
  applicationId: string | null,
): Promise<EmailLog> {
  const data = await request<{ email: EmailLog }>("/api/email/logs", {
    method: "PATCH",
    body: json({ id, application_id: applicationId }),
  })
  return data.email
}

/** Marks (or unmarks) a follow-up as handled — persisted, independent of classification. */
export async function setFollowUpDone(id: string, done: boolean): Promise<EmailLog> {
  const data = await request<{ email: EmailLog }>("/api/email/logs", {
    method: "PATCH",
    body: json({ id, follow_up_done: done }),
  })
  return data.email
}

export interface ScanResult {
  scannedCount: number
  matchedCount: number
  queuedCount: number
  skippedCount: number
  newEmails: EmailLog[]
  /**
   * A scan that returns no mail AND a populated errors[] means blocked, not
   * "nothing new" — gog missing, or its token expired. Callers must show these
   * rather than reporting an empty scan.
   */
  errors: string[]
  source?: string
}

export function scanEmails(): Promise<ScanResult> {
  return request<ScanResult>("/api/email/scan")
}

export interface ReanalyzeResult {
  queued: boolean
  /** True when the log carried a human's classification and was left untouched. */
  skipped: boolean
  email: EmailLog
}

export function reanalyzeEmail(id: string): Promise<ReanalyzeResult> {
  return request<ReanalyzeResult>("/api/email/reanalyze", { method: "POST", body: json({ id }) })
}

export interface BulkReanalyzeResult {
  reanalyzedCount: number
  skippedCount: number
  emails: EmailLog[]
  application: Application | null
}

export function reanalyzeApplicationEmails(applicationId: string): Promise<BulkReanalyzeResult> {
  return request<BulkReanalyzeResult>("/api/email/reanalyze", {
    method: "POST",
    body: json({ applicationId }),
  })
}

// ── settings ────────────────────────────────────────────────────────────────

export async function getEmailSettings(): Promise<EmailSettings> {
  const data = await request<{ settings: EmailSettings }>("/api/email/settings")
  return data.settings
}

export async function updateEmailSettings(
  patch: Partial<EmailSettings> & { imap_password?: string },
): Promise<EmailSettings> {
  const data = await request<{ settings: EmailSettings }>("/api/email/settings", {
    method: "PATCH",
    body: json(patch),
  })
  return data.settings
}

// ── webhook ─────────────────────────────────────────────────────────────────

export interface WebhookInfo {
  name: string
  description: string
  endpoint: string
  sample_payload: Record<string, unknown>
  curl_example: string
}

export function getWebhookInfo(): Promise<WebhookInfo> {
  return request<WebhookInfo>("/api/webhook/application")
}

export function postWebhookApplication(
  payload: Record<string, unknown>,
): Promise<{ success: boolean; action: string; id: string; application: Application }> {
  return request("/api/webhook/application", { method: "POST", body: json(payload) })
}

export interface IngestInput {
  sender: string
  subject: string
  body?: string
  snippet?: string
  application_id?: string
  classification?: string
  message_id?: string
}

/** Feed a single message through the same classifier the scanner uses. */
export async function ingestEmail(input: IngestInput): Promise<EmailLog> {
  const data = await request<{ email: EmailLog }>("/api/email/scan", {
    method: "POST",
    body: json(input),
  })
  return data.email
}
