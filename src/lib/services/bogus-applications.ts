export const BOGUS_APPLICATION_COMPANY_NAMES = new Set([
  "",
  "unknown",
  "unknown company",
  "unknown role",
  "mailer",
  "adcx",
  "ismir",
  "ground news",
  "groundnews",
  "niv news",
  "linkedin",
  "hipo",
  "hipo.ro",
  "newsletter",
  "news",
  "google forms",
  "smartrecruiters",
  "greenhouse",
  "workable",
  "ashby",
  "lever",
])

export const BOGUS_APPLICATION_TITLE_NAMES = new Set(["", "unknown role", "unknown company"])

export type MaintenanceQuery = (text: string, params?: unknown[]) => Promise<{ rows: any[] }>

export interface BogusApplication {
  id: string
  company: string | null
  title: string | null
}

export async function findBogusApplications(query: MaintenanceQuery): Promise<BogusApplication[]> {
  const { rows } = await query(
    `SELECT id, company, title FROM applications
     WHERE lower(coalesce(company,'')) = ANY($1::text[])
        OR lower(coalesce(title,'')) = ANY($2::text[])`,
    [[...BOGUS_APPLICATION_COMPANY_NAMES], [...BOGUS_APPLICATION_TITLE_NAMES]],
  )
  return rows
}

export async function deleteApplicationsCascade(query: MaintenanceQuery, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await query(`UPDATE email_logs SET application_id = NULL WHERE application_id = ANY($1)`, [ids])
  await query(`DELETE FROM application_events WHERE application_id = ANY($1)`, [ids])
  await query(`DELETE FROM applications WHERE id = ANY($1)`, [ids])
}

export async function deleteBogusApplications(query: MaintenanceQuery): Promise<BogusApplication[]> {
  const bogus = await findBogusApplications(query)
  await deleteApplicationsCascade(query, bogus.map((application) => application.id))
  return bogus
}
