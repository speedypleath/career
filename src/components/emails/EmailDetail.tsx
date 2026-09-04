"use client"

import { ArrowUpRight } from "lucide-react"
import { formatDateTime } from "../format"
import { ClassificationPicker } from "./ClassificationPicker"
import type { EmailLog } from "@/types"

interface EmailDetailProps {
  email: EmailLog
  onChangeClassification: (classification: string) => void
  onReanalyze: () => void
  reanalyzing: boolean
  onOpenApplication: (applicationId: string) => void
  bodyClassName?: string
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
  onChangeClassification,
  onReanalyze,
  reanalyzing,
  onOpenApplication,
  bodyClassName = "max-h-64",
}: EmailDetailProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="label text-[9px]">Classification</span>
          <ClassificationPicker
            value={email.classification}
            onChange={onChangeClassification}
            onReanalyze={onReanalyze}
            reanalyzing={reanalyzing}
          />
        </div>

        <div className="text-right">
          <span className="label text-[9px]">Received</span>
          <div className="text-[11px] text-[var(--color-fg)] tnum mt-1">
            {formatDateTime(email.received_at || email.created_at)}
          </div>
        </div>
      </div>

      <div>
        <span className="label text-[9px]">Sender</span>
        <p className="text-xs font-mono text-[var(--color-fg)] break-all mt-0.5">{email.sender}</p>
      </div>

      <div>
        <span className="label text-[9px]">Subject</span>
        <p className="text-xs font-bold text-[var(--color-fg)] mt-0.5">{email.subject}</p>
      </div>

      {email.application_id && (
        <div className="rounded border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/5 p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[var(--color-accent)] font-semibold truncate">
              Linked to {email.company || "an application"}
            </span>
            <button
              onClick={() => onOpenApplication(email.application_id!)}
              className="text-[10px] text-[var(--color-fg)] hover:text-[var(--color-accent)] flex items-center gap-0.5 shrink-0"
            >
              Open <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      <div>
        <span className="label text-[9px]">Body</span>
        <div
          className={`mt-1.5 ${bodyClassName} overflow-y-auto rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-3 text-xs text-[var(--color-muted)] font-mono whitespace-pre-wrap`}
        >
          {email.body || email.snippet || "This message had no readable body."}
        </div>
      </div>
    </div>
  )
}
