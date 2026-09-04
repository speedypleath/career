import { badRequest, handle, ok } from "@/lib/api-response"
import { create, findByCompanyAndTitle, mergeFromWebhook } from "@/lib/repositories/applications"
import { append } from "@/lib/repositories/events"
import { normalizeWebhookPayload } from "@/lib/webhook-payload"

export const GET = handle("Failed to describe the webhook", async () => {
  return ok({
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
      source: "audio-job-hunter-cron",
    },
    curl_example: `curl -X POST http://127.0.0.1:8098/api/webhook/application -H "Content-Type: application/json" -d '{"title":"Audio Software Engineer","company":"ExampleCo","workplace_type":"remote","status":"applied"}'`,
  })
})

export const POST = handle("Webhook processing error", async (request: Request) => {
  const body = (await request.json()) as Record<string, unknown>
  const input = normalizeWebhookPayload(body)

  if (!input.title || !input.company) {
    return badRequest("Both 'title' and 'company' are required in the payload")
  }

  // An application is identified by its company and title, so a caller that
  // reports the same posting twice updates it rather than duplicating it.
  const existing = await findByCompanyAndTitle(input.company, input.title)

  if (existing) {
    const application = await mergeFromWebhook(existing.id, input)
    await append(existing.id, {
      event_type: "updated",
      title: `Webhook updated application: ${input.title}`,
      description: `Updated application details from source: ${input.source}`,
      metadata: { source: input.source, updatedFields: body },
    })
    return ok({ success: true, action: "updated", id: existing.id, application })
  }

  const application = await create(input)
  await append(application.id, {
    event_type: "webhook_created",
    title: "Application logged via webhook",
    description: `Auto-created for ${input.title} at ${input.company} (Source: ${input.source})`,
    metadata: { source: input.source, payload: body },
  })
  return ok({ success: true, action: "created", id: application.id, application }, 201)
})
