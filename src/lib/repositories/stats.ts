import { query } from "../db"
import type { ApplicationEvent, Stats } from "@/types"

/**
 * Deliberately raw SQL, not Prisma.
 *
 * One pass with COUNT(*) FILTER produces all sixteen tallies; the Prisma
 * equivalent is sixteen separate count() round trips or a groupBy that still
 * needs reshaping. This is the case the plan set aside as "anything Prisma
 * models badly stays on query()".
 */

const RECENT_EVENT_LIMIT = 15

interface CountRow {
  total: string
  wishlist: string
  applied: string
  interview_pending: string
  interviewing: string
  technical_assessment: string
  offer: string
  rejected: string
  archived: string
  remote_count: string
  hybrid_count: string
  onsite_count: string
  portal_count: string
  email_count: string
  linkedin_count: string
  other_method_count: string
}

export type RecentEvent = ApplicationEvent & { company: string; title_job: string }

const num = (value: string | undefined) => parseInt(value || "0", 10)

export async function overview(): Promise<Stats> {
  const countsRes = await query<CountRow>(`
      SELECT
        COUNT(*)::text as total,
        COUNT(*) FILTER (WHERE status = 'wishlist')::text as wishlist,
        COUNT(*) FILTER (WHERE status = 'applied')::text as applied,
        COUNT(*) FILTER (WHERE status = 'interview_pending')::text as interview_pending,
        COUNT(*) FILTER (WHERE status = 'interviewing')::text as interviewing,
        COUNT(*) FILTER (WHERE status = 'technical_assessment')::text as technical_assessment,
        COUNT(*) FILTER (WHERE status = 'offer')::text as offer,
        COUNT(*) FILTER (WHERE status = 'rejected')::text as rejected,
        COUNT(*) FILTER (WHERE status = 'archived')::text as archived,
        COUNT(*) FILTER (WHERE workplace_type = 'remote')::text as remote_count,
        COUNT(*) FILTER (WHERE workplace_type = 'hybrid')::text as hybrid_count,
        COUNT(*) FILTER (WHERE workplace_type = 'on-site')::text as onsite_count,
        COUNT(*) FILTER (WHERE application_method = 'portal')::text as portal_count,
        COUNT(*) FILTER (WHERE application_method = 'email')::text as email_count,
        COUNT(*) FILTER (WHERE application_method = 'linkedin')::text as linkedin_count,
        COUNT(*) FILTER (WHERE application_method NOT IN ('portal', 'email', 'linkedin'))::text as other_method_count
      FROM applications
    `)

  const row = countsRes.rows[0] || ({} as CountRow)

  const recentEventsRes = await query<RecentEvent>(
    `
      SELECT
        e.*,
        a.company,
        a.title as title_job
      FROM application_events e
      JOIN applications a ON a.id = e.application_id
      ORDER BY e.created_at DESC
      LIMIT $1
    `,
    [RECENT_EVENT_LIMIT],
  )

  return {
    total: num(row.total),
    wishlist: num(row.wishlist),
    applied: num(row.applied),
    interviewPending: num(row.interview_pending),
    interviewing: num(row.interviewing),
    techAssessment: num(row.technical_assessment),
    offers: num(row.offer),
    rejected: num(row.rejected),
    archived: num(row.archived),
    remoteCount: num(row.remote_count),
    hybridCount: num(row.hybrid_count),
    onsiteCount: num(row.onsite_count),
    portalCount: num(row.portal_count),
    emailCount: num(row.email_count),
    linkedinCount: num(row.linkedin_count),
    otherMethodCount: num(row.other_method_count),
    recentEvents: recentEventsRes.rows,
  }
}
