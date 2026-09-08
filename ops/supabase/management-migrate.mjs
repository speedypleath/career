// Applies the career schema, data, migration, and Edge Function to Supabase through the
// Management API over HTTPS.
//
// This exists because protected OpenClaw store secrets can only be substituted into HTTPS
// traffic bound to an exact host. A direct Postgres connection on 5432 is out of scope for
// that mechanism, so a plain pg_restore/psql restore against :5432 cannot work from an agent
// lane — this script is the sole supported restore path.
// Every request here goes to api.supabase.com, which SUPABASE_ACCESS_TOKEN and
// SUPABASE_PROJECT_REF are already bound to.
//
// Run from a Gateway-hosted exec lane with secrets.egressProxy.enabled=true. The env values
// are opaque sentinels; the proxy swaps in the real credentials at egress. Never print them.

import { readFileSync } from "node:fs"
import { basename } from "node:path"

const accessToken = process.env.SUPABASE_ACCESS_TOKEN
const projectRef = process.env.SUPABASE_PROJECT_REF
if (!accessToken || !projectRef) {
  console.error("Missing protected Supabase configuration in this lane")
  process.exit(2)
}

const projectUrl = `https://api.supabase.com/v1/projects/${projectRef}`

// Values reaching stdout must never carry credential material, so strip sentinels and any
// literal env value before printing.
const secretValues = [accessToken, projectRef, process.env.CLOUDFLARE_API_TOKEN, process.env.CLOUDFLARE_ACCOUNT_ID]
  .filter((value) => typeof value === "string" && value.length > 0)

function scrub(text) {
  let output = String(text).replace(/oc-sent-v2\.[A-Za-z0-9_-]+\.end/g, "<sentinel>")
  for (const value of secretValues) output = output.split(value).join("<redacted>")
  return output
}

function log(...parts) {
  console.log(parts.map((part) => (typeof part === "string" ? scrub(part) : scrub(JSON.stringify(part)))).join(" "))
}

async function api(path, { method = "POST", body, headers = {} } = {}) {
  const response = await fetch(`${projectUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${accessToken}`, ...headers },
    body,
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${method} ${path} -> HTTP ${response.status}: ${scrub(text).slice(0, 600)}`)
  }
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function query(sql, readOnly = false) {
  return api(readOnly ? "/database/query/read-only" : "/database/query", {
    body: JSON.stringify({ query: sql }),
    headers: { "content-type": "application/json" },
  })
}

// pg_dump --column-inserts can emit values containing newlines and quotes, so splitting on
// lines would corrupt statements. Track quoting state instead.
function splitStatements(sql) {
  const statements = []
  let current = ""
  let quote = null // "'" | '"' | dollar tag | "--" | "/*"

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i]
    const rest = sql.slice(i)

    if (quote === "--") {
      current += char
      if (char === "\n") quote = null
      continue
    }
    if (quote === "/*") {
      current += char
      if (rest.startsWith("*/")) { current += "/"; i++; quote = null }
      continue
    }
    if (quote === "'" || quote === '"') {
      current += char
      if (char === quote) {
        if (sql[i + 1] === quote) { current += sql[++i] } // doubled escape stays inside
        else quote = null
      }
      continue
    }
    if (typeof quote === "string" && quote.startsWith("$")) {
      current += char
      if (rest.startsWith(quote)) { current += quote.slice(1); i += quote.length - 1; quote = null }
      continue
    }

    // Newer pg_dump emits psql meta-commands such as \restrict and \unrestrict. They are
    // client directives, not SQL, and the Management API rejects them. Drop them at the top
    // level only, so a backslash inside a value is never touched.
    if ((i === 0 || sql[i - 1] === "\n") && char === "\\") {
      const lineEnd = sql.indexOf("\n", i)
      i = lineEnd === -1 ? sql.length : lineEnd
      continue
    }

    if (rest.startsWith("--")) { quote = "--"; current += char; continue }
    if (rest.startsWith("/*")) { quote = "/*"; current += char; continue }
    if (char === "'" || char === '"') { quote = char; current += char; continue }
    const dollar = rest.match(/^\$[A-Za-z_]*\$/)
    if (dollar) { quote = dollar[0]; current += dollar[0]; i += dollar[0].length - 1; continue }

    if (char === ";") { if (current.trim()) statements.push(current.trim()); current = ""; continue }
    current += char
  }
  if (current.trim()) statements.push(current.trim())
  return statements
}

function batch(statements, maxBytes = 120_000, maxCount = 100) {
  const batches = []
  let current = []
  let bytes = 0
  for (const statement of statements) {
    const size = Buffer.byteLength(statement) + 2
    if (current.length && (bytes + size > maxBytes || current.length >= maxCount)) {
      batches.push(current)
      current = []
      bytes = 0
    }
    current.push(statement)
    bytes += size
  }
  if (current.length) batches.push(current)
  return batches
}

async function runFile(path, label) {
  const statements = splitStatements(readFileSync(path, "utf8"))
  const batches = batch(statements)
  log(`${label}: ${statements.length} statements in ${batches.length} request(s)`)
  for (const [index, group] of batches.entries()) {
    await query(group.join(";\n") + ";")
    log(`  ${label} batch ${index + 1}/${batches.length} applied (${group.length} statements)`)
  }
}

async function inventory() {
  const rows = await query(
    `select table_name, (xpath('/row/c/text()',
       query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text::bigint as rows
     from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'
     order by table_name`,
    true,
  )
  return rows
}

const [mode, ...args] = process.argv.slice(2)

if (mode === "check") {
  log("server:", await query("select current_database() as database, current_setting('server_version') as version", true))
  log("public tables:", await inventory())
  const extensions = await query(
    "select extname from pg_extension where extname in ('pgmq','pg_net','pg_cron','supabase_vault') order by extname",
    true,
  )
  log("extensions:", extensions)
} else if (mode === "restore") {
  const [schemaPath, dataPath] = args
  if (!schemaPath || !dataPath) throw new Error("Usage: restore <schema.sql> <data.sql>")
  const before = await inventory()
  const careerTables = new Set(["applications", "application_events", "email_logs"])
  const colliding = Array.isArray(before)
    ? before.filter((table) => careerTables.has(table.table_name))
    : []
  if (colliding.length > 0) {
    throw new Error(`Refusing to restore: career table(s) already exist: ${colliding.map((table) => table.table_name).join(", ")}.`)
  }
  await runFile(schemaPath, "schema")
  await runFile(dataPath, "data")
  log("after restore:", await inventory())
} else if (mode === "migrate") {
  const [migrationPath] = args
  if (!migrationPath) throw new Error("Usage: migrate <migration.sql>")
  const sql = readFileSync(migrationPath, "utf8")
  await api("/database/migrations", {
    body: JSON.stringify({ query: sql, name: basename(migrationPath).replace(/\.sql$/, "") }),
    headers: { "content-type": "application/json" },
  })
  log("migration applied:", basename(migrationPath))
} else if (mode === "deploy-function") {
  const [slug, entrypoint, ...extraFiles] = args
  if (!slug || !entrypoint) throw new Error("Usage: deploy-function <slug> <entrypoint.ts> [extra files...]")
  const form = new FormData()
  form.append(
    "metadata",
    new Blob([JSON.stringify({ name: slug, entrypoint_path: entrypoint, verify_jwt: true })], {
      type: "application/json",
    }),
  )
  for (const file of [entrypoint, ...extraFiles]) {
    form.append("file", new Blob([readFileSync(file)], { type: "application/typescript" }), file)
  }
  await api(`/functions/deploy?slug=${encodeURIComponent(slug)}`, { body: form })
  log("function deployed:", slug)
} else if (mode === "set-function-secrets") {
  // The Cloudflare values are sentinels here too; the proxy substitutes them into this body
  // on the way to api.supabase.com, so the real values are never in this process.
  const cloudflareToken = process.env.CLOUDFLARE_API_TOKEN
  const cloudflareAccount = process.env.CLOUDFLARE_ACCOUNT_ID
  if (!cloudflareToken || !cloudflareAccount) throw new Error("Missing Cloudflare configuration in this lane")
  await api("/secrets", {
    body: JSON.stringify([
      { name: "CLOUDFLARE_API_TOKEN", value: cloudflareToken },
      { name: "CLOUDFLARE_ACCOUNT_ID", value: cloudflareAccount },
    ]),
    headers: { "content-type": "application/json" },
  })
  log("Edge Function secrets set: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID")
} else if (mode === "split-check") {
  // Offline verification of the statement splitter against real dump files. Makes no requests.
  for (const path of args) {
    const statements = splitStatements(readFileSync(path, "utf8"))
    const groups = batch(statements)
    const unbalanced = statements.filter((s) => (s.match(/'/g) || []).length % 2 !== 0)
    log(
      `${basename(path)}: ${statements.length} statements, ${groups.length} batch(es), ` +
        `${unbalanced.length} with odd quote count`,
    )
  }
} else {
  console.error("Usage: supabase-management-migrate.mjs check | restore <schema.sql> <data.sql> | migrate <file.sql> | deploy-function <slug> <entrypoint> [files...] | set-function-secrets | split-check <files...>")
  process.exit(2)
}
