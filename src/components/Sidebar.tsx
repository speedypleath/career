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
  RefreshCw,
  X
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
  isMobileOpen?: boolean
  onCloseMobile?: () => void
}

export function Sidebar({
  activeTab,
  setActiveTab,
  onOpenAddModal,
  totalCount = 0,
  emailCount = 0,
  onRefreshAll,
  isRefreshing = false,
  isMobileOpen = false,
  onCloseMobile,
}: SidebarProps) {
  const navItems: { id: TabId; label: string; icon: typeof LayoutDashboard; badge?: number }[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "applications", label: "Applications", icon: Briefcase, badge: totalCount },
    { id: "kanban", label: "Pipeline Board", icon: Columns3 },
    { id: "emails", label: "Emails", icon: Mail, badge: emailCount },
    { id: "webhook", label: "Webhook & Cron", icon: Webhook },
    { id: "settings", label: "Settings", icon: Settings },
  ]

  const content = (
    <div className="flex h-full flex-col justify-between p-4 select-none">
      {/* Top Section */}
      <div className="space-y-5">
        {/* Brand Header */}
        <div className="flex items-center justify-between px-1 pt-1">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-panel)] border border-[var(--color-accent)]/30 bg-[var(--color-surface)] text-[var(--color-accent)] font-bold">
              <Compass className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold tracking-wider text-[var(--color-fg)] uppercase">CAREER</span>
                <span className="text-3xs font-semibold text-[var(--color-accent)] bg-[var(--color-accent)]/10 px-1 py-0.2 rounded border border-[var(--color-accent)]/20">OPS</span>
              </div>
              <p className="text-3xs text-[var(--color-faint)] tracking-tight">Job applications</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
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

            {onCloseMobile && (
              <button
                onClick={onCloseMobile}
                title="Close menu"
                className="md:hidden rounded p-1.5 text-[var(--color-faint)] hover:bg-[var(--color-surface)] hover:text-[var(--color-fg)]"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Quick Action Button */}
        <button
          onClick={() => {
            onOpenAddModal()
            if (onCloseMobile) onCloseMobile()
          }}
          className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-panel)] bg-[var(--color-accent)] py-2 text-xs font-semibold text-[#0b0c0f] shadow-sm hover:bg-[var(--color-accent)]/90 active:scale-[0.99] transition-all cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" />
          New application
        </button>

        {/* Navigation Items */}
        <nav className="space-y-1">
          <div className="px-2 pb-1 text-3xs text-[var(--color-faint)]">Go to</div>
          {navItems.map((item) => {
            const Icon = item.icon
            const active = activeTab === item.id

            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id)
                  if (onCloseMobile) onCloseMobile()
                }}
                className={cx(
                  "flex w-full items-center justify-between rounded-[var(--radius-panel)] px-3 py-2 text-xs font-medium transition-colors cursor-pointer",
                  active
                    ? "bg-[var(--color-surface)] text-[var(--color-fg)] font-semibold border border-[var(--color-line)]"
                    : "text-[var(--color-muted)] hover:bg-[var(--color-surface)]/60 hover:text-[var(--color-fg)]"
                )}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={cx("h-4 w-4", active ? "text-[var(--color-fg)]" : "text-[var(--color-faint)]")} />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={cx(
                      "tnum rounded-full px-2 py-0.2 text-3xs font-semibold",
                      active
                        ? "bg-[var(--color-line)] text-[var(--color-fg)]"
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
      <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)] p-3 text-2xs space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-3xs text-[var(--color-faint)]">Tailnet Node</span>
          <div className="flex items-center gap-1.5">
            <StatusDot status="online" />
            <span className="text-3xs text-[var(--color-muted)]">Serving</span>
          </div>
        </div>
        <div className="text-3xs text-[var(--color-faint)] font-mono truncate">
          career.taile5b997.ts.net
        </div>
        <div className="flex items-center justify-between text-3xs pt-1 border-t border-[var(--color-line-soft)] text-[var(--color-muted)]">
          <span>Supabase Postgres</span>
          <span className="tnum">:8098</span>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop Sidebar (Fixed Left Rail) */}
      <aside className="hidden md:flex h-screen w-64 flex-col border-r border-[var(--color-line)] bg-[var(--color-rail)]">
        {content}
      </aside>

      {/* Mobile Drawer (Slide Over with Backdrop) */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          {/* Slide-out Panel */}
          <div className="relative z-10 flex h-full w-72 max-w-[85vw] flex-col border-r border-[var(--color-line)] bg-[var(--color-rail)] shadow-2xl animate-in slide-in-from-left duration-200">
            {content}
          </div>
        </div>
      )}
    </>
  )
}
