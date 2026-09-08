import type { QueryResultRow } from "pg"
import { classifyEmailDetailed } from "../email-classifier.ts"
import { buildClassificationJob } from "../email-classification-queue.ts"
import { deleteBogusApplications } from "./bogus-applications.ts"

export type MaintenanceQuery = (text: string, params?: unknown[]) => Promise<{ rows: QueryResultRow[] }>

export interface ReclassificationSummary {
  fetched: number
  resolved: number
  queued: number
  skipped: number
  deletedApplications: number
  counts: Array<{ classification: string; count: number }>
}

export async function reclassifyStoredEmails(query: MaintenanceQuery): Promise<ReclassificationSummary> {
  const { rows: emails } = await query(`
    SELECT id, sender, subject, body, snippet, application_id, manual_override
    FROM email_logs ORDER BY created_at ASC
  `)

  let resolved = 0
  let queued = 0
  let skipped = 0

  for (const email of emails) {
    if (email.manual_override) {
      skipped++
      continue
    }

    const content = email.body || email.snippet || ""
    const verdict = await classifyEmailDetailed({
      sender: email.sender,
      subject: email.subject,
      body: content,
    })

    if (verdict.source === "fallback") {
      if (verdict.classification === "unrelated" || verdict.classification === "conference") {
        await query(
          `UPDATE email_logs
           SET classification=$1, application_id=NULL, classification_state='resolved',
               classification_source=$2, classification_error=NULL, classified_at=NOW()
           WHERE id=$3`,
          [verdict.classification, "rule", email.id],
        )
        resolved++
        continue
      }

      try {
        const job = buildClassificationJob(
          { sender: email.sender, subject: email.subject, body: content },
          {
            emailLogId: email.id,
            messageId: "",
            applicationId: email.application_id,
            sender: email.sender,
            subject: email.subject,
            company: "Unknown Company",
            role: "Unknown Role",
            snippet: (email.snippet || content).slice(0, 300),
          },
        )
        await query(`SELECT pgmq.send('email_classification_jobs', $1::jsonb)`, [JSON.stringify(job)])
        await query(
          `UPDATE email_logs
           SET classification_state='pending', classification_source='queue',
               classification_error=NULL WHERE id=$1`,
          [email.id],
        )
        queued++
      } catch {
        skipped++
      }
      continue
    }

    const unattached = verdict.classification === "unrelated" || verdict.classification === "conference"
    await query(
      `UPDATE email_logs
       SET classification=$1,
           application_id=CASE WHEN $4 THEN NULL ELSE application_id END,
           classification_state='resolved', classification_source=$2,
           classification_error=NULL, classified_at=NOW()
       WHERE id=$3`,
      [verdict.classification, verdict.source, email.id, unattached],
    )
    resolved++
  }

  const bogus = await deleteBogusApplications(query)
  const { rows: counts } = await query(
    `SELECT classification, count(*)::int AS count
     FROM email_logs GROUP BY classification ORDER BY count DESC`,
  )

  return {
    fetched: emails.length,
    resolved,
    queued,
    skipped,
    deletedApplications: bogus.length,
    counts,
  }
}
