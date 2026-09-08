import { createClient } from "../lib/db/client.ts"
import { classifyEmailDetailed } from "../lib/email-classifier.ts"
import { buildClassificationJob } from "../lib/email-classification-queue.ts"

const client = createClient("hosted-supabase")
await client.connect()
try {
  const { rows: failedEmails } = await client.query<{
    id: string; message_id: string; application_id: string | null; sender: string; subject: string
    snippet: string; body: string; company?: string; app_title?: string
  }>(`SELECT m.id, m.message_id, m.application_id, m.sender, m.subject, m.snippet, m.body,
         a.company, a.title as app_title
      FROM email_logs m LEFT JOIN applications a ON a.id = m.application_id
      WHERE m.classification_state = 'failed'`)

  console.log(`Found ${failedEmails.length} failed email logs to re-process.`)
  let queuedCount = 0
  let resolvedDirectly = 0
  for (const email of failedEmails) {
    const content = email.body || email.snippet || ""
    let matchedAppId = email.application_id
    let matchedAppCompany = email.company
    let matchedAppTitle = email.app_title
    if (!matchedAppId) {
      const apps = await client.query<{ id: string; company: string; title: string }>(`SELECT id, company, title FROM applications`)
      const contentLower = `${email.sender} ${email.subject} ${content}`.toLowerCase()
      const matched = apps.rows.find((app) => contentLower.includes(app.company.toLowerCase()))
      matchedAppId = matched?.id ?? null
      matchedAppCompany = matched?.company
      matchedAppTitle = matched?.title
    }

    const verdict = await classifyEmailDetailed({ subject: email.subject, body: content, sender: email.sender })
    if (verdict.source === "fallback") {
      const job = buildClassificationJob(
        { subject: email.subject, body: content, sender: email.sender },
        { emailLogId: email.id, messageId: email.message_id, applicationId: matchedAppId, sender: email.sender, subject: email.subject, company: matchedAppCompany || "Unknown Company", role: matchedAppTitle || "Unknown Role", snippet: (email.snippet || content).slice(0, 300) },
      )
      await client.query(
        `UPDATE email_logs SET application_id = COALESCE($1, application_id), classification = $2,
         classification_state = 'pending', classification_source = 'queue', classifier_prompt_hash = $3,
         classifier_prompt_tokens = $4, classification_error = NULL, manual_override = FALSE,
         classified_at = NULL WHERE id = $5`,
        [matchedAppId, verdict.classification, job.promptHash, job.estimatedInputTokens, email.id],
      )
      await client.query(`SELECT pgmq.send('email_classification_jobs', $1::jsonb)`, [JSON.stringify(job)])
      queuedCount++
    } else {
      await client.query(
        `UPDATE email_logs SET application_id = COALESCE($1, application_id), classification = $2,
         classification_state = 'resolved', classification_source = 'deterministic',
         classification_error = NULL, manual_override = FALSE, classified_at = NOW() WHERE id = $3`,
        [matchedAppId, verdict.classification, email.id],
      )
      resolvedDirectly++
    }
  }
  console.log(`Re-queued: ${queuedCount}, Resolved directly: ${resolvedDirectly}`)
} finally {
  await client.end()
}
