import { badRequest, handle, ok } from "@/lib/api-response"
import { OWNER_EMAIL } from "@/lib/owner"
import { buildCustomFollowUp, insertFollowUp } from "@/lib/repositories/email-logs"
import type { CustomFollowUpInput } from "@/lib/repositories/email-logs"

/**
 * Create a follow-up that isn't a real email — e.g. an external job-search
 * tool found a listing it can only half-automate, and wants a link parked
 * here for a human to finish submitting. It shows up on the Follow-ups tab
 * exactly like any other assessment/question/interview row, because that tab
 * is just a filtered view over email_logs (see FOLLOW_UP_CLASSIFICATIONS in
 * src/lib/repositories/email-logs.ts).
 */
export const POST = handle("Failed to create follow-up", async (request: Request) => {
  const input = (await request.json()) as CustomFollowUpInput

  const row = buildCustomFollowUp(input, OWNER_EMAIL)
  if (typeof row === "string") return badRequest(row)

  const email = await insertFollowUp(row)
  return ok({ email }, 201)
})
