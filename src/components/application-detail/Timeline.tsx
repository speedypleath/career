"use client"

import { useState } from "react"
import { CheckCircle2, ChevronDown, ChevronRight, Clock, Mail, Send } from "lucide-react"
import { formatDateTime } from "../format"
import type { ApplicationEvent, EmailLog } from "@/types"

interface TimelineProps {
  events: ApplicationEvent[]
  emails: EmailLog[]
  /** Resolves once the note is saved; rejecting leaves the draft in the box. */
  onAddNote: (note: string) => Promise<void>
  submitting: boolean
}

function EventIcon({ type }: { type: ApplicationEvent["event_type"] }) {
  if (type === "status_change") return <Clock className="h-4 w-4 text-[var(--color-warn)]" />
  if (type === "email_received") return <Mail className="h-4 w-4 text-[var(--color-muted)]" />
  return <CheckCircle2 className="h-4 w-4 text-[var(--color-muted)]" />
}

/**
 * Both write sites for an "email_received" event — email-scanner.ts's
 * handleNewEmail and the finalize_email_classification RPC — stamp this same
 * shape into metadata. Older rows predating the RPC's messageId field won't
 * have one; treat every field as possibly absent rather than assume it.
 */
interface EmailReceivedMetadata {
  messageId?: string
  classification?: string
  snippet?: string
  source?: string
}

function eventEmailMetadata(event: ApplicationEvent): EmailReceivedMetadata | null {
  if (event.event_type !== "email_received" || !event.metadata) return null
  return event.metadata as EmailReceivedMetadata
}

export function Timeline({ events, emails, onAddNote, submitting }: TimelineProps) {
  const [note, setNote] = useState("")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = note.trim()
    if (!trimmed) return
    await onAddNote(trimmed)
    setNote("")
  }

  function toggleExpanded(eventId: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(eventId)) next.delete(eventId)
      else next.add(eventId)
      return next
    })
  }

  // messageId is unique per email_logs row (schema.sql's UNIQUE constraint),
  // so this is a safe 1:1 lookup — not just "the latest with this id".
  const emailsByMessageId = new Map(emails.filter((e) => e.message_id).map((e) => [e.message_id, e]))

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          placeholder="What happened? e.g. Finished the screening call"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="flex-1 rounded border border-[var(--color-line)] bg-[var(--color-bg)] py-2 px-3 text-xs text-[var(--color-fg)] placeholder-[var(--color-faint)] focus:border-[var(--color-accent)] focus:outline-none"
        />
        <button
          type="submit"
          disabled={submitting || !note.trim()}
          className="flex items-center gap-1.5 rounded bg-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-[#0b0c0f] hover:bg-[var(--color-accent)]/90 disabled:opacity-50 transition-colors"
        >
          <Send className="h-3.5 w-3.5" />
          {submitting ? "Adding" : "Add note"}
        </button>
      </form>

      {emails.length > 0 && (
        <div className="space-y-2">
          <h5 className="text-xs font-semibold text-[var(--color-fg)]">Mail received</h5>
          {emails.map((email) => (
            <div
              key={email.id}
              className="rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-3 space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-[var(--color-fg)] truncate">{email.subject}</span>
                <span className="text-3xs text-[var(--color-faint)] shrink-0">
                  {formatDateTime(email.received_at)}
                </span>
              </div>
              <div className="text-2xs text-[var(--color-faint)]">
                From <span className="text-[var(--color-muted)]">{email.sender}</span> · read as{" "}
                <span className="text-[var(--color-muted)]">{email.classification}</span>
              </div>
              {email.snippet && (
                <div className="text-xs text-[var(--color-muted)] font-mono bg-[var(--color-surface)] p-2 rounded line-clamp-3">
                  {email.snippet}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <h5 className="text-xs font-semibold text-[var(--color-fg)]">Activity</h5>
        {events.length > 0 ? (
          events.map((event) => {
            const emailMeta = eventEmailMetadata(event)
            const sourceEmail = emailMeta?.messageId ? emailsByMessageId.get(emailMeta.messageId) : undefined
            const isExpanded = expanded.has(event.id)

            return (
              <div
                key={event.id}
                className="rounded border border-[var(--color-line)] bg-[var(--color-surface-hi)]/30 p-3"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    <EventIcon type={event.event_type} />
                  </div>
                  <div className="flex-1 space-y-0.5 min-w-0">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-[var(--color-fg)]">{event.title}</span>
                      <span className="text-3xs text-[var(--color-faint)] shrink-0">
                        {formatDateTime(event.created_at)}
                      </span>
                    </div>
                    {event.description && (
                      <p className="text-xs text-[var(--color-muted)]">{event.description}</p>
                    )}
                  </div>
                  {emailMeta && (
                    <button
                      type="button"
                      onClick={() => toggleExpanded(event.id)}
                      className="mt-0.5 flex shrink-0 items-center gap-0.5 text-3xs text-[var(--color-faint)] hover:text-[var(--color-fg)]"
                    >
                      {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      email
                    </button>
                  )}
                </div>

                {isExpanded && emailMeta && (
                  <div className="mt-2 ml-7 rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-2.5 space-y-1.5">
                    {sourceEmail ? (
                      <>
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-[var(--color-fg)] truncate">
                            {sourceEmail.subject}
                          </span>
                          <span className="text-3xs text-[var(--color-faint)] shrink-0">
                            {formatDateTime(sourceEmail.received_at)}
                          </span>
                        </div>
                        <div className="text-2xs text-[var(--color-faint)]">
                          From <span className="text-[var(--color-muted)]">{sourceEmail.sender}</span> · read as{" "}
                          <span className="text-[var(--color-muted)]">{sourceEmail.classification}</span>
                        </div>
                        {(sourceEmail.body || sourceEmail.snippet) && (
                          <div className="text-xs text-[var(--color-muted)] font-mono bg-[var(--color-surface)] p-2 rounded max-h-48 overflow-y-auto whitespace-pre-wrap">
                            {sourceEmail.body || sourceEmail.snippet}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="text-2xs text-[var(--color-faint)]">
                          Original email not linked to this application anymore — read as{" "}
                          <span className="text-[var(--color-muted)]">{emailMeta.classification ?? "unknown"}</span>
                          {emailMeta.source && (
                            <>
                              {" "}
                              via <span className="text-[var(--color-muted)]">{emailMeta.source}</span>
                            </>
                          )}
                          .
                        </p>
                        {emailMeta.snippet && (
                          <div className="text-xs text-[var(--color-muted)] font-mono bg-[var(--color-surface)] p-2 rounded whitespace-pre-wrap">
                            {emailMeta.snippet}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })
        ) : (
          <p className="text-xs text-[var(--color-faint)] py-4 text-center">
            Nothing logged yet. Add a note above to start the trail.
          </p>
        )}
      </div>
    </div>
  )
}
