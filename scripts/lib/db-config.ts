/**
 * Single source of truth for how scripts/ resolve "which Postgres, and how".
 * Mirrors src/lib/db.ts's env defaults and PGSSLMODE-gated TLS logic, kept as
 * a deliberately separate file: src/lib/db.ts is reachable from the Next
 * build (`npm run build` type-checks it), scripts/ is excluded from that
 * build entirely (tsconfig.json's exclude list), and importing scripts/lib
 * from src/lib would pull an excluded directory back into the type-checked
 * graph. So this duplicates db.ts's SSL branch on purpose instead of
 * importing it.
 *
 * Two Postgres targets this repo talks to:
 *   "local"    - the plain local `career` database. TLS only turns on when
 *                 PGSSLMODE is "require"/"verify-full", so pointing PG* env
 *                 vars at Supabase with PGSSLMODE=require still works through
 *                 this target (what eval-classifier.ts's original comment
 *                 meant by "mirrors src/lib/db.ts").
 *   "supabase" - the hosted Supabase pooler. Defaults to that host/user/db
 *                 and always enables TLS with rejectUnauthorized:false (the
 *                 pooler's chain is self-signed and there is no plaintext
 *                 path to it, so this one is unconditional, not gated).
 *
 * Every field is still overridable by the matching PG* env var on either
 * target, exactly like every script already behaved.
 */
import type { ClientConfig } from "pg"
import { Client, Pool } from "pg"

export type PgTarget = "local" | "supabase"

const LOCAL_DEFAULTS = {
  host: "127.0.0.1",
  port: 5432,
  user: "postgres",
  password: "postgres",
  database: "career",
}

const SUPABASE_POOLER_DEFAULTS = {
  host: "aws-1-eu-west-1.pooler.supabase.com",
  port: 5432,
  // A placeholder, not a real project — PGUSER (set via .env, which
  // interpolates it from SUPABASE_PROJECT_REF) always overrides this.
  user: "postgres.your-project-ref",
  database: "postgres",
}

function localSslOption(): { ssl: { rejectUnauthorized: boolean } } | Record<string, never> {
  const sslMode = process.env.PGSSLMODE ?? "disable"
  return sslMode === "require" || sslMode === "verify-full"
    ? { ssl: { rejectUnauthorized: false } }
    : {}
}

/**
 * Resolve connection settings for one of the two Postgres targets. Returns a
 * plain config object rather than a constructed Client/Pool: sync-prisma-dev.mjs
 * shells out to `psql`/`pg_dump` instead of using the `pg` driver and needs
 * the raw host/port/user/database fields, not a driver instance.
 */
export function resolvePgConfig(target: PgTarget): ClientConfig {
  if (target === "supabase") {
    return {
      host: process.env.PGHOST ?? SUPABASE_POOLER_DEFAULTS.host,
      port: Number(process.env.PGPORT ?? SUPABASE_POOLER_DEFAULTS.port),
      user: process.env.PGUSER ?? SUPABASE_POOLER_DEFAULTS.user,
      password: process.env.PGPASSWORD ?? process.env.SUPABASE_DB_PASSWORD,
      database: process.env.PGDATABASE ?? SUPABASE_POOLER_DEFAULTS.database,
      // Always on: the pooler's chain is self-signed and there is no
      // plaintext listener to fall back to.
      ssl: { rejectUnauthorized: false },
    }
  }

  return {
    host: process.env.PGHOST ?? LOCAL_DEFAULTS.host,
    port: Number(process.env.PGPORT ?? LOCAL_DEFAULTS.port),
    user: process.env.PGUSER ?? LOCAL_DEFAULTS.user,
    password: process.env.PGPASSWORD ?? LOCAL_DEFAULTS.password,
    database: process.env.PGDATABASE ?? LOCAL_DEFAULTS.database,
    ...localSslOption(),
  }
}

/** `new Client(resolvePgConfig(target))`, for scripts that need one connection. */
export function createClient(target: PgTarget): Client {
  return new Client(resolvePgConfig(target))
}

/** `new Pool(resolvePgConfig(target))`, for scripts that pool connections. */
export function createPool(target: PgTarget): Pool {
  return new Pool(resolvePgConfig(target))
}
