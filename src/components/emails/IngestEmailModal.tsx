"use client"

import { useState } from "react"
import { ingestEmail } from "@/lib/api-client"

interface IngestEmailModalProps {
  onClose: () => void
  onIngested: () => void
}

/** Paste a message in by hand and run it through the same classifier. */
export function IngestEmailModal({ onClose, onIngested }: IngestEmailModalProps) {
  const [sender, setSender] = useState("")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!sender || !subject) return

    setSubmitting(true)
    setError(null)
    try {
      await ingestEmail({ sender, subject, body, snippet: body.slice(0, 200) })
      onIngested()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that email")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)] p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-[var(--color-fg)]">Add an email by hand</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-[var(--color-faint)] hover:text-[var(--color-fg)]"
          >
            ✕
          </button>
        </div>

        {error && (
          <p className="rounded border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-3 py-2 text-xs text-[var(--color-danger)]">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="ingest-sender" className="mb-1 block text-2xs text-[var(--color-faint)]">
              Sender
            </label>
            <input
              id="ingest-sender"
              type="text"
              placeholder="jobs@spotify.com"
              required
              value={sender}
              onChange={(e) => setSender(e.target.value)}
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-2 text-xs text-[var(--color-fg)] focus:border-[var(--color-accent)] focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="ingest-subject" className="mb-1 block text-2xs text-[var(--color-faint)]">
              Subject
            </label>
            <input
              id="ingest-subject"
              type="text"
              placeholder="Invitation to interview with Reaktor"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-2 text-xs text-[var(--color-fg)] focus:border-[var(--color-accent)] focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="ingest-body" className="mb-1 block text-2xs text-[var(--color-faint)]">
              Body
            </label>
            <textarea
              id="ingest-body"
              rows={5}
              placeholder="Paste the message here"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-2 text-xs text-[var(--color-fg)] focus:border-[var(--color-accent)] focus:outline-none font-mono"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-[var(--color-line)] px-3 py-1.5 text-xs text-[var(--color-muted)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-[#0b0c0f] disabled:opacity-50"
            >
              {submitting ? "Classifying" : "Add and classify"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
