import { NextResponse } from "next/server"
import { scanEmails, classifyEmail } from "@/lib/email-scanner"
import { query } from "@/lib/db"
import type { EmailLog, Application } from "@/types"

export async function GET() {
  try {
    const result = await scanEmails()
    return NextResponse.json({
      success: true,
      message: `Scan finished. Scanned: ${result.scannedCount}, Matched: ${result.matchedCount}, Skipped: ${result.skippedCount}, New logged: ${result.newEmails.length}`,
      ...result,
    })
  } catch (error) {
    console.error("Email scan failed:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    )
  }
}

// Ingest or test a single email message
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      sender,
      recipient = "gheorgheandrei13@gmail.com",
      subject,
      body: emailBody = "",
      snippet = "",
      application_id,
      received_at = new Date().toISOString(),
    } = body

    if (!sender || !subject) {
      return NextResponse.json(
        { error: "Both 'sender' and 'subject' are required" },
        { status: 400 }
      )
    }

    const fullContent = snippet || emailBody
    // The sender drives the noise gate, so it must reach the classifier.
    const classification = body.classification || classifyEmail(subject, emailBody || fullContent, sender)
    const messageId = body.message_id || `manual-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`

    // Determine application id if not explicitly passed
    let matchedAppId = application_id || null
    if (!matchedAppId) {
      const apps = await query<Application>(`SELECT id, company, title FROM applications`)
      for (const app of apps.rows) {
        const cLower = app.company.toLowerCase()
        if (
          sender.toLowerCase().includes(cLower) ||
          subject.toLowerCase().includes(cLower) ||
          fullContent.toLowerCase().includes(cLower)
        ) {
          matchedAppId = app.id
          break
        }
      }
    }

    const insertRes = await query<EmailLog>(
      `INSERT INTO email_logs (application_id, message_id, sender, recipient, subject, snippet, body, classification, received_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (message_id) DO UPDATE SET
         application_id = COALESCE($1, email_logs.application_id),
         classification = $8
       RETURNING *`,
      [matchedAppId, messageId, sender, recipient, subject, fullContent.slice(0, 300), emailBody, classification, received_at]
    )

    const savedEmail = insertRes.rows[0]

    // If matched, log event and optionally update status
    if (matchedAppId) {
      let newStatus: string | null = null
      if (classification === "interview") newStatus = "interviewing"
      else if (classification === "offer") newStatus = "offer"
      else if (classification === "rejection") newStatus = "rejected"

      if (newStatus) {
        await query(`UPDATE applications SET status = $1, updated_at = NOW() WHERE id = $2`, [newStatus, matchedAppId])
      }

      await query(
        `INSERT INTO application_events (application_id, event_type, title, description, metadata)
         VALUES ($1, 'email_received', $2, $3, $4)`,
        [
          matchedAppId,
          `Email: ${classification.toUpperCase()}`,
          `Subject: "${subject}" from ${sender}`,
          JSON.stringify({ messageId, classification, subject, sender }),
        ]
      )
    }

    return NextResponse.json({
      success: true,
      email: savedEmail,
      matchedApplicationId: matchedAppId,
    })
  } catch (error) {
    console.error("Failed to ingest email:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    )
  }
}
