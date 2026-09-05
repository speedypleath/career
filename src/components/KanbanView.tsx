"use client"

import { useState } from "react"
import {
  Plus,
  FileText,
  Inbox,
} from "lucide-react"
import { getWorkplaceBadge, getPriorityBadge, formatAgo, cx } from "./format"
import type { Application, ApplicationStatus } from "@/types"

interface KanbanViewProps {
  applications: Application[]
  onSelectApplication: (id: string) => void
  onOpenAddModal: () => void
  onUpdateStatus: (id: string, newStatus: ApplicationStatus) => void
}

interface ColumnDef {
  id: ApplicationStatus
  title: string
  color: string
}

const COLUMNS: ColumnDef[] = [
  { id: "wishlist", title: "Wishlist / Leads", color: "border-zinc-700/60" },
  { id: "applied", title: "Applied / Awaiting", color: "border-blue-700/60" },
  { id: "interview_pending", title: "Interview Pending", color: "border-amber-700/60" },
  { id: "interviewing", title: "Interviewing", color: "border-emerald-700/60" },
  { id: "technical_assessment", title: "Tech Assessment", color: "border-purple-700/60" },
  { id: "offer", title: "Offers", color: "border-teal-500/60" },
  { id: "rejected", title: "Rejected", color: "border-red-800/60" },
]

export function KanbanView({
  applications,
  onSelectApplication,
  onOpenAddModal,
  onUpdateStatus,
}: KanbanViewProps) {
  const [selectedMobileCol, setSelectedMobileCol] = useState<ApplicationStatus | "all">("all")

  const displayedColumns = selectedMobileCol === "all"
    ? COLUMNS
    : COLUMNS.filter((c) => c.id === selectedMobileCol)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-base sm:text-lg font-bold tracking-tight text-[var(--color-fg)]">
            Application Pipeline Board
          </h1>
          <p className="text-xs text-[var(--color-muted)]">
            Drag an application to move it along.
          </p>
        </div>

        <button
          onClick={onOpenAddModal}
          className="flex items-center gap-1.5 rounded-[var(--radius-panel)] bg-[var(--color-accent)] px-3.5 py-1.5 text-xs font-semibold text-[#0b0c0f] shadow-sm hover:bg-[var(--color-accent)]/90 transition-all cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" />
          Track Application
        </button>
      </div>

      {/* Mobile Column Quick Filter Selector Tabs (md:hidden) */}
      <div className="flex md:hidden gap-1.5 overflow-x-auto pb-1.5 pt-0.5 no-scrollbar">
        <button
          onClick={() => setSelectedMobileCol("all")}
          className={cx(
            "rounded-full px-3 py-1 text-2xs font-medium shrink-0 border transition-colors",
            selectedMobileCol === "all"
              ? "border-[var(--color-accent)] bg-[var(--color-accent)]/20 text-[var(--color-accent)] font-semibold"
              : "border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-muted)]"
          )}
        >
          All Stages ({applications.length})
        </button>
        {COLUMNS.map((col) => {
          const count = applications.filter((a) => a.status === col.id).length
          const isSelected = selectedMobileCol === col.id
          return (
            <button
              key={col.id}
              onClick={() => setSelectedMobileCol(col.id)}
              className={cx(
                "rounded-full px-3 py-1 text-2xs font-medium shrink-0 border transition-colors flex items-center gap-1.5",
                isSelected
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)]/20 text-[var(--color-accent)] font-semibold"
                  : "border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-muted)]"
              )}
            >
              <span>{col.title.split("/")[0].trim()}</span>
              <span className="tnum text-3xs opacity-80">({count})</span>
            </button>
          )
        })}
      </div>

      {/* Kanban Board Horizontal Scroll Container */}
      <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-4 pt-1 min-h-[calc(100vh-250px)] snap-x">
        {displayedColumns.map((col) => {
          const colApps = applications.filter((a) => a.status === col.id)

          return (
            <div
              key={col.id}
              className={cx(
                "flex w-[82vw] sm:w-80 shrink-0 flex-col rounded-[var(--radius-panel)] border bg-[var(--color-rail)] p-3 space-y-3 snap-start",
                col.color
              )}
            >
              {/* Column Header */}
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-fg)]">
                    {col.title}
                  </span>
                  <span className="tnum rounded-full bg-[var(--color-surface)] px-2 py-0.5 text-3xs font-bold text-[var(--color-muted)] border border-[var(--color-line)]">
                    {colApps.length}
                  </span>
                </div>
              </div>

              {/* Column Cards */}
              <div className="flex-1 space-y-2.5 overflow-y-auto pr-1">
                {colApps.length === 0 ? (
                  <div className="rounded border border-dashed border-[var(--color-line)] p-6 text-center text-2xs text-[var(--color-faint)]">
                    No roles in this stage
                  </div>
                ) : (
                  colApps.map((app) => {
                    const workplaceBadge = getWorkplaceBadge(app.workplace_type)
                    const priorityBadge = getPriorityBadge(app.priority)

                    return (
                      <div
                        key={app.id}
                        onClick={() => onSelectApplication(app.id)}
                        className="group relative rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)] p-3.5 shadow-sm hover:border-[var(--color-accent)]/50 hover:bg-[var(--color-surface-hi)] cursor-pointer transition-all space-y-2"
                      >
                        {/* Company & Priority */}
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-bold text-xs text-[var(--color-fg)] group-hover:text-[var(--color-accent)] transition-colors">
                            {app.company}
                          </span>
                          <span className={cx("text-3xs px-1.5 py-0.2 rounded border font-mono font-bold", priorityBadge.bg)}>
                            {priorityBadge.label}
                          </span>
                        </div>

                        {/* Job Title */}
                        <div className="text-2xs font-medium text-[var(--color-muted)] line-clamp-2">
                          {app.title}
                        </div>

                        {/* Metadata badges */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-3xs">
                          <span className={cx("px-1.5 py-0.5 rounded border text-3xs", workplaceBadge.bg)}>
                            {workplaceBadge.label}
                          </span>
                          <span className="text-[var(--color-faint)] font-mono">
                            via {app.application_method}
                          </span>
                          {app.salary && (
                            <span className="text-emerald-400 font-mono text-3xs">
                              {app.salary}
                            </span>
                          )}
                        </div>

                        {/* Indicators & Footer */}
                        <div className="flex items-center justify-between pt-2 border-t border-[var(--color-line-soft)] text-3xs text-[var(--color-faint)]">
                          <span className="tnum">
                            {formatAgo(app.applied_at || app.created_at)}
                          </span>

                          <div className="flex items-center gap-1.5">
                            {app.cover_letter && (
                              <span title="Cover letter saved">
                                <FileText className="h-3 w-3 text-[var(--color-accent)]" />
                              </span>
                            )}
                            {app.emails_count !== undefined && Number(app.emails_count) > 0 && (
                              <span className="flex items-center gap-0.5 text-emerald-400 font-mono" title={`${app.emails_count} emails`}>
                                <Inbox className="h-3 w-3" />
                                {app.emails_count}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Quick Status Shift Controls on Hover */}
                        <div className="flex items-center justify-between pt-1 gap-1" onClick={(e) => e.stopPropagation()}>
                          <select
                            value={app.status}
                            onChange={(e) => onUpdateStatus(app.id, e.target.value as ApplicationStatus)}
                            className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] text-3xs text-[var(--color-muted)] py-1 px-1.5 focus:outline-none"
                          >
                            <option value="wishlist">Move: Wishlist</option>
                            <option value="applied">Move: Applied</option>
                            <option value="interview_pending">Move: Interview Pending</option>
                            <option value="interviewing">Move: Interviewing</option>
                            <option value="technical_assessment">Move: Assessment</option>
                            <option value="offer">Move: Offer 🎉</option>
                            <option value="rejected">Move: Rejected</option>
                            <option value="archived">Move: Archived</option>
                          </select>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
