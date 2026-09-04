import { spawnSync } from "node:child_process"

const projectRef = process.env.SUPABASE_PROJECT_REF
const password = process.env.SUPABASE_DB_PASSWORD
if (!projectRef || !password) {
  console.error("Missing protected Supabase deployment configuration")
  process.exit(2)
}

const databaseEnv = {
  ...process.env,
  PGHOST: `db.${projectRef}.supabase.co`,
  PGPORT: "5432",
  PGUSER: "postgres",
  PGPASSWORD: password,
  PGDATABASE: "postgres",
  PGSSLMODE: "require",
}

function run(command, args) {
  const result = spawnSync(command, args, {
    env: databaseEnv,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
  if (result.status !== 0) {
    console.error(result.stderr || `${command} failed`)
    process.exit(result.status || 1)
  }
  return result.stdout.trim()
}

const mode = process.argv[2]
if (mode === "check") {
  console.log(run("psql", ["-Atqc", "select current_database(), current_setting('server_version')"]))
  process.exit(0)
}

if (mode !== "restore" || !process.argv[3]) {
  console.error("Usage: restore-career-to-supabase.mjs check | restore <backup.dump>")
  process.exit(2)
}

run("pg_restore", [
  "--exit-on-error",
  "--single-transaction",
  "--no-owner",
  "--no-privileges",
  "--dbname",
  "postgres",
  process.argv[3],
])
console.log("Career schema and data restored to Supabase")
