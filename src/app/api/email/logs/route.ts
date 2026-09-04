import { NextResponse } from "next/server"
import { query } from "@/lib/db"
import type { EmailLog } from "@/types"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const classification = searchParams.get("classification")
    const search = searchParams.get("search")

    let sql = `
      SELECT
        m.*,
        a.company,
        a.title as app_title
      FROM email_logs m
      LEFT JOIN applications a ON a.id = m.application_id
      WHERE 1=1
    `
    const params: unknown[] = []
    let pIdx = 1

    if (classification && classification !== "all") {
      sql += ` AND m.classification = $${pIdx++}`
      params.push(classification)
    }

    if (search) {
      sql += ` AND (m.sender ILIKE $${pIdx} OR m.subject ILIKE $${pIdx} OR m.snippet ILIKE $${pIdx} OR a.company ILIKE $${pIdx})`
      params.push(`%${search}%`)
      pIdx++
    }

    sql += ` ORDER BY m.received_at DESC, m.created_at DESC LIMIT 100`

    const res = await query<EmailLog>(sql, params)
    return NextResponse.json({ emails: res.rows })
  } catch (error) {
    console.error("Failed to fetch email logs:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { id, application_id, classification } = body

    if (!id) {
      return NextResponse.json({ error: "Email log ID is required" }, { status: 400 })
    }

    const updates: string[] = []
    const values: unknown[] = []
    let pIdx = 1

    if (application_id !== undefined) {
      updates.push(`application_id = $${pIdx++}`)
      values.push(application_id || null)
    }

    if (classification !== undefined) {
      updates.push(`classification = $${pIdx++}`)
      values.push(classification)
      // A human set this deliberately; keep rescans from reverting it.
      updates.push(`manual_override = TRUE`)
      updates.push(`classification_state = 'resolved'`)
      updates.push(`classification_source = 'manual'`)
      updates.push(`classification_error = NULL`)
      updates.push(`classified_at = NOW()`)
    }

    if (updates.length === 0) {
      return NextResponse.json({ message: "Nothing to update" })
    }

    values.push(id)
    const sql = `UPDATE email_logs SET ${updates.join(", ")} WHERE id = $${pIdx} RETURNING *`
    const res = await query<EmailLog>(sql, values)

    return NextResponse.json({ email: res.rows[0] })
  } catch (error) {
    console.error("Failed to update email log:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    )
  }
}
