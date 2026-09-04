/**
 * Offline evaluation harness for the email classifier.
 *
 *   node scripts/eval-classifier.ts            # summary + all changes
 *   node scripts/eval-classifier.ts --only interview
 *   node scripts/eval-classifier.ts --reasons  # print rule hits per change
 *
 * Reads every row in email_logs, re-classifies it with the current engine and
 * diffs against what is stored, so regressions are visible before a rescan.
 */
import { Client } from "pg"
import { classifyEmailDetailed } from "../src/lib/email-classifier.ts"

const args = process.argv.slice(2)
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null
const showReasons = args.includes("--reasons")
/** Persist the new verdicts. Rows a human corrected are left alone. */
const write = args.includes("--write")

const client = new Client({
  host: process.env.PGHOST ?? "127.0.0.1",
  port: Number(process.env.PGPORT ?? 5432),
  user: process.env.PGUSER ?? "postgres",
  password: process.env.PGPASSWORD ?? "postgres",
  database: process.env.PGDATABASE ?? "career",
})

await client.connect()

const { rows } = await client.query<{
  id: string
  subject: string
  sender: string
  body: string
  snippet: string
  classification: string
  manual_override: boolean
}>(
  `SELECT id, subject, sender, body, snippet, classification, manual_override
   FROM email_logs ORDER BY received_at DESC`
)

const matrix = new Map<string, number>()
const changes: Array<{ subject: string; sender: string; from: string; to: string; conf: number; reasons: string[] }> = []

let skippedLocked = 0

for (const row of rows) {
  const result = await classifyEmailDetailed({
    subject: row.subject || "",
    body: row.body || row.snippet || "",
    sender: row.sender || "",
  })

  const key = `${row.classification} -> ${result.classification}`
  matrix.set(key, (matrix.get(key) ?? 0) + 1)

  if (result.classification !== row.classification) {
    if (row.manual_override) {
      skippedLocked++
      continue
    }
    if (write) {
      await client.query(`UPDATE email_logs SET classification = $1 WHERE id = $2`, [
        result.classification,
        row.id,
      ])
    }
    changes.push({
      subject: row.subject,
      sender: row.sender,
      from: row.classification,
      to: result.classification,
      conf: result.confidence,
      reasons: result.reasons,
    })
  }
}

console.log(`\nEvaluated ${rows.length} stored emails\n`)
console.log("Transitions (stored -> new):")
for (const [key, count] of [...matrix.entries()].sort((a, b) => b[1] - a[1])) {
  const stable = key.split(" -> ")[0] === key.split(" -> ")[1]
  console.log(`  ${stable ? "=" : "~"} ${key.padEnd(32)} ${count}`)
}

const shown = only ? changes.filter((c) => c.to === only || c.from === only) : changes
console.log(`\n${changes.length} changed${only ? ` (showing ${shown.length} for "${only}")` : ""}:\n`)

for (const c of shown) {
  console.log(`  ${c.from} -> ${c.to} [${c.conf}]`)
  console.log(`    ${c.subject.slice(0, 96)}`)
  console.log(`    ${c.sender.slice(0, 70)}`)
  if (showReasons) for (const r of c.reasons.slice(0, 8)) console.log(`      · ${r}`)
  console.log()
}

if (skippedLocked) console.log(`${skippedLocked} row(s) left alone (manual_override).`)
console.log(write ? `Applied ${changes.length} change(s).` : `Dry run. Re-run with --write to apply.`)

await client.end()
