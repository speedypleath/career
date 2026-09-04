import { NextResponse } from "next/server"
import { query } from "@/lib/db"
import { classifyEmailDetailed } from "@/lib/email-classifier"
import { buildClassificationJob, enqueueClassificationJob } from "@/lib/email-classification-queue"
import type { Application, EmailLog } from "@/types"

async function processReanalyze(emailId: string) {
  const emailRes = await query<EmailLog>(
    `SELECT m.*, a.company, a.title as app_title
     FROM email_logs m
     LEFT JOIN applications a ON a.id = m.application_id
     WHERE m.id = $1`,
    [emailId],
  )

  if (emailRes.rows.length === 0) {
    return null
  }

  const email = emailRes.rows[0]
  const content = email.body || email.snippet || ""

  // Resolve or rematch application if missing
  let matchedAppId = email.application_id
  let matchedApp: Pick<Application, "id" | "company" | "title" | "status"> | null = null

  if (matchedAppId) {
    const appRes = await query<Application>(
      `SELECT id, company, title, status FROM applications WHERE id = $1`,
      [matchedAppId],
    )
    matchedApp = appRes.rows[0] || null
  } else {
    const apps = await query<Application>(`SELECT id, company, title, status FROM applications`)
    for (const app of apps.rows) {
      const cLower = app.company.toLowerCase()
      if (
        email.sender.toLowerCase().includes(cLower) ||
        email.subject.toLowerCase().includes(cLower) ||
        content.toLowerCase().includes(cLower)
      ) {
        matchedAppId = app.id
        matchedApp = app
        break
      }
    }
  }

  const verdict = await classifyEmailDetailed({
    subject: email.subject,
    body: content,
    sender: email.sender,
  })

  const queued = verdict.source === "fallback"
  const classification = verdict.classification

  if (queued) {
    const job = buildClassificationJob(
      { subject: email.subject, body: content, sender: email.sender },
      {
        emailLogId: email.id,
        messageId: email.message_id,
        applicationId: matchedAppId,
        sender: email.sender,
        subject: email.subject,
        company: matchedApp?.company || email.company || "Unknown Company",
        role: matchedApp?.title || email.app_title || "Unknown Role",
        snippet: (email.snippet || content).slice(0, 300),
      },
    )

    await query(
      `UPDATE email_logs
       SET application_id = COALESCE($1, application_id),
           classification = $2,
           classification_state = 'pending',
           classification_source = 'queue',
           classifier_prompt_hash = $3,
           classifier_prompt_tokens = $4,
           classification_error = NULL,
           manual_override = FALSE,
           classified_at = NULL
       WHERE id = $5`,
      [matchedAppId, classification, job.promptHash, job.estimatedInputTokens, email.id],
    )

    await enqueueClassificationJob(job)

    const updatedRes = await query<EmailLog>(
      `SELECT m.*, a.company, a.title as app_title
       FROM email_logs m
       LEFT JOIN applications a ON a.id = m.application_id
       WHERE m.id = $1`,
      [email.id],
    )

    return { queued: true, email: updatedRes.rows[0] }
  }

  const effectiveAppId = (classification === "unrelated" || classification === "conference") ? null : matchedAppId

  // Deterministic rule/gate exit
  await query(
    `UPDATE email_logs
     SET application_id = $1,
         classification = $2,
         classification_state = 'resolved',
         classification_source = $3,
         classification_error = NULL,
         manual_override = FALSE,
         classified_at = NOW()
     WHERE id = $4`,
    [effectiveAppId, classification, verdict.source, email.id],
  )

  if (effectiveAppId && classification !== "unrelated" && classification !== "conference") {
    let newStatus: string | null = null
    if (classification === "interview") newStatus = "interviewing"
    else if (classification === "offer") newStatus = "offer"
    else if (classification === "rejection") newStatus = "rejected"
    else if (classification === "assessment") newStatus = "technical_assessment"
    else if (classification === "confirmation") newStatus = "applied"

    if (newStatus && matchedApp) {
      const STATUS_RANK: Record<string, number> = {
        wishlist: 0,
        applied: 1,
        interview_pending: 2,
        interviewing: 3,
        technical_assessment: 4,
        offer: 5,
        rejected: 6,
        archived: 7,
      }
      const currentRank = STATUS_RANK[matchedApp.status] ?? 0
      const nextRank = STATUS_RANK[newStatus] ?? 0
      if (
        (newStatus === "rejected" && matchedApp.status !== "rejected") ||
        (matchedApp.status !== "rejected" &&
          matchedApp.status !== "archived" &&
          nextRank > currentRank)
      ) {
        await query(`UPDATE applications SET status = $1, updated_at = NOW() WHERE id = $2`, [
          newStatus,
          effectiveAppId,
        ])
      }
    }

    await query(
      `INSERT INTO application_events (application_id, event_type, title, description, metadata)
       VALUES ($1, 'email_received', $2, $3, $4)`,
      [
        effectiveAppId,
        `Email reanalyzed: ${classification.toUpperCase()}`,
        `Subject: "${email.subject}" from ${email.sender}`,
        JSON.stringify({
          messageId: email.message_id,
          classification,
          subject: email.subject,
          sender: email.sender,
          source: verdict.source,
        }),
      ],
    )
  }

  const updatedRes = await query<EmailLog>(
    `SELECT m.*, a.company, a.title as app_title
     FROM email_logs m
     LEFT JOIN applications a ON a.id = m.application_id
     WHERE m.id = $1`,
    [email.id],
  )

  return { queued: false, email: updatedRes.rows[0] }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { id, applicationId } = body

    if (!id && !applicationId) {
      return NextResponse.json(
        { error: "Either email log ID or applicationId is required" },
        { status: 400 },
      )
    }

    if (applicationId) {
      const appEmails = await query<EmailLog>(
        `SELECT id FROM email_logs WHERE application_id = $1 ORDER BY received_at DESC`,
        [applicationId],
      )

      const results = []
      for (const row of appEmails.rows) {
        const res = await processReanalyze(row.id)
        if (res) results.push(res.email)
      }

      const updatedApp = await query<Application>(
        `SELECT * FROM applications WHERE id = $1`,
        [applicationId],
      )

      return NextResponse.json({
        success: true,
        reanalyzedCount: results.length,
        emails: results,
        application: updatedApp.rows[0] || null,
      })
    }

    const result = await processReanalyze(id)
    if (!result) {
      return NextResponse.json({ error: "Email log not found" }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      queued: result.queued,
      email: result.email,
    })
  } catch (error) {
    console.error("Failed to reanalyze email:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 },
    )
  }
}
