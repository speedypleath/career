"use client"

import { Building, Sparkles } from "lucide-react"
import { cx, formatAgo } from "../format"
import { badgeFor } from "./classification"
import type { EmailLog } from "@/types"

interface EmailRowProps {
  email: EmailLog
  selected: boolean
  reanalyzing: boolean
  onSelect: () => void
  onReanalyze: (e: React.MouseEvent) => void
}

export function EmailRow({ email, selected, reanalyzing, onSelect, onReanalyze }: EmailRowProps) {
  const badge = badgeFor(email.classification, email.classification_state)

  return (
    <div
      onClick={onSelect}
      className={cx(
        "group p-3.5 cursor-pointer transition-colors space-y-1.5",
        selected
          ? "bg-[var(--color-surface-hi)] border-l-2 border-l-[var(--color-accent)]"
          : "hover:bg-[var(--color-surface-hi)]/60",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-xs text-[var(--color-fg)] truncate">
            {email.sender}
          </span>
          <span
            className={cx(
              "text-[9px] px-1.5 py-0.2 rounded border font-mono font-bold shrink-0",
              badge.bg,
            )}
          >
            {badge.label}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onReanalyze}
            disabled={reanalyzing}
            title="Run the classifier over this email again"
            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-[var(--color-surface)] rounded px-1.5 py-0.5 text-[10px] text-[var(--color-muted)] hover:text-[var(--color-accent)] border border-transparent hover:border-[var(--color-line)] transition-all flex items-center gap-1"
          >
            <Sparkles
              className={cx("h-3 w-3", reanalyzing && "animate-spin text-[var(--color-accent)]")}
            />
            <span>{reanalyzing ? "Reanalyzing" : "Reanalyze"}</span>
          </button>
          <span className="tnum text-[10px] text-[var(--color-faint)]">
            {formatAgo(email.received_at || email.created_at)}
          </span>
        </div>
      </div>

      <div className="text-xs font-medium text-[var(--color-fg)] truncate">{email.subject}</div>
      <div className="text-[11px] text-[var(--color-muted)] line-clamp-1">{email.snippet}</div>

      {email.company && (
        <div className="flex items-center gap-1.5 pt-0.5 text-[10px] text-[var(--color-accent)]">
          <Building className="h-3 w-3" />
          <span>
            Linked to <strong>{email.company}</strong>
          </span>
        </div>
      )}
    </div>
  )
}
