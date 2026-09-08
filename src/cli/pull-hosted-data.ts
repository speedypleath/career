import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { resolveDatabaseConfig } from "../lib/db/targets.ts"

const source = resolveDatabaseConfig("hosted-supabase")
if (!source.password) throw new Error("Hosted Supabase requires SUPABASE_DB_PASSWORD or PGPASSWORD")

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

function run(command: string, args: string[], env: Record<string, string | undefined> = {}) {
  return execFileSync(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim()
}

function databaseArgs(database: { host: string; port: number | string; user: string; database: string }) {
  return ["-h", database.host, "-p", String(database.port), "-U", database.user, "-d", database.database]
}

function sourceEnvironment() {
  return {
    PGHOST: source.host,
    PGPORT: String(source.port),
    PGUSER: source.user,
    PGPASSWORD: source.password,
    PGDATABASE: source.database,
    PGSSLMODE: source.sslMode,
  }
}

function targetEnvironment(password: string) {
  return { PGPASSWORD: password, PGSSLMODE: "disable" }
}

function applyTarget(target: (typeof targets)[number], dumpPath: string) {
  const args = databaseArgs(target)
  const env = targetEnvironment(target.password)
  run("psql", [...args, "-v", "ON_ERROR_STOP=1", "-c", "create schema if not exists public; set search_path = public", "-f", "src/lib/schema.sql"], env)
  run("psql", [...args, "-v", "ON_ERROR_STOP=1", "-c", `truncate ${tables.map((table) => `public.${table}`).join(", ")} cascade`], env)
  run("psql", [...args, "-v", "ON_ERROR_STOP=1", "-f", dumpPath], env)
}

const tempDir = mkdtempSync(join(tmpdir(), "career-hosted-pull-"))
const dumpPath = join(tempDir, "data.sql")

try {
  run("pg_dump", [
    ...databaseArgs(source),
    "--data-only",
    "--column-inserts",
    ...tables.flatMap((table) => ["--table", `public.${table}`]),
    "-f",
    dumpPath,
  ], sourceEnvironment())

  for (const target of targets) {
    applyTarget(target, dumpPath)
    console.log(`[pull] refreshed ${target.name} from hosted Supabase`)
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}
