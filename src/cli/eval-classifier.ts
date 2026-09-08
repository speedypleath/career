import { createClient } from "../lib/db/client.ts"
import { classifyEmailDetailed } from "../lib/email-classifier.ts"

const args = process.argv.slice(2)
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null
const showReasons = args.includes("--reasons")
const write = args.includes("--write")
const client = createClient("career-local")

await client.connect()
const { rows } = await client.query<{
  id: string; subject: string; sender: string; body: string; snippet: string
  classification: string; manual_override: boolean
}>(`SELECT id, subject, sender, body, snippet, classification, manual_override
   FROM email_logs ORDER BY received_at DESC`)

const matrix = new Map<string, number>()
const changes: Array<{ subject: string; sender: string; from: string; to: string; conf: number; reasons: string[] }> = []
let skippedLocked = 0

for (const row of rows) {
  const result = await classifyEmailDetailed({ subject: row.subject || "", body: row.body || row.snippet || "", sender: row.sender || "" })
  const key = `${row.classification} -> ${result.classification}`
  matrix.set(key, (matrix.get(key) ?? 0) + 1)
  if (result.classification === row.classification) continue
  if (row.manual_override) { skippedLocked++; continue }
  if (write) await client.query(`UPDATE email_logs SET classification = $1 WHERE id = $2`, [result.classification, row.id])
  changes.push({ subject: row.subject, sender: row.sender, from: row.classification, to: result.classification, conf: result.confidence, reasons: result.reasons })
}

console.log(`\nEvaluated ${rows.length} stored emails\n`)
console.log("Transitions (stored -> new):")
for (const [key, count] of [...matrix.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${key.split(" -> ")[0] === key.split(" -> ")[1] ? "=" : "~"} ${key.padEnd(32)} ${count}`)
}
const shown = only ? changes.filter((change) => change.to === only || change.from === only) : changes
console.log(`\n${changes.length} changed${only ? ` (showing ${shown.length} for "${only}")` : ""}:\n`)
for (const change of shown) {
  console.log(`  ${change.from} -> ${change.to} [${change.conf}]`)
  console.log(`    ${change.subject.slice(0, 96)}`)
  console.log(`    ${change.sender.slice(0, 70)}`)
  if (showReasons) for (const reason of change.reasons.slice(0, 8)) console.log(`      · ${reason}`)
  console.log()
}
if (skippedLocked) console.log(`${skippedLocked} row(s) left alone (manual_override).`)
console.log(write ? `Applied ${changes.length} change(s).` : `Dry run. Re-run with --write to apply.`)
await client.end()
