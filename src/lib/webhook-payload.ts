/**
 * Normalizing an inbound webhook payload.
 *
 * This is the one endpoint written for callers nobody here controls — a cron
 * job, an agent, a script someone wrote once — so each field accepts several
 * spellings. No database imports, so the aliases can be tested directly.
 */

export interface WebhookApplication {
  title: string
  company: string
  workplace_type: string
  location: string
  status: string
  application_method: string
  url: string
  job_description: string
  info_provided: string
  cover_letter: string
  salary: string
  contact_email: string
  contact_name: string
  notes: string
  priority: string
  source: string
  applied_at: string
}

type Payload = Record<string, unknown>

/** The first alias that carries a non-empty value wins. */
function pick(body: Payload, ...keys: string[]): string {
  for (const key of keys) {
    const value = body[key]
    if (value !== undefined && value !== null && value !== "") return String(value)
  }
  return ""
}

/**
 * Normalize without filling anything in.
 *
 * A field the caller did not send stays empty here, which is what lets the
 * merge statement's COALESCE(NULLIF($n, ''), column) guard mean what it says.
 * Defaults are applied separately, on the create path only.
 */
export function normalizeWebhookPayload(body: Payload): WebhookApplication {
  const lower = (value: string) => value.toLowerCase()

  return {
    // Trimmed because these two are what an existing application is matched on,
    // and because a title of "   " used to pass the required-field check and
    // create a blank application.
    title: pick(body, "title", "jobTitle", "position").trim(),
    company: pick(body, "company", "companyName").trim(),

    // Lowercased: these four are compared against fixed sets downstream. Left
    // empty when absent — see withCreateDefaults.
    workplace_type: lower(pick(body, "workplace_type", "workplaceType", "workplace")),
    status: lower(pick(body, "status")),
    application_method: lower(pick(body, "application_method", "applicationMethod", "method")),
    priority: lower(pick(body, "priority")),

    location: pick(body, "location", "city"),
    url: pick(body, "url", "jobUrl", "link"),
    job_description: pick(body, "job_description", "jobDescription", "description"),
    info_provided: pick(body, "info_provided", "infoProvided", "providedInfo"),
    cover_letter: pick(body, "cover_letter", "coverLetter", "letter"),
    salary: pick(body, "salary", "compensation"),
    contact_email: pick(body, "contact_email", "contactEmail", "email"),
    contact_name: pick(body, "contact_name", "contactName"),
    notes: pick(body, "notes", "comment"),
    source: pick(body, "source") || "webhook",
    applied_at: pick(body, "applied_at", "appliedAt") || new Date().toISOString(),
  }
}

/**
 * The defaults for a brand new application.
 *
 * These used to be applied inside normalizeWebhookPayload, before the route
 * knew whether it was creating an application or merging into one that already
 * exists. That defeated the merge guard entirely: an omitted status arrived as
 * "applied" rather than "", so COALESCE(NULLIF(...)) saw a real value and
 * overwrote whatever the application had reached. A caller re-reporting a
 * posting with only a url reset status, workplace_type, priority and
 * application_method — dragging an application at "interviewing" back to
 * "applied", the rewind the pipeline forbids everywhere else.
 */
export const CREATE_DEFAULTS = {
  workplace_type: "remote",
  status: "applied",
  application_method: "portal",
  priority: "medium",
} as const

export function withCreateDefaults(input: WebhookApplication): WebhookApplication {
  return {
    ...input,
    workplace_type: input.workplace_type || CREATE_DEFAULTS.workplace_type,
    status: input.status || CREATE_DEFAULTS.status,
    application_method: input.application_method || CREATE_DEFAULTS.application_method,
    priority: input.priority || CREATE_DEFAULTS.priority,
  }
}
