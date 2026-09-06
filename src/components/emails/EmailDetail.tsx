"use client"

import { ArrowUpRight } from "lucide-react"
import { formatDateTime } from "../format"
import { ClassificationPicker } from "./ClassificationPicker"
import type { Application, EmailLog } from "@/types"

interface EmailDetailProps {
  email: EmailLog
  applications: Application[]
  onChangeClassification: (classification: string) => void
  onChangeApplication: (applicationId: string | null) => void
  onReanalyze: () => void
  reanalyzing: boolean
  linking: boolean
  onOpenApplication: (applicationId: string) => void
  bodyClassName?: string
  onToggleFollowUp?: (done: boolean) => void
  followUpBusy?: boolean
}

/**
 * One detail panel, shown in the desktop rail and inside the mobile sheet.
 *
 * These were two copies of the same markup that had already drifted — the
 * mobile one labelled the body "Body" and the desktop one "Body / Content",
 * and only one of them closed the sheet after opening an application.
 */
export function EmailDetail({
  email,
  applications,
  onChangeClassification,
  onChangeApplication,
  onReanalyze,
  reanalyzing,
  linking,
  onOpenApplication,
  bodyClassName = "max-h-64",
  onToggleFollowUp,
  followUpBusy,
}: EmailDetailProps) {
  return (
    <div className="space-y-4">
      {onToggleFollowUp && (
        <div className="flex items-center justify-between rounded border border-[var(--color-line)] bg-[var(--color-surface-hi)] px-3 py-2">
          <span className="text-2xs text-[var(--color-muted)]">
            {email.follow_up_done ? "Marked as handled" : "Needs a follow-up"}
          </span>
          <button
            type="button"
            onClick={() => onToggleFollowUp(!email.follow_up_done)}
            disabled={followUpBusy}
            className="rounded border border-[var(--color-line)] px-2 py-1 text-2xs text-[var(--color-fg)] hover:border-[var(--color-accent)] disabled:opacity-50 transition-colors"
          >
            {email.follow_up_done ? "Mark as needing follow-up" : "Mark as handled"}
          </button>
        </div>
      )}

      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-3xs text-[var(--color-faint)]">Classification</span>
          <ClassificationPicker
            value={email.classification}
            onChange={onChangeClassification}
            onReanalyze={onReanalyze}
            reanalyzing={reanalyzing}
          />
        </div>

        <div className="text-right">
          <span className="text-3xs text-[var(--color-faint)]">Received</span>
          <div className="text-2xs text-[var(--color-fg)] tnum mt-1">
            {formatDateTime(email.received_at || email.created_at)}
          </div>
        </div>
      </div>

      <div>
        <span className="text-3xs text-[var(--color-faint)]">Sender</span>
        <p className="text-xs font-mono text-[var(--color-fg)] break-all mt-0.5">{email.sender}</p>
      </div>

      <div>
        <span className="text-3xs text-[var(--color-faint)]">Subject</span>
        <p className="text-xs font-bold text-[var(--color-fg)] mt-0.5">{email.subject}</p>
      </div>

      <div>
        <span className="text-3xs text-[var(--color-faint)]">Application</span>
        <div className="mt-1 flex items-center gap-1.5">
          <select
            value={email.application_id ?? ""}
            onChange={(e) => onChangeApplication(e.target.value || null)}
            disabled={linking}
            aria-label="Linked application"
            className="flex-1 min-w-0 rounded border border-[var(--color-line)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-fg)] focus:border-[var(--color-accent)] focus:outline-none disabled:opacity-50"
          >
            <option value="">Not linked</option>
            {applications.map((app) => (
              <option key={app.id} value={app.id}>
                {app.company} — {app.title}
              </option>
            ))}
          </select>
          {email.application_id && (
            <button
              type="button"
              onClick={() => onOpenApplication(email.application_id!)}
              title="Open application"
              className="shrink-0 rounded border border-[var(--color-line)] bg-[var(--color-surface-hi)] p-1.5 text-[var(--color-muted)] hover:text-[var(--color-accent)] transition-colors"
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div>
        <span className="text-3xs text-[var(--color-faint)]">Body</span>
        <div
          className={`mt-1.5 ${bodyClassName} overflow-y-auto rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-3 text-xs text-[var(--color-muted)] font-mono whitespace-pre-wrap`}
        >
          {email.body || email.snippet || "This message had no readable body."}
        </div>
      </div>
    </div>
  )
}
