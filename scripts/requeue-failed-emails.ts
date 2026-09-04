import { Client } from "pg"
import { classifyEmailDetailed } from "../src/lib/email-classifier.ts"
import { buildClassificationJob } from "../src/lib/email-classification-queue.ts"

const client = new Client({
  host: process.env.PGHOST ?? "aws-1-eu-west-1.pooler.supabase.com",
  port: Number(process.env.PGPORT ?? 5432),
  user: process.env.PGUSER ?? "postgres.mvmteuwwvahkicsybxsl",
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE ?? "postgres",
  ssl: { rejectUnauthorized: false },
})

await client.connect()

console.log("Connected to Supabase PostgreSQL.")

// 1. Fetch all failed email logs
const { rows: failedEmails } = await client.query<{
  id: string
  message_id: string
  application_id: string | null
  sender: string
  subject: string
  snippet: string
  body: string
  company?: string
  app_title?: string
}>(`
  SELECT m.id, m.message_id, m.application_id, m.sender, m.subject, m.snippet, m.body,
         a.company, a.title as app_title
  FROM email_logs m
  LEFT JOIN applications a ON a.id = m.application_id
  WHERE m.classification_state = 'failed'
`)

console.log(`Found ${failedEmails.length} failed email logs to re-process.`)

if (failedEmails.length === 0) {
  console.log("No failed emails found.")
  await client.end()
  process.exit(0)
}

let queuedCount = 0
let resolvedDirectly = 0

for (const email of failedEmails) {
  const content = email.body || email.snippet || ""

  let matchedAppId = email.application_id
  let matchedAppCompany = email.company
  let matchedAppTitle = email.app_title

  if (!matchedAppId) {
    const apps = await client.query<{ id: string; company: string; title: string }>(
      `SELECT id, company, title FROM applications`
    )
    for (const app of apps.rows) {
      const cLower = app.company.toLowerCase()
      if (
        email.sender.toLowerCase().includes(cLower) ||
        email.subject.toLowerCase().includes(cLower) ||
        content.toLowerCase().includes(cLower)
      ) {
        matchedAppId = app.id
        matchedAppCompany = app.company
        matchedAppTitle = app.title
        break
      }
    }
  }

  const verdict = await classifyEmailDetailed({
    subject: email.subject,
    body: content,
    sender: email.sender,
  })

  if (verdict.source === "fallback") {
    const job = buildClassificationJob(
      { subject: email.subject, body: content, sender: email.sender },
      {
        emailLogId: email.id,
        messageId: email.message_id,
        applicationId: matchedAppId,
        sender: email.sender,
        subject: email.subject,
        company: matchedAppCompany || "Unknown Company",
        role: matchedAppTitle || "Unknown Role",
        snippet: (email.snippet || content).slice(0, 300),
      }
    )

    await client.query(
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
      [matchedAppId, verdict.classification, job.promptHash, job.estimatedInputTokens, email.id]
    )

    await client.query(
      `SELECT pgmq.send('email_classification_jobs', $1::jsonb)`,
      [JSON.stringify(job)]
    )

    queuedCount++
    console.log(`[QUEUED] ${email.id} - ${email.subject}`)
  } else {
    await client.query(
      `UPDATE email_logs
       SET application_id = COALESCE($1, application_id),
           classification = $2,
           classification_state = 'resolved',
           classification_source = 'deterministic',
           classification_error = NULL,
           manual_override = FALSE,
           classified_at = NOW()
       WHERE id = $3`,
      [matchedAppId, verdict.classification, email.id]
    )

    resolvedDirectly++
    console.log(`[RESOLVED DETERMINISTICALLY] ${email.id} -> ${verdict.classification} - ${email.subject}`)
  }
}

console.log(`Re-queued: ${queuedCount}, Resolved directly: ${resolvedDirectly}`)

// 2. Trigger edge function until queue is empty
const secrets = await client.query<{ name: string; decrypted_secret: string }>(
  `SELECT name, decrypted_secret FROM vault.decrypted_secrets`
)
const secretMap = Object.fromEntries(secrets.rows.map(r => [r.name, r.decrypted_secret]))
const edgeUrl = `${secretMap.project_url}/functions/v1/email-classifier-worker`

console.log(`Processing queue via Edge Function: ${edgeUrl}`)

let done = false
let iterations = 0
while (!done && iterations < 10) {
  iterations++
  const resp = await fetch(edgeUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretMap.anon_key}`,
      "Content-Type": "application/json",
    },
  })
  const resJson = await resp.json()
  console.log(`Worker iteration ${iterations}:`, resJson)
  if (resJson.read === 0 || (resJson.completed === 0 && resJson.retried === 0 && resJson.archived === 0)) {
    done = true
  }
}

// 3. Check final states of the emails
const { rows: finalLogs } = await client.query<{
  id: string
  subject: string
  classification: string
  classification_state: string
  classification_source: string
  classification_error: string | null
}>(`
  SELECT id, subject, classification, classification_state, classification_source, classification_error
  FROM email_logs
  WHERE id = ANY($1)
  ORDER BY classified_at DESC NULLS LAST
`, [failedEmails.map(e => e.id)])

console.log("\n=== Final Status for the 13 Emails ===")
for (const log of finalLogs) {
  console.log(`- [${log.classification_state.toUpperCase()}] (${log.classification_source}) -> "${log.classification}": "${log.subject}" ${log.classification_error ? `(Error: ${log.classification_error})` : ''}`)
}

await client.end()
