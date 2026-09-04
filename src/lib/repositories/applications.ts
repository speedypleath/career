import { query } from "../db"
import { prisma } from "../prisma"
import type { Application, ApplicationEvent, EmailLog } from "@/types"

/**
 * Which half of this file uses Prisma, and why.
 *
 * The read side stays on raw SQL: the list query aggregates two LEFT JOINs and
 * carries two correlated subqueries for the latest event, and the suggested-
 * email search is a hand-tuned ILIKE across four columns. Prisma expresses
 * neither well.
 *
 * The write side uses Prisma, because that is where the old code was building
 * SQL strings by hand — `fieldsToUpdate.push(\`${key} = $${pIdx++}\`)` with the
 * column name interpolated from a request body key. It was safe only because a
 * whitelist ran first. Prisma checks the column names at compile time instead.
 */

/**
 * Postgres returns timestamps as Date and enum-ish columns as plain strings;
 * Application declares ISO strings and narrow unions. Both `query<Application>`
 * and Prisma need a cast to bridge that — this is that cast, in one place,
 * with the date conversion made explicit rather than left to JSON.stringify.
 */
function toApplication(row: Record<string, unknown>): Application {
  const out: Record<string, unknown> = { ...row }
  for (const key of ["applied_at", "created_at", "updated_at"]) {
    const value = out[key]
    if (value instanceof Date) out[key] = value.toISOString()
  }
  return out as unknown as Application
}

export type ApplicationSort = "recent" | "company" | "status" | "priority"

export interface ApplicationFilters {
  status?: string | null
  workplace?: string | null
  search?: string | null
  sort?: string | null
}

const ORDER_BY: Record<ApplicationSort, string> = {
  company: "a.company ASC, a.applied_at DESC",
  status: "a.status ASC, a.applied_at DESC",
  priority: `
        CASE a.priority
          WHEN 'top' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
          ELSE 5
        END, a.applied_at DESC`,
  recent: "a.applied_at DESC NULLS LAST, a.created_at DESC",
}

export async function findAll(filters: ApplicationFilters = {}): Promise<Application[]> {
  const conditions: string[] = []
  const params: unknown[] = []

  if (filters.status && filters.status !== "all") {
    params.push(filters.status)
    conditions.push(`a.status = $${params.length}`)
  }

  if (filters.workplace && filters.workplace !== "all") {
    params.push(filters.workplace)
    conditions.push(`a.workplace_type = $${params.length}`)
  }

  if (filters.search) {
    params.push(`%${filters.search}%`)
    const p = `$${params.length}`
    conditions.push(
      `(a.title ILIKE ${p} OR a.company ILIKE ${p} OR a.location ILIKE ${p} OR a.notes ILIKE ${p})`,
    )
  }

  // An unrecognized sort falls back to "recent", as it did before.
  const sort = (filters.sort ?? "recent") as ApplicationSort
  const orderBy = ORDER_BY[sort] ?? ORDER_BY.recent

  const res = await query<Application>(
    `
      SELECT
        a.*,
        COUNT(DISTINCT e.id) as events_count,
        COUNT(DISTINCT m.id) as emails_count,
        (SELECT title FROM application_events WHERE application_id = a.id ORDER BY created_at DESC LIMIT 1) as latest_event_title,
        (SELECT created_at FROM application_events WHERE application_id = a.id ORDER BY created_at DESC LIMIT 1) as latest_event_time
      FROM applications a
      LEFT JOIN application_events e ON e.application_id = a.id
      LEFT JOIN email_logs m ON m.application_id = a.id
      ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
      GROUP BY a.id
      ORDER BY ${orderBy}
    `,
    params,
  )
  return res.rows
}

export async function findById(id: string): Promise<Application | null> {
  const res = await query<Application>(`SELECT * FROM applications WHERE id = $1`, [id])
  return res.rows[0] ?? null
}

export async function findEvents(id: string): Promise<ApplicationEvent[]> {
  const res = await query<ApplicationEvent>(
    `SELECT * FROM application_events WHERE application_id = $1 ORDER BY created_at DESC`,
    [id],
  )
  return res.rows
}

export async function findEmails(id: string): Promise<EmailLog[]> {
  const res = await query<EmailLog>(
    `SELECT * FROM email_logs WHERE application_id = $1 ORDER BY received_at DESC`,
    [id],
  )
  return res.rows
}

const SUGGESTION_LIMIT = 8

/**
 * Unlinked emails that look like they belong to this application.
 *
 * Matches on the company's first word when it is long enough to be
 * distinctive, otherwise the whole name. "Unknown Company" is excluded because
 * the extractor invents it for mail it could not read, so it would otherwise
 * match a large and arbitrary slice of the inbox.
 */
export async function findSuggestedEmails(company: string): Promise<EmailLog[]> {
  const cleaned = (company || "").trim()
  if (cleaned.length < 2 || cleaned.toLowerCase() === "unknown company") return []

  const firstWord = cleaned.split(/[\s,.-]+/)[0]
  const searchTerm = firstWord.length >= 3 ? firstWord : cleaned

  const res = await query<EmailLog>(
    `SELECT * FROM email_logs
     WHERE application_id IS NULL
       AND classification != 'unrelated'
       AND classification != 'conference'
       AND (
         sender ILIKE $1
         OR subject ILIKE $1
         OR snippet ILIKE $1
         OR body ILIKE $1
       )
     ORDER BY received_at DESC
     LIMIT $2`,
    [`%${searchTerm}%`, SUGGESTION_LIMIT],
  )
  return res.rows
}

export interface NewApplication {
  title: string
  company: string
  workplace_type?: string
  location?: string
  status?: string
  application_method?: string
  url?: string
  job_description?: string
  info_provided?: string
  cover_letter?: string
  salary?: string
  contact_email?: string
  contact_name?: string
  notes?: string
  priority?: string
  source?: string
  applied_at?: string
}

export async function create(input: NewApplication): Promise<Application> {
  const row = await prisma.applications.create({
    data: {
      title: input.title,
      company: input.company,
      workplace_type: input.workplace_type ?? "remote",
      location: input.location ?? "",
      status: input.status ?? "applied",
      application_method: input.application_method ?? "portal",
      url: input.url ?? "",
      job_description: input.job_description ?? "",
      info_provided: input.info_provided ?? "",
      cover_letter: input.cover_letter ?? "",
      salary: input.salary ?? "",
      contact_email: input.contact_email ?? "",
      contact_name: input.contact_name ?? "",
      notes: input.notes ?? "",
      priority: input.priority ?? "medium",
      source: input.source ?? "manual",
      applied_at: input.applied_at ? new Date(input.applied_at) : new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    },
  })
  return toApplication(row)
}

/**
 * The only fields a request may write. Anything else in the body is ignored —
 * id, created_at and the joined counts in particular.
 */
export const UPDATABLE_FIELDS = [
  "title",
  "company",
  "workplace_type",
  "location",
  "status",
  "application_method",
  "url",
  "job_description",
  "info_provided",
  "cover_letter",
  "salary",
  "contact_email",
  "contact_name",
  "notes",
  "priority",
  "source",
  "applied_at",
] as const

export type ApplicationPatch = Partial<Record<(typeof UPDATABLE_FIELDS)[number], unknown>>

export function buildApplicationUpdate(patch: ApplicationPatch): Record<string, unknown> | null {
  const data: Record<string, unknown> = {}
  for (const key of UPDATABLE_FIELDS) {
    if (patch[key] === undefined) continue
    data[key] = key === "applied_at" ? new Date(patch[key] as string) : patch[key]
  }
  if (Object.keys(data).length === 0) return null
  data.updated_at = new Date()
  return data
}

export async function update(id: string, patch: ApplicationPatch): Promise<Application | null> {
  const data = buildApplicationUpdate(patch)
  if (!data) return null
  const row = await prisma.applications.update({ where: { id }, data })
  return toApplication(row)
}

export async function remove(id: string): Promise<void> {
  await query(`DELETE FROM applications WHERE id = $1`, [id])
}

/** Case-insensitive match on the pair the webhook treats as an application's identity. */
export async function findByCompanyAndTitle(
  company: string,
  title: string,
): Promise<Application | null> {
  const res = await query<Application>(
    `SELECT * FROM applications WHERE LOWER(company) = LOWER($1) AND LOWER(title) = LOWER($2) LIMIT 1`,
    [company.trim(), title.trim()],
  )
  return res.rows[0] ?? null
}

/**
 * Deliberately raw SQL, not Prisma.
 *
 * Every column here means "overwrite unless the caller sent nothing", and
 * notes means "append, never replace" — the webhook must not be able to wipe
 * a field by omitting it. COALESCE(NULLIF(...)) and CONCAT say that in one
 * statement; Prisma would need the current row read back first and the merge
 * done in TypeScript, which is both slower and a race.
 */
export async function mergeFromWebhook(
  id: string,
  input: {
    workplace_type: string
    location: string
    status: string
    application_method: string
    url: string
    job_description: string
    info_provided: string
    cover_letter: string
    salary: string
    notes: string
    priority: string
  },
): Promise<Application> {
  const res = await query<Application>(
    `
      UPDATE applications SET
        workplace_type = COALESCE(NULLIF($1, ''), workplace_type),
        location = COALESCE(NULLIF($2, ''), location),
        status = COALESCE(NULLIF($3, ''), status),
        application_method = COALESCE(NULLIF($4, ''), application_method),
        url = COALESCE(NULLIF($5, ''), url),
        job_description = COALESCE(NULLIF($6, ''), job_description),
        info_provided = COALESCE(NULLIF($7, ''), info_provided),
        cover_letter = COALESCE(NULLIF($8, ''), cover_letter),
        salary = COALESCE(NULLIF($9, ''), salary),
        notes = CASE WHEN $10 <> '' THEN CONCAT(notes, E'\n\n[Webhook Update]: ', $10) ELSE notes END,
        priority = COALESCE(NULLIF($11, ''), priority),
        updated_at = NOW()
      WHERE id = $12
      RETURNING *
    `,
    [
      input.workplace_type,
      input.location,
      input.status,
      input.application_method,
      input.url,
      input.job_description,
      input.info_provided,
      input.cover_letter,
      input.salary,
      input.notes,
      input.priority,
      id,
    ],
  )
  return res.rows[0]
}


/** id, company, title and status for every application — the matching probe set. */
export async function findAllForMatching(): Promise<
  Pick<Application, "id" | "company" | "title" | "status">[]
> {
  const res = await query<Pick<Application, "id" | "company" | "title" | "status">>(
    `SELECT id, company, title, status FROM applications`,
  )
  return res.rows
}

export async function findBasics(
  id: string,
): Promise<Pick<Application, "id" | "company" | "title" | "status"> | null> {
  const res = await query<Pick<Application, "id" | "company" | "title" | "status">>(
    `SELECT id, company, title, status FROM applications WHERE id = $1`,
    [id],
  )
  return res.rows[0] ?? null
}

export async function setStatus(id: string, status: string): Promise<void> {
  await query(`UPDATE applications SET status = $1, updated_at = NOW() WHERE id = $2`, [status, id])
}

/**
 * The oldest matcher in the codebase: the first application whose company name
 * appears anywhere in the sender, subject or content.
 *
 * src/lib/email/matching.ts is the better one, used by the scanner. This is
 * kept as-is because the scan and reanalyze routes have always used it and it
 * decides which application an email is attached to.
 */
export function matchByCompanyMention(
  applications: Pick<Application, "id" | "company" | "title" | "status">[],
  sender: string,
  subject: string,
  content: string,
): Pick<Application, "id" | "company" | "title" | "status"> | null {
  for (const app of applications) {
    const needle = app.company.toLowerCase()
    if (
      sender.toLowerCase().includes(needle) ||
      subject.toLowerCase().includes(needle) ||
      content.toLowerCase().includes(needle)
    ) {
      return app
    }
  }
  return null
}
