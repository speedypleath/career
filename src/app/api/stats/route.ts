import { handle, ok } from "@/lib/api-response"
import { overview } from "@/lib/repositories/stats"

export const GET = handle("Failed to fetch stats", async () => {
  return ok({ stats: await overview() })
})
