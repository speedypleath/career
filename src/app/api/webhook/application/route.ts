import { NextResponse } from "next/server"
import { query } from "@/lib/db"
import type { Application } from "@/types"

export async function GET() {
  return NextResponse.json({
    name: "Career Webhook API",
    description: "Webhook to record job applications submitted by automated cron jobs or agents",
    endpoint: "POST /api/webhook/application",
    sample_payload: {
      title: "DSP Software Developer",
      company: "GN Hearing",
      workplace_type: "hybrid", // "remote" | "hybrid" | "on-site"
      status: "applied", // "applied", "wishlist", "interview_pending", etc.
      application_method: "portal", // "portal", "email", "linkedin", "referral"
      url: "https://www.linkedin.com/jobs/view/4454799256",
      location: "Eindhoven, Netherlands",
      job_description: "Audio signal processing algorithms for hearing aids...",
      info_provided: "Resume: Owner_Name_CV.pdf, Notice Period: Immediate",
      cover_letter: "Dear Hiring Team at GN Hearing...",
      salary: "€65,000 - €80,000",
      contact_email: "careers@gn.com",
      notes: "Applied via LinkedIn easy apply / portal",
      priority: "high",
      source: "audio-job-hunter-cron"
    },
    curl_example: `curl -X POST http://127.0.0.1:8098/api/webhook/application -H "Content-Type: application/json" -d '{"title":"Audio Software Engineer","company":"ExampleCo","workplace_type":"remote","status":"applied"}'`
  })
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    // Accept both snake_case and camelCase
    const title = body.title || body.jobTitle || body.position
    const company = body.company || body.companyName
    const workplace_type = (body.workplace_type || body.workplaceType || body.workplace || "remote").toLowerCase()
    const location = body.location || body.city || ""
    const status = (body.status || "applied").toLowerCase()
    const application_method = (body.application_method || body.applicationMethod || body.method || "portal").toLowerCase()
    const url = body.url || body.jobUrl || body.link || ""
    const job_description = body.job_description || body.jobDescription || body.description || ""
    const info_provided = body.info_provided || body.infoProvided || body.providedInfo || ""
    const cover_letter = body.cover_letter || body.coverLetter || body.letter || ""
    const salary = body.salary || body.compensation || ""
    const contact_email = body.contact_email || body.contactEmail || body.email || ""
    const contact_name = body.contact_name || body.contactName || ""
    const notes = body.notes || body.comment || ""
    const priority = (body.priority || "medium").toLowerCase()
    const source = body.source || "webhook"
    const applied_at = body.applied_at || body.appliedAt || new Date().toISOString()

    if (!title || !company) {
      return NextResponse.json(
        { error: "Both 'title' and 'company' are required in the payload" },
        { status: 400 }
      )
    }

    // Check if an application for this company & title already exists
    const existing = await query<Application>(
      `SELECT * FROM applications WHERE LOWER(company) = LOWER($1) AND LOWER(title) = LOWER($2) LIMIT 1`,
      [company.trim(), title.trim()]
    )

    if (existing.rows.length > 0) {
      const existingApp = existing.rows[0]
      // Update with incoming webhook information
      const updateSql = `
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
      `
      const updateRes = await query<Application>(updateSql, [
        workplace_type,
        location,
        status,
        application_method,
        url,
        job_description,
        info_provided,
        cover_letter,
        salary,
        notes,
        priority,
        existingApp.id,
      ])

      await query(
        `INSERT INTO application_events (application_id, event_type, title, description, metadata)
         VALUES ($1, 'updated', $2, $3, $4)`,
        [
          existingApp.id,
          `Webhook updated application: ${title}`,
          `Updated application details from source: ${source}`,
          JSON.stringify({ source, updatedFields: body }),
        ]
      )

      return NextResponse.json({
        success: true,
        action: "updated",
        id: existingApp.id,
        application: updateRes.rows[0],
      })
    }

    // Insert new application
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

    const insertRes = await query<Application>(insertSql, [
      title.trim(),
      company.trim(),
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

    const created = insertRes.rows[0]

    // Create event
    await query(
      `INSERT INTO application_events (application_id, event_type, title, description, metadata)
       VALUES ($1, 'webhook_created', $2, $3, $4)`,
      [
        created.id,
        `Application logged via webhook`,
        `Auto-created for ${title} at ${company} (Source: ${source})`,
        JSON.stringify({ source, payload: body }),
      ]
    )

    return NextResponse.json(
      {
        success: true,
        action: "created",
        id: created.id,
        application: created,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error("Webhook processing error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    )
  }
}
