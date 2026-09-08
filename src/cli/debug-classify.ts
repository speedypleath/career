import { createClient } from "../lib/db/client.ts"
import { classifyEmailDetailed, normalizeEmail, parseSender } from "../lib/email-classifier.ts"

const needle = process.argv[2]
if (!needle) { console.error('usage: npm run classifier:debug -- "<subject fragment>"'); process.exit(1) }

const client = createClient("career-local")
await client.connect()
const { rows } = await client.query<{ subject: string; sender: string; body: string; snippet: string; classification: string }>(
  `SELECT subject, sender, body, snippet, classification FROM email_logs WHERE subject ILIKE $1 LIMIT 3`,
  [`%${needle}%`],
)
for (const row of rows) {
  const norm = normalizeEmail(row.subject, row.body || row.snippet || "")
  const result = await classifyEmailDetailed({ subject: row.subject, body: row.body || row.snippet || "", sender: row.sender })
  console.log("=".repeat(80))
  console.log("subject :", row.subject)
  console.log("sender  :", row.sender, JSON.stringify(parseSender(row.sender)))
  console.log("stored  :", row.classification, "-> new:", result.classification, `(${result.confidence})`)
  console.log("scores  :", JSON.stringify(result.scores))
  console.log("process section at:", norm.processSectionAt)
  console.log("links   :", norm.links.slice(0, 6))
  console.log("-- normalised body --\n", norm.body.slice(0, 1200))
  console.log("-- reasons --")
  for (const reason of result.reasons) console.log("  ·", reason)
  console.log()
}
await client.end()
