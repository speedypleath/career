import { query } from "../db"
import { prisma } from "../prisma"
import type { EmailLog } from "@/types"
import { buildLogUpdate } from "./email-logs-update.ts"
import type { LogPatch } from "./email-logs-update.ts"

export { buildLogUpdate, MANUAL_CLASSIFICATION_FIELDS } from "./email-logs-update.ts"
export type { LogPatch } from "./email-logs-update.ts"

const LIST_LIMIT = 100

export type EmailLogWithApplication = EmailLog & { company: string | null; app_title: string | null }

export interface LogFilters {
  classification?: string | null
  search?: string | null
}

/**
 * Deliberately raw SQL, not Prisma.
 *
 * The search term has to match against the joined application's company as
 * well as the log's own columns. Prisma can express that, but only as a
 * relation filter that reads far less clearly than the OR it compiles to.
 */
export async function findAll(filters: LogFilters = {}): Promise<EmailLogWithApplication[]> {
  const conditions: string[] = []
  const params: unknown[] = []

  if (filters.classification && filters.classification !== "all") {
    params.push(filters.classification)
    conditions.push(`m.classification = $${params.length}`)
  }

  if (filters.search) {
    params.push(`%${filters.search}%`)
    const p = `$${params.length}`
    conditions.push(
      `(m.sender ILIKE ${p} OR m.subject ILIKE ${p} OR m.snippet ILIKE ${p} OR a.company ILIKE ${p})`,
    )
  }

  params.push(LIST_LIMIT)

  const res = await query<EmailLogWithApplication>(
    `
      SELECT
        m.*,
        a.company,
        a.title as app_title
      FROM email_logs m
      LEFT JOIN applications a ON a.id = m.application_id
      ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
      ORDER BY m.received_at DESC, m.created_at DESC
      LIMIT $${params.length}
    `,
    params,
  )
  return res.rows
}

export async function update(id: string, patch: LogPatch): Promise<EmailLog | null> {
  const data = buildLogUpdate(patch)
  if (!data) return null
  return (await prisma.email_logs.update({ where: { id }, data })) as unknown as EmailLog
}
