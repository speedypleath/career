"use client"

import { useState } from "react"
import {
  Search,
  Filter,
  Plus,
  ArrowUpDown,
  Building,
  Globe,
  Mail,
  ExternalLink,
  FileText,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  MoreVertical,
  Trash2,
  Edit2,
  Inbox
} from "lucide-react"
import { StatusDot } from "./StatusDot"
import { getStatusColor, getWorkplaceBadge, getPriorityBadge, formatDate, formatAgo, cx } from "./format"
import type { Application, ApplicationStatus, WorkplaceType, ApplicationMethod } from "@/types"

interface ApplicationsViewProps {
  applications: Application[]
  onSelectApplication: (id: string) => void
  onOpenAddModal: () => void
  onUpdateStatus: (id: string, newStatus: ApplicationStatus) => void
  onRefresh: () => void
}

type SortKey = "recent" | "company" | "priority" | "status"

export function ApplicationsView({
  applications,
  onSelectApplication,
  onOpenAddModal,
  onUpdateStatus,
  onRefresh,
}: ApplicationsViewProps) {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [workplaceFilter, setWorkplaceFilter] = useState<string>("all")
  const [methodFilter, setMethodFilter] = useState<string>("all")
  const [sortBy, setSortBy] = useState<SortKey>("recent")

  // Filtered and sorted applications
  const filtered = applications
    .filter((app) => {
      const matchesSearch =
        search === "" ||
        app.title.toLowerCase().includes(search.toLowerCase()) ||
        app.company.toLowerCase().includes(search.toLowerCase()) ||
        app.location.toLowerCase().includes(search.toLowerCase()) ||
        app.notes.toLowerCase().includes(search.toLowerCase()) ||
        app.job_description.toLowerCase().includes(search.toLowerCase())

      const matchesStatus = statusFilter === "all" || app.status === statusFilter
      const matchesWorkplace = workplaceFilter === "all" || app.workplace_type === workplaceFilter
      const matchesMethod = methodFilter === "all" || app.application_method === methodFilter

      return matchesSearch && matchesStatus && matchesWorkplace && matchesMethod
    })
    .sort((a, b) => {
      if (sortBy === "company") {
        return a.company.localeCompare(b.company)
      }
      if (sortBy === "status") {
        return a.status.localeCompare(b.status)
      }
      if (sortBy === "priority") {
        const order: Record<string, number> = { top: 1, high: 2, medium: 3, low: 4 }
        return (order[a.priority] || 5) - (order[b.priority] || 5)
      }
      // "recent" default: sort by applied_at or created_at descending
      const dateA = new Date(a.applied_at || a.created_at).getTime()
      const dateB = new Date(b.applied_at || b.created_at).getTime()
      return dateB - dateA
    })

  return (
    <div className="space-y-4">
      {/* Header & Primary Controls */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-[var(--color-fg)]">
            Job Applications
          </h1>
          <p className="text-xs text-[var(--color-muted)]">
            Total {applications.length} applications logged across all channels
          </p>
        </div>

        <button
          onClick={onOpenAddModal}
          className="flex items-center gap-1.5 rounded-[var(--radius-panel)] bg-[var(--color-accent)] px-3.5 py-1.5 text-xs font-semibold text-[#0b0c0f] shadow-sm hover:bg-[var(--color-accent)]/90 active:scale-[0.98] transition-all"
        >
          <Plus className="h-3.5 w-3.5" />
          Track Application
        </button>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)] p-3">
        {/* Search input */}
        <div className="relative min-w-64 flex-1">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[var(--color-faint)]" />
          <input
            type="text"
            placeholder="Search roles, companies, keywords, tech stack..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] py-1.5 pl-8 pr-3 text-xs text-[var(--color-fg)] placeholder-[var(--color-faint)] focus:border-[var(--color-accent)] focus:outline-none"
          />
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded border border-[var(--color-line)] bg-[var(--color-bg)] px-2.5 py-1.5 text-xs text-[var(--color-fg)] focus:border-[var(--color-accent)] focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="wishlist">Wishlist</option>
            <option value="applied">Applied</option>
            <option value="interview_pending">Interview Pending</option>
            <option value="interviewing">Interviewing</option>
            <option value="technical_assessment">Tech Assessment</option>
            <option value="offer">Offer</option>
            <option value="rejected">Rejected</option>
            <option value="archived">Archived</option>
          </select>

          {/* Workplace Filter */}
          <select
            value={workplaceFilter}
            onChange={(e) => setWorkplaceFilter(e.target.value)}
            className="rounded border border-[var(--color-line)] bg-[var(--color-bg)] px-2.5 py-1.5 text-xs text-[var(--color-fg)] focus:border-[var(--color-accent)] focus:outline-none"
          >
            <option value="all">All Workplace</option>
            <option value="remote">Remote Only</option>
            <option value="hybrid">Hybrid</option>
            <option value="on-site">On-Site</option>
          </select>

          {/* Method Filter */}
          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            className="rounded border border-[var(--color-line)] bg-[var(--color-bg)] px-2.5 py-1.5 text-xs text-[var(--color-fg)] focus:border-[var(--color-accent)] focus:outline-none"
          >
            <option value="all">All Methods</option>
            <option value="portal">ATS / Portal</option>
            <option value="email">Direct Email</option>
            <option value="linkedin">LinkedIn</option>
            <option value="referral">Referral</option>
            <option value="recruiter">Recruiter</option>
          </select>

          {/* Sort By */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="rounded border border-[var(--color-line)] bg-[var(--color-bg)] px-2.5 py-1.5 text-xs text-[var(--color-fg)] focus:border-[var(--color-accent)] focus:outline-none"
          >
            <option value="recent">Sort: Most Recent</option>
            <option value="company">Sort: Company (A-Z)</option>
            <option value="priority">Sort: Priority</option>
            <option value="status">Sort: Status</option>
          </select>
        </div>
      </div>

      {/* Mobile Card List (md:hidden) */}
      <div className="space-y-2.5 md:hidden">
        {filtered.length === 0 ? (
          <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)] py-10 text-center text-xs text-[var(--color-faint)]">
            No job applications match your filters.
          </div>
        ) : (
          filtered.map((app) => {
            const statusStyle = getStatusColor(app.status)
            const workplaceBadge = getWorkplaceBadge(app.workplace_type)
            const priorityBadge = getPriorityBadge(app.priority)

            return (
              <div
                key={app.id}
                onClick={() => onSelectApplication(app.id)}
                className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)] p-3.5 space-y-2.5 shadow-sm active:bg-[var(--color-surface-hi)] transition-colors cursor-pointer"
              >
                {/* Header: Company & Priority & Workplace */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-bold text-xs text-[var(--color-fg)] truncate block">
                      {app.company}
                    </span>
                    <span className="text-[11px] text-[var(--color-muted)] font-medium line-clamp-1">
                      {app.title}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <span className={cx("text-[9px] px-1.5 py-0.2 rounded border font-mono", priorityBadge.bg)}>
                      {priorityBadge.label}
                    </span>
                    <span className={cx("text-[9px] px-1.5 py-0.2 rounded border", workplaceBadge.bg)}>
                      {workplaceBadge.label}
                    </span>
                  </div>
                </div>

                {/* Metadata row */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[var(--color-faint)]">
                  {app.location && (
                    <span className="flex items-center gap-1">
                      <Globe className="h-2.5 w-2.5" /> {app.location}
                    </span>
                  )}
                  <span>via {app.application_method}</span>
                  {app.salary && (
                    <span className="text-emerald-400/90 font-mono font-medium">{app.salary}</span>
                  )}
                  <span className="tnum ml-auto">
                    {formatAgo(app.applied_at || app.created_at)}
                  </span>
                </div>

                {/* Status selector & Actions */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--color-line-soft)]" onClick={(e) => e.stopPropagation()}>
                  <select
                    value={app.status}
                    onChange={(e) => onUpdateStatus(app.id, e.target.value as ApplicationStatus)}
                    className={cx(
                      "rounded border text-[10px] font-semibold py-1 px-2 focus:outline-none transition-colors cursor-pointer flex-1 max-w-44",
                      statusStyle.bg,
                      statusStyle.text,
                      statusStyle.border
                    )}
                  >
                    <option value="wishlist">Wishlist</option>
                    <option value="applied">Applied</option>
                    <option value="interview_pending">Interview Pending</option>
                    <option value="interviewing">Interviewing</option>
                    <option value="technical_assessment">Tech Assessment</option>
                    <option value="offer">Offer 🎉</option>
                    <option value="rejected">Rejected</option>
                    <option value="archived">Archived</option>
                  </select>

                  <div className="flex items-center gap-1.5">
                    {app.url && (
                      <a
                        href={app.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded p-1.5 border border-[var(--color-line)] text-[var(--color-faint)] hover:text-[var(--color-fg)]"
                        title="Open posting"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    <button
                      onClick={() => onSelectApplication(app.id)}
                      className="rounded px-2.5 py-1 text-[10px] font-medium border border-[var(--color-line)] bg-[var(--color-surface-hi)] text-[var(--color-fg)]"
                    >
                      Details
                    </button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Desktop Applications Table (hidden on mobile) */}
      <div className="hidden md:block overflow-hidden rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[var(--color-line)] bg-[var(--color-rail)] text-[10px] uppercase tracking-wider text-[var(--color-faint)]">
              <tr>
                <th className="py-3 px-4">Company & Title</th>
                <th className="py-3 px-3">Workplace</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Method</th>
                <th className="py-3 px-3">Info / Content</th>
                <th className="py-3 px-3">Applied</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-line-soft)]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[var(--color-faint)]">
                    No job applications match your filters.
                  </td>
                </tr>
              ) : (
                filtered.map((app) => {
                  const statusStyle = getStatusColor(app.status)
                  const workplaceBadge = getWorkplaceBadge(app.workplace_type)
                  const priorityBadge = getPriorityBadge(app.priority)

                  return (
                    <tr
                      key={app.id}
                      className="group hover:bg-[var(--color-surface-hi)] transition-colors cursor-pointer"
                      onClick={() => onSelectApplication(app.id)}
                    >
                      {/* Company & Title */}
                      <td className="py-3 px-4">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[var(--color-fg)] group-hover:text-[var(--color-accent)] transition-colors">
                              {app.company}
                            </span>
                            <span className={cx("text-[9px] px-1 py-0.2 rounded border font-mono", priorityBadge.bg)}>
                              {priorityBadge.label}
                            </span>
                          </div>
                          <div className="text-[11px] text-[var(--color-muted)] font-medium">
                            {app.title}
                          </div>
                          {app.location && (
                            <div className="text-[10px] text-[var(--color-faint)] flex items-center gap-1">
                              <Globe className="h-2.5 w-2.5" /> {app.location}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Workplace Type */}
                      <td className="py-3 px-3">
                        <span className={cx("text-[10px] px-2 py-0.5 rounded border font-medium", workplaceBadge.bg)}>
                          {workplaceBadge.label}
                        </span>
                      </td>

                      {/* Status Dropdown */}
                      <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={app.status}
                          onChange={(e) => onUpdateStatus(app.id, e.target.value as ApplicationStatus)}
                          className={cx(
                            "rounded border text-[10px] font-semibold py-1 px-2 focus:outline-none transition-colors cursor-pointer",
                            statusStyle.bg,
                            statusStyle.text,
                            statusStyle.border
                          )}
                        >
                          <option value="wishlist">Wishlist</option>
                          <option value="applied">Applied</option>
                          <option value="interview_pending">Interview Pending</option>
                          <option value="interviewing">Interviewing</option>
                          <option value="technical_assessment">Tech Assessment</option>
                          <option value="offer">Offer 🎉</option>
                          <option value="rejected">Rejected</option>
                          <option value="archived">Archived</option>
                        </select>
                      </td>

                      {/* Application Method */}
                      <td className="py-3 px-3">
                        <span className="text-[11px] text-[var(--color-muted)] font-mono capitalize">
                          {app.application_method}
                        </span>
                      </td>

                      {/* Content Indicators */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          {app.cover_letter && (
                            <span
                              title="Cover letter stored"
                              className="rounded bg-[var(--color-line-soft)] px-1.5 py-0.5 text-[9px] font-mono text-[var(--color-muted)] flex items-center gap-1 border border-[var(--color-line)]"
                            >
                              <FileText className="h-2.5 w-2.5 text-[var(--color-accent)]" /> Letter
                            </span>
                          )}
                          {app.info_provided && (
                            <span
                              title="Application info provided notes"
                              className="rounded bg-[var(--color-line-soft)] px-1.5 py-0.5 text-[9px] font-mono text-[var(--color-muted)] border border-[var(--color-line)]"
                            >
                              Info
                            </span>
                          )}
                          {app.emails_count !== undefined && Number(app.emails_count) > 0 && (
                            <span
                              title={`${app.emails_count} associated email responses`}
                              className="rounded bg-[var(--color-accent)]/10 px-1.5 py-0.5 text-[9px] font-mono text-[var(--color-accent)] border border-[var(--color-accent)]/20 flex items-center gap-1"
                            >
                              <Inbox className="h-2.5 w-2.5" /> {app.emails_count}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Applied Date */}
                      <td className="py-3 px-3">
                        <div className="text-[11px] text-[var(--color-fg)]">
                          {formatDate(app.applied_at || app.created_at)}
                        </div>
                        <div className="tnum text-[10px] text-[var(--color-faint)]">
                          {formatAgo(app.applied_at || app.created_at)}
                        </div>
                      </td>

                      {/* Row Actions */}
                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          {app.url && (
                            <a
                              href={app.url}
                              target="_blank"
                              rel="noreferrer"
                              title="Open original job posting"
                              className="rounded p-1 text-[var(--color-faint)] hover:bg-[var(--color-surface-hi)] hover:text-[var(--color-fg)]"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                          <button
                            onClick={() => onSelectApplication(app.id)}
                            className="rounded px-2 py-1 text-[10px] font-medium border border-[var(--color-line)] text-[var(--color-muted)] hover:bg-[var(--color-surface-hi)] hover:text-[var(--color-fg)]"
                          >
                            Inspect
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
