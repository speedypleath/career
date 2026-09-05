import { handle, ok } from "@/lib/api-response"
import { get, update } from "@/lib/repositories/settings"
import type { SettingsPatch } from "@/lib/repositories/settings"

export const GET = handle("Failed to get email settings", async () => {
  return ok({ settings: await get() })
})

export const PATCH = handle("Failed to update email settings", async (request: Request) => {
  const patch = (await request.json()) as SettingsPatch
  return ok({ settings: await update(patch) })
})
