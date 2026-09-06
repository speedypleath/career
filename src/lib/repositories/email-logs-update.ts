/**
 * Building the update for an email log, with no database imports.
 *
 * This is split out from email-logs.ts for the same reason src/lib/email/
 * exists: a module that reaches `pg` or Prisma cannot be loaded by
 * `node --experimental-strip-types`, and the rule encoded here is the one the
 * whole pipeline leans on. Keeping it importable is what lets
 * tests/email-logs-repository.test.ts assert it directly.
 */

export interface LogPatch {
  application_id?: string | null
  classification?: string
  follow_up_done?: boolean
}

/**
 * The fields a human classification sets alongside the label itself.
 *
 * manual_override is the flag every other writer checks before touching this
 * row — rescans, the reanalyze route and the queue worker all bail on it. The
 * rest record that the decision came from a person rather than the cascade, so
 * a queued job that completes later cannot present itself as the source.
 */
export const MANUAL_CLASSIFICATION_FIELDS = {
  manual_override: true,
  classification_state: "resolved",
  classification_source: "manual",
  classification_error: null,
} as const

/** Returns null when the patch asks for nothing, so the caller can skip the write. */
export function buildLogUpdate(patch: LogPatch): Record<string, unknown> | null {
  const data: Record<string, unknown> = {}

  if (patch.application_id !== undefined) {
    data.application_id = patch.application_id || null
  }

  if (patch.follow_up_done !== undefined) {
    data.follow_up_done = patch.follow_up_done
  }

  if (patch.classification !== undefined) {
    data.classification = patch.classification
    Object.assign(data, MANUAL_CLASSIFICATION_FIELDS)
    data.classified_at = new Date()
  }

  return Object.keys(data).length === 0 ? null : data
}
