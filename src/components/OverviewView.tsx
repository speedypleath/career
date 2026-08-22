"use client"

import {
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  Briefcase,
  Globe,
  Mail,
  Send,
  Zap,
  ArrowUpRight,
  Sparkles,
  Calendar,
  Building,
  RefreshCw,
  Award
} from "lucide-react"
import { MetricCard } from "./MetricCard"
import { StatusDot } from "./StatusDot"
import { getStatusColor, getWorkplaceBadge, getPriorityBadge, formatDate, formatAgo, cx } from "./format"
import type { Application, Stats, ApplicationEvent } from "@/types"

interface OverviewViewProps {
  stats: Stats | null
  applications: Application[]
  onSelectApplication: (id: string) => void
  onOpenAddModal: () => void
  onScanEmails: () => void
  isScanning: boolean
}

export function OverviewView({
  stats,
  applications,
  onSelectApplication,
  onOpenAddModal,
  onScanEmails,
  isScanning,
}: OverviewViewProps) {
  const total = stats?.total || 0
  const activePipeline = (stats?.interviewPending || 0) + (stats?.interviewing || 0) + (stats?.techAssessment || 0)
  const offers = stats?.offers || 0
  const applied = stats?.applied || 0
  const rejected = stats?.rejected || 0

  // Calculate response rate
  const nonWishlistTotal = Math.max(1, total - (stats?.wishlist || 0))
  const respondedCount = (stats?.interviewPending || 0) + (stats?.interviewing || 0) + (stats?.techAssessment || 0) + (stats?.offers || 0) + (stats?.rejected || 0)
  const responseRate = Math.round((respondedCount / nonWishlistTotal) * 100)

  // Top/High priority active apps
  const priorityApps = applications
    .filter((a) => a.status !== "rejected" && a.status !== "archived")
    .slice(0, 6)

  return (
    <div className="space-y-6">
      {/* Top Banner with Quick Actions */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold tracking-tight text-[var(--color-fg)]">
              Application Radar & Pipeline
            </h1>
            <span className="inline-flex items-center gap-1 rounded bg-[var(--color-accent)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-accent)] border border-[var(--color-accent)]/20">
              <Sparkles className="h-3 w-3" /> Auto-Sync
            </span>
          </div>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Tracking multi-channel applications (portal & email), automated sweeps, and recruiter responses.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={onScanEmails}
            disabled={isScanning}
            className="flex items-center gap-1.5 rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface-hi)] px-3 py-1.5 text-xs font-medium text-[var(--color-fg)] hover:border-[var(--color-accent)]/40 hover:text-[var(--color-accent)] active:scale-[0.98] transition-all disabled:opacity-50"
          >
            <RefreshCw className={cx("h-3.5 w-3.5", isScanning && "animate-spin text-[var(--color-accent)]")} />
            {isScanning ? "Scanning Gmail..." : "Scan Email Radar"}
          </button>

          <button
            onClick={onOpenAddModal}
            className="flex items-center gap-1.5 rounded-[var(--radius-panel)] bg-[var(--color-accent)] px-3.5 py-1.5 text-xs font-semibold text-[#0b0c0f] shadow-sm hover:bg-[var(--color-accent)]/90 active:scale-[0.98] transition-all"
          >
            <Send className="h-3.5 w-3.5" />
            + New Application
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard
          label="Total Tracked"
          value={total}
          sub={`${stats?.remoteCount || 0} remote, ${stats?.hybridCount || 0} hybrid`}
          icon={<Briefcase className="h-4 w-4" />}
        />
        <MetricCard
          label="Awaiting Reply"
          value={applied}
          sub="Sent applications"
          icon={<Clock className="h-4 w-4" />}
        />
        <MetricCard
          label="Active Pipeline"
          value={activePipeline}
          sub="Interviews & tests"
          accent={activePipeline > 0}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <MetricCard
          label="Offers"
          value={offers}
          sub="Success outcome"
          accent={offers > 0}
          icon={<Award className="h-4 w-4" />}
        />
        <MetricCard
          label="Rejected"
          value={rejected}
          sub="Archived outcomes"
          danger={rejected > 0}
          icon={<XCircle className="h-4 w-4" />}
        />
        <MetricCard
          label="Response Rate"
          value={`${responseRate}%`}
          sub={`${respondedCount} responses logged`}
          icon={<Zap className="h-4 w-4" />}
        />
      </div>

      {/* Channel & Workplace Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Method Breakdown */}
        <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="label">Application Channel Distribution</span>
            <span className="text-[10px] text-[var(--color-faint)]">Portal vs Direct Email</span>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1">
            <div className="rounded border border-[var(--color-line-soft)] bg-[var(--color-bg)] p-2.5 text-center">
              <div className="label text-[9px] text-[var(--color-faint)]">ATS / Portal</div>
              <div className="tnum mt-1 text-lg font-bold text-[var(--color-fg)]">
                {stats?.portalCount || 0}
              </div>
              <div className="text-[10px] text-[var(--color-muted)]">
                {total > 0 ? Math.round(((stats?.portalCount || 0) / total) * 100) : 0}%
              </div>
            </div>

            <div className="rounded border border-[var(--color-line-soft)] bg-[var(--color-bg)] p-2.5 text-center">
              <div className="label text-[9px] text-[var(--color-faint)]">Email Direct</div>
              <div className="tnum mt-1 text-lg font-bold text-[var(--color-accent)]">
                {stats?.emailCount || 0}
              </div>
              <div className="text-[10px] text-[var(--color-muted)]">
                {total > 0 ? Math.round(((stats?.emailCount || 0) / total) * 100) : 0}%
              </div>
            </div>

            <div className="rounded border border-[var(--color-line-soft)] bg-[var(--color-bg)] p-2.5 text-center">
              <div className="label text-[9px] text-[var(--color-faint)]">LinkedIn / Other</div>
              <div className="tnum mt-1 text-lg font-bold text-[var(--color-fg)]">
                {(stats?.linkedinCount || 0) + (stats?.otherMethodCount || 0)}
              </div>
              <div className="text-[10px] text-[var(--color-muted)]">
                {total > 0 ? Math.round((((stats?.linkedinCount || 0) + (stats?.otherMethodCount || 0)) / total) * 100) : 0}%
              </div>
            </div>
          </div>
        </div>

        {/* Workplace Breakdown */}
        <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="label">Workplace Scope Breakdown</span>
            <span className="text-[10px] text-[var(--color-faint)]">Bucharest & Remote-EU</span>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1">
            <div className="rounded border border-[var(--color-line-soft)] bg-[var(--color-bg)] p-2.5 text-center">
              <div className="label text-[9px] text-[var(--color-faint)]">100% Remote</div>
              <div className="tnum mt-1 text-lg font-bold text-emerald-400">
                {stats?.remoteCount || 0}
              </div>
              <div className="text-[10px] text-[var(--color-muted)]">
                {total > 0 ? Math.round(((stats?.remoteCount || 0) / total) * 100) : 0}%
              </div>
            </div>

            <div className="rounded border border-[var(--color-line-soft)] bg-[var(--color-bg)] p-2.5 text-center">
              <div className="label text-[9px] text-[var(--color-faint)]">Hybrid</div>
              <div className="tnum mt-1 text-lg font-bold text-sky-400">
                {stats?.hybridCount || 0}
              </div>
              <div className="text-[10px] text-[var(--color-muted)]">
                {total > 0 ? Math.round(((stats?.hybridCount || 0) / total) * 100) : 0}%
              </div>
            </div>

            <div className="rounded border border-[var(--color-line-soft)] bg-[var(--color-bg)] p-2.5 text-center">
              <div className="label text-[9px] text-[var(--color-faint)]">On-Site</div>
              <div className="tnum mt-1 text-lg font-bold text-amber-400">
                {stats?.onsiteCount || 0}
              </div>
              <div className="text-[10px] text-[var(--color-muted)]">
                {total > 0 ? Math.round(((stats?.onsiteCount || 0) / total) * 100) : 0}%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Priority Applications & Recent Events Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Pipeline / Priority Applications (2 cols) */}
        <div className="lg:col-span-2 rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold tracking-tight text-[var(--color-fg)]">
                Active & High Priority Applications
              </h2>
              <p className="text-[11px] text-[var(--color-faint)]">
                Most recent opportunities requiring follow-up or in active review
              </p>
            </div>
            <span className="label text-[9px]">Top {priorityApps.length}</span>
          </div>

          {priorityApps.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Briefcase className="h-8 w-8 text-[var(--color-faint)] mb-2 stroke-[1.5]" />
              <p className="text-xs text-[var(--color-muted)]">No active applications found</p>
              <p className="text-[11px] text-[var(--color-faint)] mt-1">
                Click "+ New Application" or run the automated audio-job-hunter sweep webhook.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--color-line-soft)]">
              {priorityApps.map((app) => {
                const statusStyle = getStatusColor(app.status)
                const workplaceBadge = getWorkplaceBadge(app.workplace_type)
                const priorityBadge = getPriorityBadge(app.priority)

                return (
                  <div
                    key={app.id}
                    onClick={() => onSelectApplication(app.id)}
                    className="group flex items-center justify-between py-3 px-2 rounded hover:bg-[var(--color-surface-hi)] cursor-pointer transition-colors"
                  >
                    <div className="space-y-1 min-w-0 pr-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-xs text-[var(--color-fg)] group-hover:text-[var(--color-accent)] transition-colors">
                          {app.title}
                        </span>
                        <span className={cx("text-[9px] px-1.5 py-0.2 rounded border", workplaceBadge.bg)}>
                          {workplaceBadge.label}
                        </span>
                        <span className={cx("text-[9px] px-1.5 py-0.2 rounded border", priorityBadge.bg)}>
                          {priorityBadge.label}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-[var(--color-muted)] flex-wrap">
                        <span className="font-medium text-[var(--color-fg)] flex items-center gap-1">
                          <Building className="h-3 w-3 text-[var(--color-faint)]" /> {app.company}
                        </span>
                        {app.location && (
                          <span className="text-[var(--color-faint)] flex items-center gap-1">
                            <Globe className="h-3 w-3" /> {app.location}
                          </span>
                        )}
                        <span className="text-[var(--color-faint)]">
                          via {app.application_method}
                        </span>
                        {app.salary && (
                          <span className="text-emerald-400/80 font-mono text-[10px]">
                            {app.salary}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className={cx("text-[10px] px-2 py-0.5 rounded border font-medium", statusStyle.bg, statusStyle.text, statusStyle.border)}>
                        {statusStyle.label}
                      </span>
                      <span className="tnum text-[10px] text-[var(--color-faint)] min-w-14 text-right">
                        {formatAgo(app.applied_at || app.created_at)}
                      </span>
                      <ArrowUpRight className="h-3.5 w-3.5 text-[var(--color-faint)] group-hover:text-[var(--color-accent)] transition-colors" />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Live Activity Stream (1 col) */}
        <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold tracking-tight text-[var(--color-fg)]">
              Radar Timeline
            </h2>
            <div className="flex items-center gap-1.5">
              <StatusDot status="online" pulse />
              <span className="label text-[9px] text-[var(--color-accent)]">Live Log</span>
            </div>
          </div>

          <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
            {!stats?.recentEvents || stats.recentEvents.length === 0 ? (
              <div className="py-8 text-center text-xs text-[var(--color-faint)]">
                No activity logged yet.
              </div>
            ) : (
              stats.recentEvents.map((evt) => (
                <div
                  key={evt.id}
                  onClick={() => onSelectApplication(evt.application_id)}
                  className="rounded border border-[var(--color-line-soft)] bg-[var(--color-bg)]/80 p-3 hover:border-[var(--color-line)] hover:bg-[var(--color-surface-hi)] cursor-pointer transition-colors space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-[var(--color-fg)] truncate">
                      {evt.company || "Application"}
                    </span>
                    <span className="tnum text-[9px] text-[var(--color-faint)]">
                      {formatAgo(evt.created_at)}
                    </span>
                  </div>
                  <p className="text-[11px] font-medium text-[var(--color-accent)]">
                    {evt.title}
                  </p>
                  {evt.description && (
                    <p className="text-[10px] text-[var(--color-muted)] line-clamp-2">
                      {evt.description}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
