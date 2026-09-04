import { badRequest, handle, ok } from "@/lib/api-response"
import { create, findAll } from "@/lib/repositories/applications"
import type { NewApplication } from "@/lib/repositories/applications"
import { append } from "@/lib/repositories/events"

export const GET = handle("Failed to fetch applications", async (request: Request) => {
  const { searchParams } = new URL(request.url)
  const applications = await findAll({
    status: searchParams.get("status"),
    workplace: searchParams.get("workplace"),
    search: searchParams.get("search"),
    sort: searchParams.get("sort"),
  })
  return ok({ applications })
})

export const POST = handle("Failed to create application", async (request: Request) => {
  const input = (await request.json()) as NewApplication
  if (!input.title || !input.company) return badRequest("Title and Company are required")

  const application = await create(input)

  await append(application.id, {
    event_type: "created",
    title: `Applied to ${application.company}`,
    description: `Position: ${application.title} (${application.workplace_type}) via ${application.application_method}`,
  })

  return ok({ application }, 201)
})
