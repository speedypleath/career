import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@prisma/client"

// Prisma 7 connects through a driver adapter rather than its own engine, so the
// connection string is supplied here rather than in schema.prisma. The same
// PG* variables src/lib/db.ts uses are assembled into a URL, so both paths hit
// exactly one database and there is no second place to configure.
//
// db.ts and its raw query() are NOT going away. Prisma covers straightforward
// CRUD on the five app tables; anything it models badly stays on raw SQL —
// the finalize_email_classification RPC, pgmq, and the aggregate stats query.

/**
 * The URL with any sslmode stripped.
 *
 * Recent pg-connection-string reads `sslmode=require` as full certificate
 * verification, which Supabase's pooler chain fails. TLS is configured through
 * the explicit `ssl` option below instead, which is the same allowance
 * src/lib/db.ts already makes.
 */
function connectionString(): string {
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL)
    url.searchParams.delete("sslmode")
    return url.toString()
  }

  const host = process.env.PGHOST ?? "127.0.0.1"
  const port = process.env.PGPORT ?? "5432"
  const user = process.env.PGUSER ?? "postgres"
  const password = process.env.PGPASSWORD ?? "postgres"
  const database = process.env.PGDATABASE ?? "career"
  const auth = `${encodeURIComponent(user)}:${encodeURIComponent(password)}`
  return `postgresql://${auth}@${host}:${port}/${database}`
}

function createClient(): PrismaClient {
  const sslMode = process.env.PGSSLMODE
    ?? (process.env.DATABASE_URL?.includes("sslmode=require") ? "require" : "disable")

  const adapter = new PrismaPg({
    connectionString: connectionString(),
    ...(sslMode === "require" || sslMode === "verify-full"
      ? { ssl: { rejectUnauthorized: false } }
      : {}),
  })

  return new PrismaClient({ adapter })
}

// Next's dev server re-evaluates modules on every hot reload. Without this the
// process accumulates a new pool per reload until Postgres refuses connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma

export default prisma
