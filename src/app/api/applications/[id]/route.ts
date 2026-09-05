import { handle, notFound, ok } from "@/lib/api-response"
import {
  findById,
  findEmails,
  findEvents,
  findSuggestedEmails,
  remove,
  update,
} from "@/lib/repositories/applications"
import type { ApplicationPatch } from "@/lib/repositories/applications"
import { append } from "@/lib/repositories/events"

type Context = { params: Promise<{ id: string }> }

export const GET = handle(
  "Failed to fetch application details",
  async (request: Request, { params }: Context) => {
    const { id } = await params
    const application = await findById(id)
    if (!application) return notFound("Application not found")

    const [events, emails, suggestedEmails] = await Promise.all([
      findEvents(id),
      findEmails(id),
      findSuggestedEmails(application.company),
    ])

    return ok({ application: { ...application, events, emails, suggestedEmails } })
  },
)

export const PATCH = handle(
  "Failed to update application",
  async (request: Request, { params }: Context) => {
    const { id } = await params
    const body = (await request.json()) as ApplicationPatch & { note_entry?: string }

    const current = await findById(id)
    if (!current) return notFound("Application not found")

    const application = (await update(id, body)) ?? current

    // A status change and a note each leave their own timeline entry. Both are
    // written after the update so a failed write cannot log a change that did
    // not happen.
    if (typeof body.status === "string" && body.status !== current.status) {
      await append(id, {
        event_type: "status_change",
        title: `Status changed to ${body.status}`,
        description: `Status transitioned from "${current.status}" to "${body.status}"`,
        metadata: { oldStatus: current.status, newStatus: body.status },
      })
    }

    if (body.note_entry) {
      await append(id, {
        event_type: "note_added",
        title: "Note added",
        description: String(body.note_entry),
      })
    }

    return ok({ application })
  },
)

export const DELETE = handle(
  "Failed to delete application",
  async (request: Request, { params }: Context) => {
    const { id } = await params
    await remove(id)
    return ok({ success: true, message: "Application deleted" })
  },
)
