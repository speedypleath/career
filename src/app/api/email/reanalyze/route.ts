import { badRequest, handle, notFound, ok } from "@/lib/api-response"
import { classifyEmailDetailed } from "@/lib/email-classifier"
import { buildClassificationJob, enqueueClassificationJob } from "@/lib/email-classification-queue"
import { shouldAdvanceStatus, statusForClassification } from "@/lib/email/status"
import {
  findAllForMatching,
  findBasics,
  findById,
  matchByCompanyMention,
  setStatus,
} from "@/lib/repositories/applications"
import {
  findIdsByApplication,
  findWithApplication,
  markReanalysisQueued,
  markReanalysisResolved,
} from "@/lib/repositories/email-logs"
import type { EmailLogJoined } from "@/lib/repositories/email-logs"
import { append } from "@/lib/repositories/events"

const SNIPPET_CHARS = 300

/** Classifications that mean the email belongs to no application at all. */
const UNATTACHED = new Set(["unrelated", "conference"])

async function reanalyze(emailId: string): Promise<{ queued: boolean; email: EmailLogJoined } | null> {
  const email = await findWithApplication(emailId)
  if (!email) return null

  const content = email.body || email.snippet || ""

  const matched = email.application_id
    ? await findBasics(email.application_id)
    : matchByCompanyMention(await findAllForMatching(), email.sender, email.subject, content)
  const matchedAppId = email.application_id || matched?.id || null

  const verdict = await classifyEmailDetailed({
    subject: email.subject,
    body: content,
    sender: email.sender,
  })
  const classification = verdict.classification

  if (verdict.source === "fallback") {
    const job = buildClassificationJob(
      { subject: email.subject, body: content, sender: email.sender },
      {
        emailLogId: email.id,
        messageId: email.message_id,
        applicationId: matchedAppId,
        sender: email.sender,
        subject: email.subject,
        company: matched?.company || email.company || "Unknown Company",
        role: matched?.title || email.app_title || "Unknown Role",
        snippet: (email.snippet || content).slice(0, SNIPPET_CHARS),
      },
    )

    await markReanalysisQueued(email.id, {
      applicationId: matchedAppId,
      classification,
      promptHash: job.promptHash,
      promptTokens: job.estimatedInputTokens,
    })
    await enqueueClassificationJob(job)

    return { queued: true, email: (await findWithApplication(email.id))! }
  }

  // A gate or a rule decided it outright.
  const effectiveAppId = UNATTACHED.has(classification) ? null : matchedAppId

  await markReanalysisResolved(email.id, {
    applicationId: effectiveAppId,
    classification,
    source: verdict.source,
  })

  if (effectiveAppId) {
    const newStatus = statusForClassification(classification)
    if (newStatus && matched && shouldAdvanceStatus(matched.status, newStatus)) {
      await setStatus(effectiveAppId, newStatus)
    }

    await append(effectiveAppId, {
      event_type: "email_received",
      title: `Email reanalyzed: ${classification.toUpperCase()}`,
      description: `Subject: "${email.subject}" from ${email.sender}`,
      metadata: {
        messageId: email.message_id,
        classification,
        subject: email.subject,
        sender: email.sender,
        source: verdict.source,
      },
    })
  }

  return { queued: false, email: (await findWithApplication(email.id))! }
}

export const POST = handle("Failed to reanalyze email", async (request: Request) => {
  const { id, applicationId } = (await request.json()) as { id?: string; applicationId?: string }

  if (!id && !applicationId) {
    return badRequest("Either email log ID or applicationId is required")
  }

  // Reanalyzing a whole application walks its emails newest first, in order,
  // because each one may advance the application's status for the next.
  if (applicationId) {
    const emails: EmailLogJoined[] = []
    for (const logId of await findIdsByApplication(applicationId)) {
      const result = await reanalyze(logId)
      if (result) emails.push(result.email)
    }

    return ok({
      success: true,
      reanalyzedCount: emails.length,
      emails,
      application: await findById(applicationId),
    })
  }

  const result = await reanalyze(id!)
  if (!result) return notFound("Email log not found")

  return ok({ success: true, queued: result.queued, email: result.email })
})
