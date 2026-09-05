/**
 * Canonical "this application is bogus, delete it" rule for one-off cleanup
 * scripts, reconciled from the two copies that had drifted:
 * scripts/clean-and-fix.ts and scripts/reclassify-all.ts. This is the union of
 * every name either one treated as bogus — nothing dropped. clean-bogus-apps.mjs
 * is deliberately NOT folded in here: its "bogus" list is 7 hardcoded
 * application UUIDs from one past incident plus sender/subject ILIKE rules,
 * not a reusable name match, so it stays as one-off content.
 *
 * This is NOT `BLACKLISTED_COMPANY_NAMES` in src/lib/email/status.ts. That set
 * gates live classification and must mirror the `finalize_email_classification`
 * RPC character-for-character (see CLAUDE.md "Known drift"); this one is a
 * one-off allow-list for deleting already-bad rows out of `applications`.
 * Many names overlap by coincidence — do not import one from the other, and
 * do not "fix" one by copying the other.
 */

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

/** Minimal shape every caller's `pg` client/pool `.query` and db.ts's `query()` already satisfy. */
export type QueryFn = (text: string, params?: unknown[]) => Promise<{ rows: any[] }>

export interface BogusApplication {
  id: string
  company: string | null
  title: string | null
}

/** Find applications whose company/title match the canonical bogus list. */
export async function findBogusApplications(query: QueryFn): Promise<BogusApplication[]> {
  const { rows } = await query(
    `SELECT id, company, title FROM applications
      WHERE lower(coalesce(company,'')) = ANY($1::text[])
         OR lower(coalesce(title,'')) = ANY($2::text[])`,
    [[...BOGUS_APPLICATION_COMPANY_NAMES], [...BOGUS_APPLICATION_TITLE_NAMES]],
  )
  return rows
}

/**
 * Delete applications by id, unlinking their email_logs and removing their
 * application_events first (FK order) — the same three-statement cascade
 * clean-and-fix.ts, reclassify-all.ts and clean-bogus-apps.mjs each
 * re-implemented separately.
 */
export async function deleteApplicationsCascade(query: QueryFn, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await query(`UPDATE email_logs SET application_id = NULL WHERE application_id = ANY($1)`, [ids])
  await query(`DELETE FROM application_events WHERE application_id = ANY($1)`, [ids])
  await query(`DELETE FROM applications WHERE id = ANY($1)`, [ids])
}

/** Find then delete in one call, returning what was deleted. */
export async function deleteBogusApplications(query: QueryFn): Promise<BogusApplication[]> {
  const bogus = await findBogusApplications(query)
  await deleteApplicationsCascade(query, bogus.map((b) => b.id))
  return bogus
}
