"use client"

import {
  LayoutDashboard,
  Briefcase,
  Columns3,
  Mail,
  Webhook,
  Settings,
  Plus,
  Compass,
  Terminal,
  RefreshCw
} from "lucide-react"
import { StatusDot } from "./StatusDot"
import { cx } from "./format"
import type { TabId } from "@/types"

interface SidebarProps {
  activeTab: TabId
  setActiveTab: (tab: TabId) => void
  onOpenAddModal: () => void
  totalCount?: number
  emailCount?: number
  onRefreshAll?: () => void
  isRefreshing?: boolean
}

export function Sidebar({
  activeTab,
  setActiveTab,
  onOpenAddModal,
  totalCount = 0,
  emailCount = 0,
  onRefreshAll,
  isRefreshing = false,
}: SidebarProps) {
  const navItems: { id: TabId; label: string; icon: typeof LayoutDashboard; badge?: number }[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "applications", label: "Applications", icon: Briefcase, badge: totalCount },
    { id: "kanban", label: "Pipeline Board", icon: Columns3 },
    { id: "emails", label: "Email Radar", icon: Mail, badge: emailCount },
    { id: "webhook", label: "Webhook & Cron", icon: Webhook },
    { id: "settings", label: "Settings", icon: Settings },
  ]

  return (
    <aside className="flex h-screen w-64 flex-col justify-between border-r border-[var(--color-line)] bg-[var(--color-rail)] p-4 select-none">
      {/* Top Section */}
      <div className="space-y-6">
        {/* Brand Header */}
        <div className="flex items-center justify-between px-2 pt-1">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-panel)] border border-[var(--color-accent)]/30 bg-[var(--color-surface)] text-[var(--color-accent)] font-bold">
              <Compass className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold tracking-wider text-[var(--color-fg)] uppercase">CAREER</span>
                <span className="text-[9px] font-semibold text-[var(--color-accent)] bg-[var(--color-accent)]/10 px-1 py-0.2 rounded border border-[var(--color-accent)]/20">OPS</span>
              </div>
              <p className="text-[10px] text-[var(--color-faint)] tracking-tight">Job Application Radar</p>
            </div>
          </div>

          <button
            onClick={onRefreshAll}
            title="Refresh data"
            className={cx(
              "rounded p-1.5 text-[var(--color-faint)] hover:bg-[var(--color-surface)] hover:text-[var(--color-fg)] transition-colors",
              isRefreshing && "animate-spin text-[var(--color-accent)]"
            )}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Quick Action Button */}
        <button
          onClick={onOpenAddModal}
          className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-panel)] bg-[var(--color-accent)] py-2 text-xs font-semibold text-[#0b0c0f] shadow-sm hover:bg-[var(--color-accent)]/90 active:scale-[0.99] transition-all"
        >
          <Plus className="h-3.5 w-3.5" />
          Track Application
        </button>

        {/* Navigation Items */}
        <nav className="space-y-1">
          <div className="label px-2 pb-1 text-[9px] text-[var(--color-faint)]">Navigation</div>
          {navItems.map((item) => {
            const Icon = item.icon
            const active = activeTab === item.id

            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={cx(
                  "flex w-full items-center justify-between rounded-[var(--radius-panel)] px-3 py-2 text-xs font-medium transition-colors",
                  active
                    ? "bg-[var(--color-surface)] text-[var(--color-accent)] border border-[var(--color-line)] shadow-inner"
                    : "text-[var(--color-muted)] hover:bg-[var(--color-surface)]/60 hover:text-[var(--color-fg)]"
                )}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={cx("h-4 w-4", active ? "text-[var(--color-accent)]" : "text-[var(--color-faint)]")} />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={cx(
                      "tnum rounded-full px-2 py-0.2 text-[10px] font-semibold",
                      active
                        ? "bg-[var(--color-accent)]/20 text-[var(--color-accent)]"
                        : "bg-[var(--color-line)] text-[var(--color-muted)]"
                    )}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Bottom Infrastructure Node Info */}
      <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)] p-3 text-[11px] space-y-2">
        <div className="flex items-center justify-between">
          <span className="label text-[9px]">Tailnet Node</span>
          <div className="flex items-center gap-1.5">
            <StatusDot status="online" pulse />
            <span className="text-[10px] text-[var(--color-accent)]">Live</span>
          </div>
        </div>
        <div className="text-[10px] text-[var(--color-faint)] font-mono truncate">
          your-app.your-tailnet.ts.net
        </div>
        <div className="flex items-center justify-between text-[10px] pt-1 border-t border-[var(--color-line-soft)] text-[var(--color-muted)]">
          <span>DB: postgres (career)</span>
          <span className="tnum">:8098</span>
        </div>
      </div>
    </aside>
  )
}
