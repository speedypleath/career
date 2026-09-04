import { execFileSync, spawnSync } from "node:child_process"
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { Pool } from "pg"

const PLIST = "/Users/speedypleath/Library/LaunchAgents/com.openclaw.career.plist"

function readSourceConfig() {
  const raw = execFileSync("plutil", ["-convert", "json", "-o", "-", PLIST], {
    encoding: "utf8",
  })
  const env = JSON.parse(raw).EnvironmentVariables || {}
  return {
    host: env.PGHOST || "127.0.0.1",
    port: Number(env.PGPORT || 5432),
    user: env.PGUSER || "postgres",
    password: env.PGPASSWORD || "",
    database: env.PGDATABASE || "career",
  }
}

const source = readSourceConfig()

if (process.argv[2] === "backup") {
  const backupDir = "/Users/speedypleath/Backups/career"
  mkdirSync(backupDir, { recursive: true, mode: 0o700 })
  const stamp = new Date().toISOString().replaceAll(":", "-").replace(".000Z", "Z")
  const backupPath = join(backupDir, `career-${stamp}.dump`)
  const containerPath = `/tmp/${backupPath.split("/").at(-1)}`
  const dump = spawnSync(
    "docker",
    ["exec", "honcho-database-1", "pg_dump", "--format=custom", "--no-owner", "--no-privileges", "--file", containerPath, "--username", source.user, source.database],
    { encoding: "utf8" },
  )
  const result = dump.status === 0
    ? spawnSync("docker", ["cp", `honcho-database-1:${containerPath}`, backupPath], { encoding: "utf8" })
    : dump
  if (result.status !== 0) {
    console.error(result.stderr || "pg_dump failed")
    process.exit(result.status || 1)
  }
  spawnSync("docker", ["exec", "honcho-database-1", "rm", "-f", containerPath])
  console.log(backupPath)
  process.exit(0)
}

const pool = new Pool({ ...source, max: 1 })

try {
  const server = await pool.query(`
    select current_database() as database,
           current_setting('server_version') as version,
           pg_size_pretty(pg_database_size(current_database())) as size
  `)
  const tables = await pool.query(`
    select c.relname as name,
           pg_total_relation_size(c.oid)::bigint as bytes,
           coalesce(s.n_live_tup, 0)::bigint as estimated_rows
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_stat_user_tables s on s.relid = c.oid
    where n.nspname = 'public' and c.relkind = 'r'
    order by c.relname
  `)
  const objects = await pool.query(`
    select 'view' as kind, count(*)::int as count from information_schema.views where table_schema = 'public'
    union all
    select 'routine', count(*)::int from information_schema.routines where routine_schema = 'public'
    union all
    select 'enum', count(*)::int from pg_type t join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public' and t.typtype = 'e'
  `)

  const exactRows = []
  for (const table of tables.rows) {
    const escaped = table.name.replaceAll('"', '""')
    const count = await pool.query(`select count(*)::bigint as count from public."${escaped}"`)
    exactRows.push({ name: table.name, rows: Number(count.rows[0].count), bytes: Number(table.bytes) })
  }

  console.log(JSON.stringify({ server: server.rows[0], tables: exactRows, objects: objects.rows }, null, 2))
} finally {
  await pool.end()
}
