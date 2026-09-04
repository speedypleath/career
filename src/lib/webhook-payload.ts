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

export function normalizeWebhookPayload(body: Payload): WebhookApplication {
  const lower = (value: string, fallback: string) => (value || fallback).toLowerCase()

  return {
    // Trimmed because these two are what an existing application is matched on,
    // and because a title of "   " used to pass the required-field check and
    // create a blank application.
    title: pick(body, "title", "jobTitle", "position").trim(),
    company: pick(body, "company", "companyName").trim(),

    // Lowercased: these four are compared against fixed sets downstream.
    workplace_type: lower(pick(body, "workplace_type", "workplaceType", "workplace"), "remote"),
    status: lower(pick(body, "status"), "applied"),
    application_method: lower(
      pick(body, "application_method", "applicationMethod", "method"),
      "portal",
    ),
    priority: lower(pick(body, "priority"), "medium"),

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
