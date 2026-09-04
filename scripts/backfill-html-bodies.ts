/**
 * One-off backfill: flatten email_logs rows whose body/snippet were stored as
 * raw HTML before the scanner learned to normalise gog's pre-joined `body`.
 *
 *   node scripts/backfill-html-bodies.ts          # report only
 *   node scripts/backfill-html-bodies.ts --write  # apply
 */
import { Client } from "pg"

const write = process.argv.includes("--write")

function htmlToText(input: string): string {
  return input
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

const client = new Client({
  host: process.env.PGHOST ?? "127.0.0.1",
  port: Number(process.env.PGPORT ?? 5432),
  user: process.env.PGUSER ?? "postgres",
  password: process.env.PGPASSWORD ?? "postgres",
  database: process.env.PGDATABASE ?? "career",
})

await client.connect()

const { rows } = await client.query<{ id: string; subject: string; body: string; snippet: string }>(
  `SELECT id, subject, body, snippet FROM email_logs
   WHERE body ~* '<!DOCTYPE|<html|<body|<table|<div'
      OR snippet ~* '<!DOCTYPE|<html|<body|<table|<div'`
)

console.log(`${rows.length} row(s) with raw HTML\n`)

for (const row of rows) {
  const cleanBody = htmlToText(row.body || "")
  const cleanSnippet = (cleanBody || htmlToText(row.snippet || "")).slice(0, 300)

  console.log(`  ${row.subject.slice(0, 70)}`)
  console.log(`    -> ${cleanSnippet.slice(0, 100).replace(/\n/g, " ")}`)

  if (write) {
    await client.query(`UPDATE email_logs SET body = $1, snippet = $2 WHERE id = $3`, [
      cleanBody,
      cleanSnippet,
      row.id,
    ])
  }
}

console.log(write ? `\nUpdated ${rows.length} row(s).` : `\nDry run. Re-run with --write to apply.`)

await client.end()
