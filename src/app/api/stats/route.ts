import { NextResponse } from "next/server"
import { query } from "@/lib/db"
import type { Stats, ApplicationEvent } from "@/types"

export async function GET() {
  try {
    const countsRes = await query<{
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
    }>(`
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

    const row = countsRes.rows[0] || {}

    const recentEventsRes = await query<ApplicationEvent & { company: string; title_job: string }>(`
      SELECT 
        e.*,
        a.company,
        a.title as title_job
      FROM application_events e
      JOIN applications a ON a.id = e.application_id
      ORDER BY e.created_at DESC
      LIMIT 15
    `)

    const stats: Stats = {
      total: parseInt(row.total || "0", 10),
      wishlist: parseInt(row.wishlist || "0", 10),
      applied: parseInt(row.applied || "0", 10),
      interviewPending: parseInt(row.interview_pending || "0", 10),
      interviewing: parseInt(row.interviewing || "0", 10),
      techAssessment: parseInt(row.technical_assessment || "0", 10),
      offers: parseInt(row.offer || "0", 10),
      rejected: parseInt(row.rejected || "0", 10),
      archived: parseInt(row.archived || "0", 10),
      remoteCount: parseInt(row.remote_count || "0", 10),
      hybridCount: parseInt(row.hybrid_count || "0", 10),
      onsiteCount: parseInt(row.onsite_count || "0", 10),
      portalCount: parseInt(row.portal_count || "0", 10),
      emailCount: parseInt(row.email_count || "0", 10),
      linkedinCount: parseInt(row.linkedin_count || "0", 10),
      otherMethodCount: parseInt(row.other_method_count || "0", 10),
      recentEvents: recentEventsRes.rows,
    }

    return NextResponse.json({ stats })
  } catch (error) {
    console.error("Failed to fetch stats:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    )
  }
}
