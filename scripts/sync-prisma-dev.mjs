import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { resolvePgConfig } from "./lib/db-config.ts"

const localDefaults = resolvePgConfig("local")
const source = {
  host: process.env.CAREER_DB_HOST ?? "/tmp",
  port: process.env.CAREER_DB_PORT ?? String(localDefaults.port),
  user: process.env.CAREER_DB_USER ?? localDefaults.user,
  database: process.env.CAREER_DB_NAME ?? localDefaults.database,
}
const targets = [
  {
    name: "Prisma Dev",
    host: process.env.PRISMA_DEV_HOST ?? "127.0.0.1",
    port: process.env.PRISMA_DEV_DATABASE_PORT ?? "51214",
    user: process.env.PRISMA_DEV_USER ?? "postgres",
    password: process.env.PRISMA_DEV_PASSWORD ?? "postgres",
    database: process.env.PRISMA_DEV_DATABASE ?? "template1",
  },
  {
    name: "Supabase Local",
    host: process.env.SUPABASE_LOCAL_DB_HOST ?? "127.0.0.1",
    port: process.env.SUPABASE_LOCAL_DB_PORT ?? "54322",
    user: process.env.SUPABASE_LOCAL_DB_USER ?? "postgres",
    password: process.env.SUPABASE_LOCAL_DB_PASSWORD ?? "postgres",
    database: process.env.SUPABASE_LOCAL_DB_NAME ?? "postgres",
  },
]
const tables = [
  "applications",
  "application_events",
  "email_logs",
  "email_settings",
  "email_summaries",
]
const fingerprintTimestamp = {
  applications: "updated_at",
  application_events: "created_at",
  email_logs: "created_at",
  email_settings: "updated_at",
  email_summaries: "updated_at",
}
const watch = process.argv.includes("--watch")
const intervalMs = Number(process.env.PRISMA_DEV_SYNC_INTERVAL_MS ?? 10000)

function run(command, args, env = {}) {
  return execFileSync(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim()
}

function psqlArgs(database, query) {
  return ["-h", database.host, "-p", database.port, "-U", database.user, "-d", database.database, "-Atqc", query]
}

function sourceFingerprint() {
  const query = tables
    .map((table) => `select '${table}=' || count(*) || ':' || coalesce(max(${fingerprintTimestamp[table]})::text, '') from public.${table}`)
    .join(" union all ")
  return run("psql", psqlArgs(source, query), { PGHOST: source.host, PGPORT: source.port, PGUSER: source.user, PGDATABASE: source.database, PGSSLMODE: "disable" })
}

function syncTarget(target, dumpPath) {
  const targetEnv = { PGPASSWORD: target.password, PGSSLMODE: "disable" }

  run("psql", ["-h", target.host, "-p", target.port, "-U", target.user, "-d", target.database, "-v", "ON_ERROR_STOP=1", "-c", "create schema if not exists public; set search_path = public", "-f", "src/lib/schema.sql"], targetEnv)
  run("psql", ["-h", target.host, "-p", target.port, "-U", target.user, "-d", target.database, "-v", "ON_ERROR_STOP=1", "-c", `truncate ${tables.map((table) => `public.${table}`).join(", ")} cascade`], targetEnv)
  run("psql", ["-h", target.host, "-p", target.port, "-U", target.user, "-d", target.database, "-v", "ON_ERROR_STOP=1", "-f", dumpPath], targetEnv)
}

function syncOnce() {
  const tempDir = mkdtempSync(join(tmpdir(), "career-prisma-sync-"))
  const dumpPath = join(tempDir, "data.sql")

  try {
    run("pg_dump", ["-h", source.host, "-p", source.port, "-U", source.user, "-d", source.database, "--data-only", "--column-inserts", ...tables.flatMap((table) => ["--table", `public.${table}`]), "-f", dumpPath], { PGHOST: source.host, PGPORT: source.port, PGUSER: source.user, PGDATABASE: source.database, PGSSLMODE: "disable" })
    for (const target of targets) {
      syncTarget(target, dumpPath)
      console.log(`[sync] refreshed ${target.name} from ${source.database}`)
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

let lastFingerprint
do {
  const fingerprint = sourceFingerprint()
  if (fingerprint !== lastFingerprint) {
    syncOnce()
    lastFingerprint = sourceFingerprint()
  } else {
    console.log("[sync] no source changes")
  }
  if (!watch) break
  await new Promise((resolve) => setTimeout(resolve, intervalMs))
} while (true)