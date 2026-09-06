import { query } from "../db"
import { prisma } from "../prisma"
import type { EmailLog } from "@/types"
import { buildLogUpdate } from "./email-logs-update.ts"
import type { LogPatch } from "./email-logs-update.ts"

export { buildLogUpdate, MANUAL_CLASSIFICATION_FIELDS } from "./email-logs-update.ts"
export type { LogPatch } from "./email-logs-update.ts"

const LIST_LIMIT = 100

export type EmailLogWithApplication = EmailLog & { company: string | null; app_title: string | null }

export interface LogFilters {
  classification?: string | null
  search?: string | null
  excludeUnrelated?: boolean
  needsFollowUp?: boolean
}

/** Classifications that put an email on the Follow-ups tab — a direct ask or a scheduling reply. */
const FOLLOW_UP_CLASSIFICATIONS = ["assessment", "question", "interview"]

/**
 * Deliberately raw SQL, not Prisma.
 *
 * The search term has to match against the joined application's company as
 * well as the log's own columns. Prisma can express that, but only as a
 * relation filter that reads far less clearly than the OR it compiles to.
 */
export async function findAll(filters: LogFilters = {}): Promise<EmailLogWithApplication[]> {
  const conditions: string[] = []
  const params: unknown[] = []

  if (filters.classification && filters.classification !== "all") {
    params.push(filters.classification)
    conditions.push(`m.classification = $${params.length}`)
  }

  // A user filtering explicitly to "unrelated" wins over the toggle — AND-ing
  // the two would always return zero rows.
  if (filters.excludeUnrelated && filters.classification !== "unrelated") {
    conditions.push(`m.classification != 'unrelated'`)
  }

  if (filters.search) {
    params.push(`%${filters.search}%`)
    const p = `$${params.length}`
    conditions.push(
      `(m.sender ILIKE ${p} OR m.subject ILIKE ${p} OR m.snippet ILIKE ${p} OR a.company ILIKE ${p})`,
    )
  }

  if (filters.needsFollowUp) {
    params.push(FOLLOW_UP_CLASSIFICATIONS)
    conditions.push(`m.classification = ANY($${params.length}) AND m.follow_up_done = false`)
  }

  params.push(LIST_LIMIT)

  const res = await query<EmailLogWithApplication>(
    `
      SELECT
        m.*,
        a.company,
        a.title as app_title
      FROM email_logs m
      LEFT JOIN applications a ON a.id = m.application_id
      ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
      ORDER BY m.received_at DESC, m.created_at DESC
      LIMIT $${params.length}
    `,
    params,
  )
  return res.rows
}

export async function update(id: string, patch: LogPatch): Promise<EmailLog | null> {
  const data = buildLogUpdate(patch)
  if (!data) return null
  return (await prisma.email_logs.update({ where: { id }, data })) as unknown as EmailLog
}

export type EmailLogJoined = EmailLog & { company?: string | null; app_title?: string | null }

const WITH_APPLICATION = `
  SELECT m.*, a.company, a.title as app_title
  FROM email_logs m
  LEFT JOIN applications a ON a.id = m.application_id
  WHERE m.id = $1
`

export async function findWithApplication(id: string): Promise<EmailLogJoined | null> {
  const res = await query<EmailLogJoined>(WITH_APPLICATION, [id])
  return res.rows[0] ?? null
}

export async function findIdsByApplication(applicationId: string): Promise<string[]> {
  const res = await query<{ id: string }>(
    `SELECT id FROM email_logs WHERE application_id = $1 ORDER BY received_at DESC`,
    [applicationId],
  )
  return res.rows.map((row) => row.id)
}

export interface ScannedEmail {
  id: string
  applicationId: string | null
  messageId: string
  sender: string
  recipient: string
  subject: string
  snippet: string
  body: string
  classification: string
  state: string
  source: string
  promptHash: string | null
  promptTokens: number | null
  receivedAt: string
}

/**
 * Insert an ingested message, or re-resolve one already seen.
 *
 * The conflict arm is where the manual-override invariant is enforced for this
 * path: every classification column keeps its stored value when
 * manual_override is set, so re-ingesting a message cannot undo a human's
 * correction. application_id is the exception — it is COALESCEd, so a link can
 * still be added, never removed.
 *
 * follow_up_done also resets on this path (manual_override still respected):
 * a rescan that reclassifies a message into a follow-up-eligible type clears
 * a stale "handled" flag from its previous classification, so it reappears in
 * the Follow-ups tab instead of silently staying dismissed.
 */
export async function upsertScanned(email: ScannedEmail): Promise<EmailLog> {
  const res = await query<EmailLog>(
    `INSERT INTO email_logs (
         id, application_id, message_id, sender, recipient, subject, snippet, body,
         classification, classification_state, classification_source,
         classifier_prompt_hash, classifier_prompt_tokens, received_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (message_id) DO UPDATE SET
         application_id = COALESCE($2, email_logs.application_id),
         classification = CASE WHEN email_logs.manual_override THEN email_logs.classification ELSE $9 END,
         classification_state = CASE WHEN email_logs.manual_override THEN email_logs.classification_state ELSE $10 END,
         classification_source = CASE WHEN email_logs.manual_override THEN email_logs.classification_source ELSE $11 END,
         classifier_prompt_hash = CASE WHEN email_logs.manual_override THEN email_logs.classifier_prompt_hash ELSE $12 END,
         classifier_prompt_tokens = CASE WHEN email_logs.manual_override THEN email_logs.classifier_prompt_tokens ELSE $13 END,
         follow_up_done = CASE
           WHEN email_logs.manual_override THEN email_logs.follow_up_done
           WHEN $9 = ANY($15) AND email_logs.classification IS DISTINCT FROM $9 THEN false
           ELSE email_logs.follow_up_done
         END
       RETURNING *`,
    [
      email.id,
      email.applicationId,
      email.messageId,
      email.sender,
      email.recipient,
      email.subject,
      email.snippet,
      email.body,
      email.classification,
      email.state,
      email.source,
      email.promptHash,
      email.promptTokens,
      email.receivedAt,
      FOLLOW_UP_CLASSIFICATIONS,
    ],
  )
  return res.rows[0]
}

/** Record that the queue would not take a job, so the row is not left pending forever. */
export async function markQueueFailed(id: string, message: string): Promise<void> {
  await query(
    `UPDATE email_logs
     SET classification_state = 'failed', classification_source = 'fallback', classification_error = $1
     WHERE id = $2`,
    [message.slice(0, 500), id],
  )
}

/** A reanalysis that could not be decided deterministically and went to the queue. */
export async function markReanalysisQueued(
  id: string,
  input: { applicationId: string | null; classification: string; promptHash: string; promptTokens: number },
): Promise<void> {
  await query(
    `UPDATE email_logs
     SET application_id = COALESCE($1, application_id),
         classification = $2,
         classification_state = 'pending',
         classification_source = 'queue',
         classifier_prompt_hash = $3,
         classifier_prompt_tokens = $4,
         classification_error = NULL,
         manual_override = FALSE,
         classified_at = NULL
     WHERE id = $5`,
    [input.applicationId, input.classification, input.promptHash, input.promptTokens, id],
  )
}

/** A reanalysis that a gate or rule decided outright. */
export async function markReanalysisResolved(
  id: string,
  input: { applicationId: string | null; classification: string; source: string },
): Promise<void> {
  await query(
    `UPDATE email_logs
     SET application_id = $1,
         classification = $2,
         classification_state = 'resolved',
         classification_source = $3,
         classification_error = NULL,
         manual_override = FALSE,
         classified_at = NOW()
     WHERE id = $4`,
    [input.applicationId, input.classification, input.source, id],
  )
}
