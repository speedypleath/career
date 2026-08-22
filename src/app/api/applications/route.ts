import { NextResponse } from "next/server"
import { query } from "@/lib/db"
import type { Application } from "@/types"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const workplace = searchParams.get("workplace")
    const search = searchParams.get("search")
    const sort = searchParams.get("sort") || "recent"

    let sql = `
      SELECT 
        a.*,
        COUNT(DISTINCT e.id) as events_count,
        COUNT(DISTINCT m.id) as emails_count,
        (SELECT title FROM application_events WHERE application_id = a.id ORDER BY created_at DESC LIMIT 1) as latest_event_title,
        (SELECT created_at FROM application_events WHERE application_id = a.id ORDER BY created_at DESC LIMIT 1) as latest_event_time
      FROM applications a
      LEFT JOIN application_events e ON e.application_id = a.id
      LEFT JOIN email_logs m ON m.application_id = a.id
      WHERE 1=1
    `
    const params: unknown[] = []
    let pIndex = 1

    if (status && status !== "all") {
      sql += ` AND a.status = $${pIndex++}`
      params.push(status)
    }

    if (workplace && workplace !== "all") {
      sql += ` AND a.workplace_type = $${pIndex++}`
      params.push(workplace)
    }

    if (search) {
      sql += ` AND (a.title ILIKE $${pIndex} OR a.company ILIKE $${pIndex} OR a.location ILIKE $${pIndex} OR a.notes ILIKE $${pIndex})`
      params.push(`%${search}%`)
      pIndex++
    }

    sql += ` GROUP BY a.id`

    if (sort === "company") {
      sql += ` ORDER BY a.company ASC, a.applied_at DESC`
    } else if (sort === "status") {
      sql += ` ORDER BY a.status ASC, a.applied_at DESC`
    } else if (sort === "priority") {
      sql += ` ORDER BY 
        CASE a.priority 
          WHEN 'top' THEN 1 
          WHEN 'high' THEN 2 
          WHEN 'medium' THEN 3 
          WHEN 'low' THEN 4 
          ELSE 5 
        END, a.applied_at DESC`
    } else {
      sql += ` ORDER BY a.applied_at DESC NULLS LAST, a.created_at DESC`
    }

    const res = await query<Application>(sql, params)
    return NextResponse.json({ applications: res.rows })
  } catch (error) {
    console.error("Failed to fetch applications:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      title,
      company,
      workplace_type = "remote",
      location = "",
      status = "applied",
      application_method = "portal",
      url = "",
      job_description = "",
      info_provided = "",
      cover_letter = "",
      salary = "",
      contact_email = "",
      contact_name = "",
      notes = "",
      priority = "medium",
      source = "manual",
      applied_at = new Date().toISOString(),
    } = body

    if (!title || !company) {
      return NextResponse.json({ error: "Title and Company are required" }, { status: 400 })
    }

    const insertSql = `
      INSERT INTO applications (
        title, company, workplace_type, location, status,
        application_method, url, job_description, info_provided,
        cover_letter, salary, contact_email, contact_name,
        notes, priority, source, applied_at, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW()
      ) RETURNING *
    `

    const res = await query<Application>(insertSql, [
      title,
      company,
      workplace_type,
      location,
      status,
      application_method,
      url,
      job_description,
      info_provided,
      cover_letter,
      salary,
      contact_email,
      contact_name,
      notes,
      priority,
      source,
      applied_at,
    ])

    const createdApp = res.rows[0]

    // Log creation event
    await query(
      `INSERT INTO application_events (application_id, event_type, title, description)
       VALUES ($1, 'created', $2, $3)`,
      [
        createdApp.id,
        `Applied to ${company}`,
        `Position: ${title} (${workplace_type}) via ${application_method}`,
      ]
    )

    return NextResponse.json({ application: createdApp }, { status: 201 })
  } catch (error) {
    console.error("Failed to create application:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    )
  }
}
