import { Prisma } from "@prisma/client"
import { prisma } from "../prisma"

/**
 * Timeline entries. Every writer of an application also writes one of these,
 * so it is worth having exactly one place that knows the column names.
 *
 * metadata defaults to an empty object, which is the column default the old
 * inserts relied on by leaving it out.
 */
export async function append(
  applicationId: string,
  event: {
    event_type: string
    title: string
    description?: string
    metadata?: Record<string, unknown>
  },
): Promise<void> {
  await prisma.application_events.create({
    data: {
      application_id: applicationId,
      event_type: event.event_type,
      title: event.title,
      description: event.description ?? "",
      metadata: (event.metadata ?? {}) as Prisma.InputJsonObject,
    },
  })
}
