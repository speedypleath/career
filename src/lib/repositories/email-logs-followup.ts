import { randomUUID } from "node:crypto"

/**
 * Building a custom follow-up row, with no database imports.
 *
 * Same split as email-logs-update.ts: this is the validation half, kept
 * importable by `node --test` and Jest without pulling in `pg`/Prisma. The
 * repository's insert is a thin, untested wrapper around whatever this
 * returns.
 */

/** Mirrors FOLLOW_UP_CLASSIFICATIONS in email-logs.ts — the server-side gate
 * a row has to pass to actually show up on the Follow-ups tab. A custom
 * follow-up that didn't pass this would insert fine and then silently never
 * appear anywhere, so it's enforced here rather than left to the caller. */
const FOLLOW_UP_CLASSIFICATIONS = ["assessment", "question", "interview"]

export interface CustomFollowUpInput {
  title: string
  link: string
  company?: string
  notes?: string
  classification?: string
  application_id?: string | null
}

export interface CustomFollowUpRow {
  id: string
  application_id: string | null
  message_id: string
  sender: string
  recipient: string
  subject: string
  snippet: string
  body: string
  classification: string
  classification_state: "resolved"
  classification_source: "manual"
  manual_override: true
}

const SNIPPET_CHARS = 300

/** A short "sender" label from the link's host, so the row reads like where
 * the form lives rather than a blank manual sender. Falls back to "manual"
 * for a link that doesn't parse as a URL. */
function senderFromLink(link: string): string {
  try {
    return new URL(link).hostname
  } catch {
    return "manual"
  }
}

/**
 * Returns an error string when the input is unusable, otherwise the row to
 * insert.
 *
 * manual_override is set to true at creation, not just on a later reclassify
 * — this row has no real inbox message behind it, so nothing downstream
 * (reanalyze, a rescan) should be able to reclassify it out from under
 * whoever created it. The reanalyze route already bails out on this flag for
 * exactly that reason.
 */
export function buildCustomFollowUp(
  input: CustomFollowUpInput,
  recipient: string,
): CustomFollowUpRow | string {
  const title = input.title?.trim()
  const link = input.link?.trim()

  if (!title) return "'title' is required"
  if (!link) return "'link' is required"

  const classification = input.classification || "question"
  if (!FOLLOW_UP_CLASSIFICATIONS.includes(classification)) {
    return `'classification' must be one of ${FOLLOW_UP_CLASSIFICATIONS.join(", ")}`
  }

  const subject = input.company ? `${title} — ${input.company}` : title
  const body = input.notes ? `${link}\n\n${input.notes}` : link

  return {
    id: randomUUID(),
    application_id: input.application_id || null,
    message_id: `manual-followup-${randomUUID()}`,
    sender: senderFromLink(link),
    recipient,
    subject,
    snippet: link.slice(0, SNIPPET_CHARS),
    body,
    classification,
    classification_state: "resolved",
    classification_source: "manual",
    manual_override: true,
  }
}
