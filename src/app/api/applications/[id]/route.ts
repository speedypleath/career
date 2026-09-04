import { NextResponse } from "next/server"
import { query } from "@/lib/db"
import type { Application, ApplicationEvent, EmailLog } from "@/types"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const appRes = await query<Application>(
      `SELECT * FROM applications WHERE id = $1`,
      [id]
    )

    if (appRes.rows.length === 0) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 })
    }

    const application = appRes.rows[0]

    // Fetch timeline events
    const eventsRes = await query<ApplicationEvent>(
      `SELECT * FROM application_events WHERE application_id = $1 ORDER BY created_at DESC`,
      [id]
    )

    // Fetch matched emails
    const emailsRes = await query<EmailLog>(
      `SELECT * FROM email_logs WHERE application_id = $1 ORDER BY received_at DESC`,
      [id]
    )

    // Fetch suggested matching unlinked emails from radar
    let suggestedEmails: EmailLog[] = []
    const cleanCompany = (application.company || "").trim()
    if (cleanCompany.length >= 2 && cleanCompany.toLowerCase() !== "unknown company") {
      const firstWord = cleanCompany.split(/[\s,.-]+/)[0]
      const searchTerm = firstWord.length >= 3 ? firstWord : cleanCompany
      const suggestedRes = await query<EmailLog>(
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
         LIMIT 8`,
        [`%${searchTerm}%`]
      )
      suggestedEmails = suggestedRes.rows
    }

    return NextResponse.json({
      application: {
        ...application,
        events: eventsRes.rows,
        emails: emailsRes.rows,
        suggestedEmails,
      },
    })
  } catch (error) {
    console.error("Failed to fetch application details:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // Get current record first
    const currentRes = await query<Application>(
      `SELECT * FROM applications WHERE id = $1`,
      [id]
    )

    if (currentRes.rows.length === 0) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 })
    }

    const current = currentRes.rows[0]
    const fieldsToUpdate: string[] = []
    const values: unknown[] = []
    let pIdx = 1

    const updatableKeys: (keyof Application)[] = [
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
    ]

    for (const key of updatableKeys) {
      if (body[key] !== undefined) {
        fieldsToUpdate.push(`${key} = $${pIdx++}`)
        values.push(body[key])
      }
    }

    if (fieldsToUpdate.length === 0) {
      return NextResponse.json({ application: current })
    }

    fieldsToUpdate.push(`updated_at = NOW()`)
    values.push(id)

    const updateSql = `
      UPDATE applications 
      SET ${fieldsToUpdate.join(", ")}
      WHERE id = $${pIdx}
      RETURNING *
    `

    const updateRes = await query<Application>(updateSql, values)
    const updatedApp = updateRes.rows[0]

    // Track status change event
    if (body.status && body.status !== current.status) {
      await query(
        `INSERT INTO application_events (application_id, event_type, title, description, metadata)
         VALUES ($1, 'status_change', $2, $3, $4)`,
        [
          id,
          `Status changed to ${body.status}`,
          `Status transitioned from "${current.status}" to "${body.status}"`,
          JSON.stringify({ oldStatus: current.status, newStatus: body.status }),
        ]
      )
    }

    // Track note addition if explicitly provided
    if (body.note_entry) {
      await query(
        `INSERT INTO application_events (application_id, event_type, title, description)
         VALUES ($1, 'note_added', 'Note added', $2)`,
        [id, String(body.note_entry)]
      )
    }

    return NextResponse.json({ application: updatedApp })
  } catch (error) {
    console.error("Failed to update application:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await query(`DELETE FROM applications WHERE id = $1`, [id])
    return NextResponse.json({ success: true, message: "Application deleted" })
  } catch (error) {
    console.error("Failed to delete application:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    )
  }
}
