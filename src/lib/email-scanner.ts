import { randomUUID } from "node:crypto"
import { query } from "./db"
import { OWNER_EMAIL } from "./owner"
import { classifyEmailDetailed } from "./email-classifier"
import type { EmailClassification } from "./email-classifier"
import {
  MAX_QUEUED_CLASSIFICATIONS_PER_SCAN,
  buildClassificationJob,
  enqueueClassificationJob,
} from "./email-classification-queue"
import type { Application, ApplicationStatus, EmailLog } from "@/types"
import {
  BLACKLISTED_COMPANY_NAMES,
  shouldAdvanceStatus,
  statusForClassification,
} from "./email/status.ts"
import { extractCompanyName, extractJobTitle, isAtsSender } from "./email/extract.ts"
import { findBestMatchingApplication } from "./email/matching.ts"
import { hydrateBodies, searchMessages } from "./email/gog.ts"

export { classifyEmail, classifyEmailDetailed } from "./email-classifier"
export type { EmailClassification, ClassificationResult } from "./email-classifier"

export interface ScanResult {
  source: string
  scannedCount: number
  matchedCount: number
  queuedCount: number
  /** Messages the classifier judged to be unrelated to any application. */
  skippedCount: number
  newEmails: EmailLog[]
  errors: string[]
}

/**
 * Everything one message contributes to a decision. Built once per message in
 * the loop below, then handed to whichever handler that message's branch picks.
 *
 * `matchedApp` is mutable because handleNewEmail may create the application it
 * then links the log to.
 */
interface Candidate {
  messageId: string
  sender: string
  subject: string
  body: string
  snippet: string
  verdict: Awaited<ReturnType<typeof classifyEmailDetailed>>
  classification: EmailClassification
  company: string
  role: string
  matchedApp: Application | null
  existing: (EmailLog & { manual_override: boolean }) | null
}

/** The scan's own state, shared across every message in one run. */
interface ScanState {
  applications: Application[]
  /** The mailbox that was scanned; stored as each log's recipient. */
  recipient: string
  maxQueued: number
  result: ScanResult
}

/**
 * Ambiguous mail: persist it as pending and hand it to the queue.
 *
 * Returns true when the message is fully dealt with — either it was already
 * logged, or the job is on the queue. Returns false when the enqueue failed,
 * which drops the message through to the deterministic branches below so it
 * still gets a conservative answer instead of being stranded.
 */
async function handleQueuedFallback(state: ScanState, c: Candidate): Promise<boolean> {
  // At-least-once queue delivery plus the unique message id make rescans
  // idempotent. A pending or resolved row must not enqueue a second paid
  // inference request.
  if (c.existing) return true

  const emailLogId = randomUUID()
  const job = buildClassificationJob(
    { subject: c.subject, body: c.body, sender: c.sender },
    {
      emailLogId,
      messageId: c.messageId,
      applicationId: c.matchedApp?.id ?? null,
      sender: c.sender,
      subject: c.subject,
      company: c.company,
      role: c.role,
      snippet: c.snippet,
    },
  )

  const pendingRes = await query<EmailLog>(
    `INSERT INTO email_logs (
       id, application_id, message_id, sender, recipient, subject, snippet, body,
       classification, classification_state, classification_source,
       classifier_prompt_hash, classifier_prompt_tokens, received_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', 'queue', $10, $11, NOW())
     RETURNING *`,
    [
      emailLogId,
      c.matchedApp?.id ?? null,
      c.messageId,
      c.sender,
      state.recipient,
      c.subject,
      c.snippet,
      c.body,
      c.classification,
      job.promptHash,
      job.estimatedInputTokens,
    ],
  )

  try {
    await enqueueClassificationJob(job)
    state.result.queuedCount++
    state.result.newEmails.push(pendingRes.rows[0])
    return true
  } catch (error) {
    // Remove the just-created pending row so the conservative fallback can
    // complete normally instead of leaving a stuck job.
    await query(`DELETE FROM email_logs WHERE id = $1 AND classification_state = 'pending'`, [emailLogId])
    state.result.errors.push(
      `Could not enqueue ${c.messageId}; used deterministic fallback: ${error instanceof Error ? error.message : String(error)}`,
    )
    return false
  }
}

/** Mail that belongs to no application: logged, unlinked, never advancing anything. */
async function handleSkipped(state: ScanState, c: Candidate): Promise<void> {
  state.result.skippedCount++

  if (!c.existing) {
    const logRes = await query<EmailLog>(
      `INSERT INTO email_logs (application_id, message_id, sender, recipient, subject, snippet, body, classification, classification_state, classification_source, received_at)
       VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, 'resolved', $8, NOW())
       RETURNING *`,
      [c.messageId, c.sender, state.recipient, c.subject, c.snippet, c.body, c.classification, c.verdict.source],
    )
    state.result.newEmails.push(logRes.rows[0])
    return
  }

  const existingRow = c.existing
  if (
    !existingRow.manual_override &&
    (existingRow.classification !== c.classification || existingRow.application_id !== null)
  ) {
    await query(
      `UPDATE email_logs SET classification = $1, application_id = NULL, classification_state = 'resolved', classification_source = $2 WHERE id = $3`,
      [c.classification, c.verdict.source, existingRow.id],
    )
  }
}

/** First sighting: link it, create the application if there is one to create, advance status. */
async function handleNewEmail(state: ScanState, c: Candidate): Promise<void> {
  // Auto-create an application ONLY when we have a valid, non-blacklisted company name
  const canCreateApp =
    c.company !== "Unknown Company" && !BLACKLISTED_COMPANY_NAMES.has(c.company.toLowerCase())

  if (!c.matchedApp && canCreateApp) {
    const initStatus = statusForClassification(c.classification) ?? "applied"

    const newAppRes = await query<Application>(
      `INSERT INTO applications (title, company, workplace_type, status, application_method, contact_email, notes, priority, source, applied_at, created_at, updated_at)
       VALUES ($1, $2, 'remote', $3, 'email', $4, $5, 'medium', 'email_scanner', NOW(), NOW(), NOW())
       RETURNING *`,
      [c.role, c.company, initStatus, isAtsSender(c.sender) ? "" : c.sender, `Auto-detected from email: "${c.subject}"`],
    )
    const newApp = newAppRes.rows[0]
    c.matchedApp = newApp
    state.applications.push(newApp)

    await query(
      `INSERT INTO application_events (application_id, event_type, title, description)
       VALUES ($1, 'email_created', 'Application Auto-Detected', $2)`,
      [newApp.id, `Created application for ${c.role} at ${c.company} from email: "${c.subject}"`],
    )
  }

  const matchedAppId = c.matchedApp?.id ?? null

  const logRes = await query<EmailLog>(
    `INSERT INTO email_logs (application_id, message_id, sender, recipient, subject, snippet, body, classification, received_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     RETURNING *`,
    [matchedAppId, c.messageId, c.sender, state.recipient, c.subject, c.snippet, c.body, c.classification],
  )

  state.result.newEmails.push(logRes.rows[0])

  if (!matchedAppId) return

  state.result.matchedCount++

  // A "question" is the one case that depends on where the application already
  // stands: being asked for details while merely "applied" means somebody is
  // actually looking at it.
  const newStatus =
    c.classification === "question"
      ? c.matchedApp?.status === "applied"
        ? ("interview_pending" as ApplicationStatus)
        : null
      : statusForClassification(c.classification)

  if (newStatus && shouldAdvanceStatus(c.matchedApp?.status, newStatus)) {
    await query(`UPDATE applications SET status = $1, updated_at = NOW() WHERE id = $2`, [newStatus, matchedAppId])
    if (c.matchedApp) c.matchedApp.status = newStatus
  }

  await query(
    `INSERT INTO application_events (application_id, event_type, title, description, metadata)
     VALUES ($1, 'email_received', $2, $3, $4)`,
    [
      matchedAppId,
      `Email received: ${c.classification.toUpperCase()}`,
      `Subject: "${c.subject}" from ${c.sender}`,
      JSON.stringify({ messageId: c.messageId, classification: c.classification, snippet: c.snippet }),
    ],
  )
}

/**
 * Already logged: re-run the classifier over it, but never overwrite a human
 * correction — that is the whole point of manual_override.
 */
async function handleExistingEmail(state: ScanState, c: Candidate): Promise<void> {
  const existingRow = c.existing!
  const locked = existingRow.manual_override === true
  const effectiveClass = locked ? existingRow.classification : c.classification

  const needUpdateClass = !locked && existingRow.classification !== c.classification
  const needUpdateApp = !existingRow.application_id && !!c.matchedApp

  if (!needUpdateClass && !needUpdateApp) return

  const finalAppId = c.matchedApp?.id ?? existingRow.application_id
  await query(
    `UPDATE email_logs SET classification = $1, application_id = $2, body = COALESCE(NULLIF($3, ''), body) WHERE id = $4`,
    [effectiveClass, finalAppId, c.body, existingRow.id],
  )

  if (!finalAppId) return

  const app = state.applications.find((a) => a.id === finalAppId)
  const newStatus = statusForClassification(effectiveClass as EmailClassification)
  if (newStatus && shouldAdvanceStatus(app?.status, newStatus)) {
    await query(`UPDATE applications SET status = $1, updated_at = NOW() WHERE id = $2`, [newStatus, finalAppId])
    if (app) app.status = newStatus
  }
}

/**
 * One pass over the mailbox. The branch order below is load-bearing: queued
 * fallback first, then the classifications that belong to no application, then
 * first sightings, then rescans.
 */
export async function scanEmails(): Promise<ScanResult> {
  const result: ScanResult = {
    source: "local-scanner",
    scannedCount: 0,
    matchedCount: 0,
    queuedCount: 0,
    skippedCount: 0,
    newEmails: [],
    errors: [],
  }

  try {
    // 1. Fetch all current applications to correlate
    const appsRes = await query<Application>(`SELECT id, company, title, contact_email, status FROM applications`)
    const applications = appsRes.rows

    // 2. Fetch email settings
    const settingsRes = await query<{
      imap_host: string
      imap_port: number
      imap_user: string
      imap_password?: string
      imap_tls: boolean
      gmail_account: string
    }>(`SELECT * FROM email_settings WHERE id = 'default'`)
    const settings = settingsRes.rows[0]

    // 3. Scan via the gog CLI. Transport failures come back in errors[] rather
    // than thrown, so "blocked" stays distinguishable from "no mail".
    const gogAccount = settings?.gmail_account || OWNER_EMAIL
    const { messages: gogMessages, errors: searchErrors } = await searchMessages(gogAccount)
    result.errors.push(...searchErrors)

    // 3b. Hydrate message bodies. An unreadable message is skipped, not fatal.
    const bodies = await hydrateBodies(gogMessages, gogAccount)

    // 4. Deterministic decisions are applied immediately. Ambiguous messages
    // are persisted as pending and queued for the Supabase Edge Function.
    const state: ScanState = {
      applications,
      recipient: settings?.gmail_account || "",
      maxQueued: Math.max(
        0,
        Number(process.env.EMAIL_CLASSIFIER_MAX_CALLS_PER_SCAN ?? MAX_QUEUED_CLASSIFICATIONS_PER_SCAN),
      ),
      result,
    }

    for (const msg of gogMessages) {
      result.scannedCount++
      const messageId = msg.id || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
      const sender = msg.from || msg.sender || ""
      const subject = msg.subject || ""
      const body = bodies.get(msg.id) || msg.snippet || ""
      const snippet = (body || msg.snippet || "").slice(0, 300)
      const verdict = await classifyEmailDetailed({ subject, body, sender })
      const classification = verdict.classification

      const company = extractCompanyName(subject, sender, body)
      const role = extractJobTitle(subject, body)

      const existing = await query<EmailLog & { manual_override: boolean }>(
        `SELECT id, classification, application_id, manual_override, classification_state FROM email_logs WHERE message_id = $1`,
        [messageId],
      )

      const candidate: Candidate = {
        messageId,
        sender,
        subject,
        body,
        snippet,
        verdict,
        classification,
        company,
        role,
        matchedApp: findBestMatchingApplication(applications, {
          company,
          role,
          sender,
          subject,
          body,
          snippet,
        }),
        existing: existing.rows[0] ?? null,
      }

      if (verdict.source === "fallback" && result.queuedCount < state.maxQueued) {
        if (await handleQueuedFallback(state, candidate)) continue
      }

      if (classification === "unrelated" || classification === "conference") {
        await handleSkipped(state, candidate)
        continue
      }

      if (!candidate.existing) await handleNewEmail(state, candidate)
      else await handleExistingEmail(state, candidate)
    }

    // Update last_synced_at
    await query(`UPDATE email_settings SET last_synced_at = NOW() WHERE id = 'default'`)
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err))
  }

  return result
}
