/**
 * Inspect how one stored email flows through the classifier.
 *   node scripts/debug-classify.ts "<subject fragment>"
 */
import { Client } from "pg"
import { classifyEmailDetailed, normalizeEmail, parseSender } from "../src/lib/email-classifier.ts"

const needle = process.argv[2]
if (!needle) {
  console.error("usage: node scripts/debug-classify.ts \"<subject fragment>\"")
  process.exit(1)
}

const client = new Client({
  host: process.env.PGHOST ?? "127.0.0.1",
  port: Number(process.env.PGPORT ?? 5432),
  user: process.env.PGUSER ?? "postgres",
  password: process.env.PGPASSWORD ?? "postgres",
  database: process.env.PGDATABASE ?? "career",
})
await client.connect()

const { rows } = await client.query<{ subject: string; sender: string; body: string; snippet: string; classification: string }>(
  `SELECT subject, sender, body, snippet, classification FROM email_logs WHERE subject ILIKE $1 LIMIT 3`,
  [`%${needle}%`]
)

for (const row of rows) {
  const norm = normalizeEmail(row.subject, row.body || row.snippet || "")
  const result = classifyEmailDetailed({ subject: row.subject, body: row.body || row.snippet || "", sender: row.sender })

  console.log("=".repeat(80))
  console.log("subject :", row.subject)
  console.log("sender  :", row.sender, JSON.stringify(parseSender(row.sender)))
  console.log("stored  :", row.classification, "-> new:", result.classification, `(${result.confidence})`)
  console.log("scores  :", JSON.stringify(result.scores))
  console.log("process section at:", norm.processSectionAt)
  console.log("links   :", norm.links.slice(0, 6))
  console.log("-- normalised body --")
  console.log(norm.body.slice(0, 1200))
  console.log("-- reasons --")
  for (const r of result.reasons) console.log("  ·", r)
  console.log()
}

await client.end()
