import { Pool, QueryResultRow } from "pg"

const pool = new Pool({
  host: process.env.PGHOST ?? "127.0.0.1",
  port: Number(process.env.PGPORT ?? 5432),
  user: process.env.PGUSER ?? "postgres",
  password: process.env.PGPASSWORD ?? "postgres",
  database: process.env.PGDATABASE ?? "career",
  max: 10,
  idleTimeoutMillis: 30000,
})

export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: unknown[],
) {
  const start = Date.now()
  try {
    const res = await pool.query<T>(text, params as never[])
    return res
  } catch (err) {
    console.error("[db error]", { text, error: err, duration: Date.now() - start })
    throw err
  }
}

export default pool
