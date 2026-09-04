"use client"

import { useState } from "react"
import {
  Menu,
  Compass,
  Plus,
  RefreshCw,
  LayoutDashboard,
  Briefcase,
  Columns3,
  Mail,
  MoreHorizontal
} from "lucide-react"
import { Sidebar } from "@/components/Sidebar"
import { OverviewView } from "@/components/OverviewView"
import { ApplicationsView } from "@/components/ApplicationsView"
import { KanbanView } from "@/components/KanbanView"
import { EmailsView } from "@/components/EmailsView"
import { WebhookView } from "@/components/WebhookView"
import { SettingsView } from "@/components/SettingsView"
import { AddApplicationModal } from "@/components/AddApplicationModal"
import { ApplicationDetailModal } from "@/components/ApplicationDetailModal"
import { ErrorBanner } from "@/components/ErrorBanner"
import { StatusDot } from "@/components/StatusDot"
import { cx } from "@/components/format"
import { scanEmails, updateApplicationStatus } from "@/lib/api-client"
import { useDashboard } from "@/hooks/useApplications"
import type { TabId, ApplicationStatus } from "@/types"

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("overview")
  const [isScanning, setIsScanning] = useState(false)
  const [scanNotice, setScanNotice] = useState<string | null>(null)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  // The fifteen-second poll and the window-focus refetch live in the hook now.
  const { data, loading, refreshing: isRefreshing, error, reload: loadData, setError } = useDashboard()
  const { applications, stats } = data

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null)

  async function handleUpdateStatus(id: string, newStatus: ApplicationStatus) {
    try {
      await updateApplicationStatus(id, newStatus)
      loadData(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the status")
    }
  }

  async function handleScanEmails() {
    setIsScanning(true)
    setError(null)
    setScanNotice(null)
    try {
      const result = await scanEmails()

      // A scan that finds nothing AND reports errors is blocked, not quiet:
      // gog is missing, or its token has expired. Those messages say what to
      // do, so they are shown instead of a bare "0 new".
      if (result.errors?.length) {
        setError(result.errors.join(" · "))
      } else {
        setScanNotice(
          `Scanned ${result.scannedCount ?? 0} messages, matched ${result.matchedCount ?? 0}, ${result.newEmails?.length ?? 0} new.`,
        )
      }

      await loadData(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "The inbox scan failed")
    } finally {
      setIsScanning(false)
    }
  }

  const emailAlertCount = stats?.recentEvents?.filter((e) => e.event_type === "email_received").length || 0

  return (
    <div className="flex h-screen w-full flex-col md:flex-row overflow-hidden bg-[var(--color-bg)]">
      {/* Mobile Top Header */}
      <header className="flex md:hidden items-center justify-between border-b border-[var(--color-line)] bg-[var(--color-rail)] px-3 py-2.5 shrink-0 select-none z-30">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="rounded p-1.5 text-[var(--color-fg)] hover:bg-[var(--color-surface)] active:scale-95"
            title="Open Menu"
            aria-label="Open Menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold tracking-wider text-[var(--color-fg)] uppercase">CAREER</span>
            <span className="text-[9px] font-semibold text-[var(--color-accent)] bg-[var(--color-accent)]/10 px-1 py-0.2 rounded border border-[var(--color-accent)]/20">OPS</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <StatusDot status="online" pulse />
            <span className="text-[10px] text-[var(--color-accent)] font-medium">Live</span>
          </div>

          <button
            onClick={() => loadData(false)}
            title="Refresh"
            className={cx(
              "rounded p-1.5 text-[var(--color-faint)] hover:bg-[var(--color-surface)] hover:text-[var(--color-fg)] transition-colors",
              isRefreshing && "animate-spin text-[var(--color-accent)]"
            )}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1 rounded bg-[var(--color-accent)] px-2.5 py-1 text-[11px] font-semibold text-[#0b0c0f] shadow-sm hover:bg-[var(--color-accent)]/90"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Track</span>
          </button>
        </div>
      </header>

      {/* Sidebar Navigation (Desktop left rail + Mobile slide-over drawer) */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenAddModal={() => setIsAddModalOpen(true)}
        totalCount={applications.length}
        emailCount={emailAlertCount}
        onRefreshAll={() => loadData(false)}
        isRefreshing={isRefreshing}
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-3.5 sm:p-5 md:p-8 pb-20 md:pb-8">
        <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
          {error && <ErrorBanner message={error} retry={() => loadData(false)} />}

          {scanNotice && (
            <div
              role="status"
              className="flex items-center justify-between gap-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300"
            >
              <span>{scanNotice}</span>
              <button
                onClick={() => setScanNotice(null)}
                aria-label="Dismiss scan result"
                className="rounded px-2 py-0.5 text-[10px] text-emerald-400/80 hover:bg-emerald-500/15 hover:text-emerald-200"
              >
                Dismiss
              </button>
            </div>
          )}

          {activeTab === "overview" && (
            <OverviewView
              stats={stats}
              applications={applications}
              onSelectApplication={(id) => setSelectedAppId(id)}
              onOpenAddModal={() => setIsAddModalOpen(true)}
              onScanEmails={handleScanEmails}
              isScanning={isScanning}
            />
          )}

          {activeTab === "applications" && (
            <ApplicationsView
              applications={applications}
              onSelectApplication={(id) => setSelectedAppId(id)}
              onOpenAddModal={() => setIsAddModalOpen(true)}
              onUpdateStatus={handleUpdateStatus}
              onRefresh={() => loadData(true)}
            />
          )}

          {activeTab === "kanban" && (
            <KanbanView
              applications={applications}
              onSelectApplication={(id) => setSelectedAppId(id)}
              onOpenAddModal={() => setIsAddModalOpen(true)}
              onUpdateStatus={handleUpdateStatus}
            />
          )}

          {activeTab === "emails" && (
            <EmailsView
              onScanEmails={handleScanEmails}
              isScanning={isScanning}
              onSelectApplication={(id) => setSelectedAppId(id)}
            />
          )}

          {activeTab === "webhook" && <WebhookView />}

          {activeTab === "settings" && <SettingsView />}
        </div>
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="flex md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-[var(--color-line)] bg-[var(--color-rail)]/95 backdrop-blur-md px-2 py-1 justify-around items-center select-none">
        <button
          onClick={() => setActiveTab("overview")}
          className={cx(
            "flex flex-col items-center gap-0.5 py-1 px-2.5 rounded text-[10px] font-medium transition-colors",
            activeTab === "overview" ? "text-[var(--color-accent)] font-semibold" : "text-[var(--color-faint)]"
          )}
        >
          <LayoutDashboard className="h-4 w-4" />
          <span>Overview</span>
        </button>

        <button
          onClick={() => setActiveTab("applications")}
          className={cx(
            "relative flex flex-col items-center gap-0.5 py-1 px-2.5 rounded text-[10px] font-medium transition-colors",
            activeTab === "applications" ? "text-[var(--color-accent)] font-semibold" : "text-[var(--color-faint)]"
          )}
        >
          <Briefcase className="h-4 w-4" />
          <span>Roles</span>
          {applications.length > 0 && (
            <span className="absolute top-0.5 right-1 h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
          )}
        </button>

        <button
          onClick={() => setActiveTab("kanban")}
          className={cx(
            "flex flex-col items-center gap-0.5 py-1 px-2.5 rounded text-[10px] font-medium transition-colors",
            activeTab === "kanban" ? "text-[var(--color-accent)] font-semibold" : "text-[var(--color-faint)]"
          )}
        >
          <Columns3 className="h-4 w-4" />
          <span>Pipeline</span>
        </button>

        <button
          onClick={() => setActiveTab("emails")}
          className={cx(
            "relative flex flex-col items-center gap-0.5 py-1 px-2.5 rounded text-[10px] font-medium transition-colors",
            activeTab === "emails" ? "text-[var(--color-accent)] font-semibold" : "text-[var(--color-faint)]"
          )}
        >
          <Mail className="h-4 w-4" />
          <span>Radar</span>
          {emailAlertCount > 0 && (
            <span className="absolute top-0.5 right-1 h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
          )}
        </button>

        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className={cx(
            "flex flex-col items-center gap-0.5 py-1 px-2.5 rounded text-[10px] font-medium transition-colors",
            activeTab === "webhook" || activeTab === "settings"
              ? "text-[var(--color-accent)] font-semibold"
              : "text-[var(--color-faint)]"
          )}
        >
          <MoreHorizontal className="h-4 w-4" />
          <span>More</span>
        </button>
      </nav>

      {/* Modals */}
      <AddApplicationModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onCreated={() => {
          setIsAddModalOpen(false)
          loadData(true)
        }}
      />

      <ApplicationDetailModal
        applicationId={selectedAppId}
        isOpen={!!selectedAppId}
        onClose={() => setSelectedAppId(null)}
        onUpdated={() => {
          loadData(true)
        }}
        onDeleted={() => {
          setSelectedAppId(null)
          loadData(true)
        }}
      />
    </div>
  )
}
