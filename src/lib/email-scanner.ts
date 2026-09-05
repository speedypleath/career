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
    const maxQueued = Math.max(
      0,
      Number(process.env.EMAIL_CLASSIFIER_MAX_CALLS_PER_SCAN ?? MAX_QUEUED_CLASSIFICATIONS_PER_SCAN),
    )
    for (const msg of gogMessages) {
      result.scannedCount++
      const messageId = msg.id || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
      const sender = msg.from || msg.sender || ""
      const subject = msg.subject || ""
      const body = bodies.get(msg.id) || msg.snippet || ""
      const snippet = (body || msg.snippet || "").slice(0, 300)
      const verdict = await classifyEmailDetailed({ subject, body, sender })
      const classification = verdict.classification

      const extractedCompany = extractCompanyName(subject, sender, body)
      const extractedRole = extractJobTitle(subject, body)

      // Intelligent match to existing applications
      let matchedApp = findBestMatchingApplication(applications, {
        company: extractedCompany,
        role: extractedRole,
        sender,
        subject,
        body,
        snippet,
      })

      let matchedAppId = matchedApp ? matchedApp.id : null

      // Check if already in email_logs
      const existing = await query<EmailLog & { manual_override: boolean }>(
        `SELECT id, classification, application_id, manual_override, classification_state FROM email_logs WHERE message_id = $1`,
        [messageId]
      )

      if (verdict.source === "fallback" && result.queuedCount < maxQueued) {
        if (existing.rows.length > 0) {
          // At-least-once queue delivery plus the unique message id make
          // rescans idempotent. A pending or resolved row must not enqueue a
          // second paid inference request.
          continue
        }

        const emailLogId = randomUUID()
        const job = buildClassificationJob(
          { subject, body, sender },
          {
            emailLogId,
            messageId,
            applicationId: matchedAppId,
            sender,
            subject,
            company: extractedCompany,
            role: extractedRole,
            snippet,
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
            matchedAppId,
            messageId,
            sender,
            settings?.gmail_account || "",
            subject,
            snippet,
            body,
            classification,
            job.promptHash,
            job.estimatedInputTokens,
          ],
        )

        try {
          await enqueueClassificationJob(job)
          result.queuedCount++
          result.newEmails.push(pendingRes.rows[0])
          continue
        } catch (error) {
          // Remove the just-created pending row so the conservative fallback
          // below can complete normally instead of leaving a stuck job.
          await query(`DELETE FROM email_logs WHERE id = $1 AND classification_state = 'pending'`, [emailLogId])
          result.errors.push(
            `Could not enqueue ${messageId}; used deterministic fallback: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }

      if (classification === "unrelated" || classification === "conference") {
        result.skippedCount++
        if (existing.rows.length === 0) {
          const logRes = await query<EmailLog>(
            `INSERT INTO email_logs (application_id, message_id, sender, recipient, subject, snippet, body, classification, classification_state, classification_source, received_at)
             VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, 'resolved', $8, NOW())
             RETURNING *`,
            [messageId, sender, settings?.gmail_account || "", subject, snippet, body, classification, verdict.source]
          )
          result.newEmails.push(logRes.rows[0])
        } else {
          const existingRow = existing.rows[0]
          if (!existingRow.manual_override && (existingRow.classification !== classification || existingRow.application_id !== null)) {
            await query(
              `UPDATE email_logs SET classification = $1, application_id = NULL, classification_state = 'resolved', classification_source = $2 WHERE id = $3`,
              [classification, verdict.source, existingRow.id]
            )
          }
        }
        continue
      }

      if (existing.rows.length === 0) {
        // Auto-create an application ONLY when we have a valid, non-blacklisted company name
        const canCreateApp = extractedCompany !== "Unknown Company" && !BLACKLISTED_COMPANY_NAMES.has(extractedCompany.toLowerCase())

        if (!matchedAppId && canCreateApp) {
          const initStatus = statusForClassification(classification) ?? "applied"

          const newAppRes = await query<Application>(
            `INSERT INTO applications (title, company, workplace_type, status, application_method, contact_email, notes, priority, source, applied_at, created_at, updated_at)
             VALUES ($1, $2, 'remote', $3, 'email', $4, $5, 'medium', 'email_scanner', NOW(), NOW(), NOW())
             RETURNING *`,
            [extractedRole, extractedCompany, initStatus, isAtsSender(sender) ? "" : sender, `Auto-detected from email: "${subject}"`]
          )
          const newApp = newAppRes.rows[0]
          matchedApp = newApp
          matchedAppId = newApp.id
          applications.push(newApp)

          await query(
            `INSERT INTO application_events (application_id, event_type, title, description)
             VALUES ($1, 'email_created', 'Application Auto-Detected', $2)`,
            [matchedAppId, `Created application for ${extractedRole} at ${extractedCompany} from email: "${subject}"`]
          )
        }

        const logRes = await query<EmailLog>(
          `INSERT INTO email_logs (application_id, message_id, sender, recipient, subject, snippet, body, classification, received_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
           RETURNING *`,
          [matchedAppId, messageId, sender, settings?.gmail_account || "", subject, snippet, body, classification]
        )

        const logged = logRes.rows[0]
        result.newEmails.push(logged)

        if (matchedAppId) {
          result.matchedCount++

          // A "question" is the one case that depends on where the application
          // already stands: being asked for details while merely "applied"
          // means somebody is actually looking at it.
          const newStatus =
            classification === "question"
              ? matchedApp?.status === "applied"
                ? ("interview_pending" as ApplicationStatus)
                : null
              : statusForClassification(classification)

          if (newStatus && shouldAdvanceStatus(matchedApp?.status, newStatus)) {
            await query(`UPDATE applications SET status = $1, updated_at = NOW() WHERE id = $2`, [newStatus, matchedAppId])
            if (matchedApp) matchedApp.status = newStatus
          }

          // Add event to application timeline
          await query(
            `INSERT INTO application_events (application_id, event_type, title, description, metadata)
             VALUES ($1, 'email_received', $2, $3, $4)`,
            [
              matchedAppId,
              `Email received: ${classification.toUpperCase()}`,
              `Subject: "${subject}" from ${sender}`,
              JSON.stringify({ messageId, classification, snippet }),
            ]
          )
        }
      } else {
        // Already logged: re-run the classifier over it, but never overwrite a
        // human correction — that is the whole point of manual_override.
        const existingRow = existing.rows[0]
        const locked = existingRow.manual_override === true
        const effectiveClass = locked ? existingRow.classification : classification

        const needUpdateClass = !locked && existingRow.classification !== classification
        const needUpdateApp = !existingRow.application_id && !!matchedAppId

        if (needUpdateClass || needUpdateApp) {
          const finalAppId = matchedAppId || existingRow.application_id
          await query(
            `UPDATE email_logs SET classification = $1, application_id = $2, body = COALESCE(NULLIF($3, ''), body) WHERE id = $4`,
            [effectiveClass, finalAppId, body, existingRow.id]
          )

          if (finalAppId) {
            const app = applications.find((a) => a.id === finalAppId)
            const newStatus = statusForClassification(effectiveClass as EmailClassification)
            if (newStatus && shouldAdvanceStatus(app?.status, newStatus)) {
              await query(`UPDATE applications SET status = $1, updated_at = NOW() WHERE id = $2`, [newStatus, finalAppId])
              if (app) app.status = newStatus
            }
          }
        }
      }
    }

    // Update last_synced_at
    await query(`UPDATE email_settings SET last_synced_at = NOW() WHERE id = 'default'`)
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err))
  }

  return result
}
