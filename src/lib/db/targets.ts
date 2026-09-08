export type DatabaseTarget = "career-local" | "hosted-supabase"

export interface DatabaseConfig {
  host: string
  port: number
  user: string
  password?: string
  database: string
  sslMode: "disable" | "require" | "verify-full"
}

const CAREER_LOCAL_DEFAULTS = {
  host: "127.0.0.1",
  port: 5432,
  user: "postgres",
  password: "postgres",
  database: "career",
  sslMode: "disable" as const,
}

const HOSTED_SUPABASE_DEFAULTS = {
  host: "aws-1-eu-west-1.pooler.supabase.com",
  port: 5432,
  user: "postgres.your-project-ref",
  database: "postgres",
  sslMode: "require" as const,
}

export function resolveDatabaseConfig(target: DatabaseTarget): DatabaseConfig {
  if (target === "hosted-supabase") {
    return {
      host: process.env.SUPABASE_DB_HOST ?? process.env.PGHOST ?? HOSTED_SUPABASE_DEFAULTS.host,
      port: Number(process.env.SUPABASE_DB_PORT ?? process.env.PGPORT ?? HOSTED_SUPABASE_DEFAULTS.port),
      user: process.env.SUPABASE_DB_USER ?? process.env.PGUSER ?? HOSTED_SUPABASE_DEFAULTS.user,
      password: process.env.SUPABASE_DB_PASSWORD ?? process.env.PGPASSWORD,
      database: process.env.SUPABASE_DB_NAME ?? process.env.PGDATABASE ?? HOSTED_SUPABASE_DEFAULTS.database,
      sslMode: process.env.SUPABASE_DB_SSLMODE as DatabaseConfig["sslMode"] ?? HOSTED_SUPABASE_DEFAULTS.sslMode,
    }
  }

  return {
    host: process.env.CAREER_DB_HOST ?? CAREER_LOCAL_DEFAULTS.host,
    port: Number(process.env.CAREER_DB_PORT ?? CAREER_LOCAL_DEFAULTS.port),
    user: process.env.CAREER_DB_USER ?? CAREER_LOCAL_DEFAULTS.user,
    password: process.env.CAREER_DB_PASSWORD ?? CAREER_LOCAL_DEFAULTS.password,
    database: process.env.CAREER_DB_NAME ?? CAREER_LOCAL_DEFAULTS.database,
    sslMode: "disable",
  }
}
