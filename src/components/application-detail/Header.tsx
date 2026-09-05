"use client"

import { Calendar, DollarSign, Edit2, ExternalLink, Globe, Trash2, X } from "lucide-react"
import { cx, formatDate, getPriorityBadge, getWorkplaceBadge } from "../format"
import type { Application } from "@/types"

interface HeaderProps {
  application: Application | null
  editing: boolean
  onToggleEdit: () => void
  onDelete: () => void
  onClose: () => void
}

export function Header({ application, editing, onToggleEdit, onDelete, onClose }: HeaderProps) {
  const workplaceBadge = application ? getWorkplaceBadge(application.workplace_type) : null
  const priorityBadge = application ? getPriorityBadge(application.priority) : null

  return (
    <div className="flex items-start justify-between border-b border-[var(--color-line)] p-4 sm:p-6 bg-[var(--color-surface-hi)]/40 gap-3">
      <div className="space-y-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-base sm:text-lg font-bold text-[var(--color-fg)] truncate">
            {application?.title || "Application"}
          </h2>
          <span className="text-xs sm:text-sm font-semibold text-[var(--color-accent)]">
            @ {application?.company}
          </span>
          {workplaceBadge && (
            <span className={cx("rounded border px-1.5 py-0.2 text-[9px] font-medium uppercase", workplaceBadge.bg)}>
              {workplaceBadge.label}
            </span>
          )}
          {priorityBadge && (
            <span className={cx("rounded border px-1.5 py-0.2 text-[9px] font-mono", priorityBadge.bg)}>
              {priorityBadge.label}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2.5 text-xs text-[var(--color-faint)] flex-wrap pt-0.5">
          <span className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            {formatDate(application?.applied_at)}
          </span>
          {application?.location && (
            <span className="flex items-center gap-1">
              <Globe className="h-3.5 w-3.5" />
              {application.location}
            </span>
          )}
          {application?.salary && (
            <span className="flex items-center gap-1 text-[var(--color-muted)]">
              <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
              {application.salary}
            </span>
          )}
          {application?.url && (
            <a
              href={application.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[var(--color-accent)] hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open posting
            </a>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={onToggleEdit}
          className={cx(
            "flex items-center gap-1 rounded border px-2 py-1 text-xs transition-colors",
            editing
              ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
              : "border-[var(--color-line)] text-[var(--color-muted)] hover:bg-[var(--color-surface-hi)]",
          )}
        >
          <Edit2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{editing ? "Done" : "Edit"}</span>
        </button>
        <button
          onClick={onDelete}
          title="Delete this application"
          className="rounded border border-[var(--color-danger)]/30 p-1.5 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/20 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded p-1 text-[var(--color-faint)] hover:bg-[var(--color-surface-hi)] hover:text-[var(--color-fg)] transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
