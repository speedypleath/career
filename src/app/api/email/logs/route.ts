import { badRequest, handle, ok } from "@/lib/api-response"
import { findAll, update } from "@/lib/repositories/email-logs"
import type { LogPatch } from "@/lib/repositories/email-logs"

export const GET = handle("Failed to fetch email logs", async (request: Request) => {
  const { searchParams } = new URL(request.url)
  const emails = await findAll({
    classification: searchParams.get("classification"),
    search: searchParams.get("search"),
    excludeUnrelated: searchParams.get("excludeUnrelated") === "true",
  })
  return ok({ emails })
})

export const PATCH = handle("Failed to update email log", async (request: Request) => {
  const { id, ...patch } = (await request.json()) as LogPatch & { id?: string }
  if (!id) return badRequest("Email log ID is required")

  const email = await update(id, patch)
  if (!email) return ok({ message: "Nothing to update" })
  return ok({ email })
})
