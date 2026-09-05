import "dotenv/config"
import { defineConfig, env } from "prisma/config"

// Prisma 7 moved the datasource URL out of schema.prisma and into this file.
// It is used by the CLI only (`prisma db pull`, `prisma generate`); the client
// itself connects through the @prisma/adapter-pg driver adapter in
// src/lib/prisma.ts, which takes its own connection string.
//
// NEVER run `prisma migrate` against this project. supabase/migrations/*.sql
// owns the schema, the RPCs, pgmq and cron. Prisma introspects, nothing more.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.PRISMA_DATABASE_URL ?? env("DATABASE_URL"),
  },
})
