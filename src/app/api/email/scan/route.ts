import { randomUUID } from "node:crypto"
import { badRequest, handle, ok } from "@/lib/api-response"
import { classifyEmailDetailed, scanEmails } from "@/lib/email-scanner"
import { buildClassificationJob, enqueueClassificationJob } from "@/lib/email-classification-queue"
import { shouldAdvanceStatus, statusForClassification } from "@/lib/email/status"
import { OWNER_EMAIL } from "@/lib/owner"
import { findAllForMatching, findBasics, matchByCompanyMention, setStatus } from "@/lib/repositories/applications"
import { markQueueFailed, upsertScanned } from "@/lib/repositories/email-logs"
import { append } from "@/lib/repositories/events"

export const GET = handle("Email scan failed", async () => {
  const result = await scanEmails()
  return ok({
    success: true,
    message: `Scan finished. Scanned: ${result.scannedCount}, Matched: ${result.matchedCount}, Queued: ${result.queuedCount}, Skipped: ${result.skippedCount}, New logged: ${result.newEmails.length}`,
    ...result,
  })
})

const SNIPPET_CHARS = 300

/** Ingest or test a single email message. */
export const POST = handle("Failed to ingest email", async (request: Request) => {
  const body = await request.json()
  const {
    sender,
    recipient = OWNER_EMAIL,
    subject,
    body: emailBody = "",
    snippet = "",
    application_id,
    received_at = new Date().toISOString(),
  } = body

  if (!sender || !subject) return badRequest("Both 'sender' and 'subject' are required")

  const fullContent = snippet || emailBody
  const messageId =
    body.message_id || `manual-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`

  const matched = application_id
    ? await findBasics(application_id)
    : matchByCompanyMention(await findAllForMatching(), sender, subject, fullContent)

  // An explicitly supplied application_id is honoured even when no row matches
  // it, which is what the original code did by keeping the id and a null row.
  const matchedAppId = application_id || matched?.id || null

  const verdict = body.classification
    ? null
    : await classifyEmailDetailed({ subject, body: emailBody || fullContent, sender })
  const classification = body.classification || verdict?.classification || "unrelated"
  const queued = verdict?.source === "fallback"
  const emailLogId = randomUUID()

  const job = queued
    ? buildClassificationJob(
        { subject, body: emailBody || fullContent, sender },
        {
          emailLogId,
          messageId,
          applicationId: matchedAppId,
          sender,
          subject,
          company: matched?.company || "Unknown Company",
          role: matched?.title || "Unknown Role",
          snippet: fullContent.slice(0, SNIPPET_CHARS),
        },
      )
    : null

  const savedEmail = await upsertScanned({
    id: emailLogId,
    applicationId: matchedAppId,
    messageId,
    sender,
    recipient,
    subject,
    snippet: fullContent.slice(0, SNIPPET_CHARS),
    body: emailBody,
    classification,
    state: queued ? "pending" : "resolved",
    source: queued ? "queue" : body.classification ? "manual" : verdict?.source || "fallback",
    promptHash: job?.promptHash || null,
    promptTokens: job?.estimatedInputTokens || null,
    receivedAt: received_at,
  })

  if (job) {
    try {
      await enqueueClassificationJob({ ...job, emailLogId: savedEmail.id })
    } catch (error) {
      // Leaving the row 'pending' with nothing to process it would strand it.
      await markQueueFailed(
        savedEmail.id,
        error instanceof Error ? error.message : "Queue unavailable",
      )
      throw error
    }

    return ok({ success: true, queued: true, email: savedEmail, matchedApplicationId: matchedAppId }, 202)
  }

  if (matchedAppId) {
    // This route used to carry its own copy of the rule: three classifications
    // instead of five, and no rank check, so ingesting an interview notice
    // after an offer rewound the application to "interviewing". It now uses the
    // same pair as the scanner and reanalyze, so status cannot go backwards
    // here either.
    const newStatus = statusForClassification(classification)
    if (newStatus && matched && shouldAdvanceStatus(matched.status, newStatus)) {
      await setStatus(matchedAppId, newStatus)
    }

    await append(matchedAppId, {
      event_type: "email_received",
      title: `Email: ${classification.toUpperCase()}`,
      description: `Subject: "${subject}" from ${sender}`,
      metadata: { messageId, classification, subject, sender },
    })
  }

  return ok({ success: true, email: savedEmail, matchedApplicationId: matchedAppId })
})
