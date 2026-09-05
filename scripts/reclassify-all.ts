// Bulk re-run the deterministic classifier over every email_log, fixing
// historical misclassifications (spam/newsletters → unrelated, conferences →
// conference) and unlinking/deleting bogus applications.
import { createClient } from "./lib/db-config.ts"
import { classifyEmailDetailed } from "../src/lib/email-classifier.ts"
import { buildClassificationJob } from "../src/lib/email-classification-queue.ts"
import { deleteBogusApplications } from "./lib/bogus-apps.ts"

const client = createClient("supabase")

async function main() {
  await client.connect()
  console.log("Connected.")

  const { rows: emails } = await client.query<{
    id: string; sender: string; subject: string; body: string | null; snippet: string | null;
    application_id: string | null; manual_override: boolean;
  }>(`SELECT id, sender, subject, body, snippet, application_id, manual_override
      FROM email_logs ORDER BY created_at ASC`)

  console.log(`Fetched ${emails.length} emails.`)

  let resolved = 0, queued = 0, skipped = 0
  for (const e of emails) {
    if (e.manual_override) { skipped++; continue }
    const content = e.body || e.snippet || ""
    const verdict = await classifyEmailDetailed({ sender: e.sender, subject: e.subject, body: content })

    if (verdict.source === "fallback") {
      // Needs the LLM. Queue only if not already resolved.
      if (verdict.classification === "unrelated" || verdict.classification === "conference") {
        // deterministic conference fallback still resolves without model
        await client.query(
          `UPDATE email_logs SET classification=$1, application_id=NULL,
             classification_state='resolved', classification_source=$2,
             classification_error=NULL, classified_at=NOW() WHERE id=$3`,
          [verdict.classification, "rule", e.id],
        )
        resolved++
      } else {
        try {
          const job = buildClassificationJob(
            { sender: e.sender, subject: e.subject, body: content },
            {
              emailLogId: e.id, messageId: "", applicationId: e.application_id,
              sender: e.sender, subject: e.subject,
              company: "Unknown Company", role: "Unknown Role", snippet: (e.snippet || content).slice(0, 300),
            },
          )
          await client.query(`SELECT pgmq.send('email_classification_jobs', $1::jsonb)`, [JSON.stringify(job)])
          await client.query(
            `UPDATE email_logs SET classification_state='pending', classification_source='queue',
               classification_error=NULL WHERE id=$1`, [e.id])
          queued++
        } catch { skipped++ }
      }
      continue
    }

    // Deterministic gate/rule result
    const isNonJob = verdict.classification === "unrelated" || verdict.classification === "conference"
    await client.query(
      `UPDATE email_logs SET classification=$1,
         application_id=CASE WHEN $4 THEN NULL ELSE application_id END,
         classification_state='resolved', classification_source=$2,
         classification_error=NULL, classified_at=NOW() WHERE id=$3`,
      [verdict.classification, verdict.source, e.id, isNonJob],
    )
    resolved++
  }

  console.log(`Done. resolved=${resolved} queued=${queued} skipped=${skipped}`)

  // Clean up bogus applications (canonical list — see scripts/lib/bogus-apps.ts)
  const bogus = await deleteBogusApplications((text, params) => client.query(text, params))
  console.log(bogus.length ? `Deleted ${bogus.length} bogus applications.` : "No bogus applications found.")

  const { rows: counts } = await client.query(`SELECT classification, count(*) FROM email_logs GROUP BY 1 ORDER BY 2 DESC`)
  console.log("Final classification counts:", counts)
  await client.end()
}

main().catch((err) => { console.error(err); process.exit(1) })
