"use client"

import { useState, useEffect, useCallback } from "react"
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
import type { Application, Stats, TabId, ApplicationStatus } from "@/types"

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("overview")
  const [applications, setApplications] = useState<Application[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanNotice, setScanNotice] = useState<string | null>(null)

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null)

  const loadData = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    setIsRefreshing(true)
    setError(null)
    try {
      const [appsRes, statsRes] = await Promise.all([
        fetch("/api/applications", { cache: "no-store" }),
        fetch("/api/stats", { cache: "no-store" }),
      ])

      if (!appsRes.ok || !statsRes.ok) {
        throw new Error("Failed to fetch application data from server")
      }

      const appsData = await appsRes.json()
      const statsData = await statsRes.json()

      setApplications(appsData.applications || [])
      setStats(statsData.stats || null)
    } catch (err) {
      console.error("Data load error:", err)
      setError(err instanceof Error ? err.message : "Unknown error loading data")
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadData()

    // Poll every 15 seconds for incoming webhooks or automated applications
    const interval = setInterval(() => {
      loadData(true)
    }, 15000)

    // Re-fetch on window focus
    const handleFocus = () => {
      loadData(true)
    }
    window.addEventListener("focus", handleFocus)

    return () => {
      clearInterval(interval)
      window.removeEventListener("focus", handleFocus)
    }
  }, [loadData])

  async function handleUpdateStatus(id: string, newStatus: ApplicationStatus) {
    try {
      const res = await fetch(`/api/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) {
        loadData(true)
      }
    } catch (err) {
      console.error("Failed to update status:", err)
    }
  }

  async function handleScanEmails() {
    setIsScanning(true)
    setError(null)
    setScanNotice(null)
    try {
      const res = await fetch("/api/email/scan", { cache: "no-store" })
      const data = await res.json().catch(() => null)

      if (!res.ok) {
        throw new Error(data?.error || `Gmail scan failed (HTTP ${res.status})`)
      }

      // The scanner collects non-fatal problems (expired OAuth, missing CLI)
      // in `errors` — show them instead of silently reporting "0 new".
      if (data?.errors?.length) {
        setError(data.errors.join(" · "))
      } else {
        setScanNotice(
          `Gmail scan complete — scanned ${data?.scannedCount ?? 0}, matched ${data?.matchedCount ?? 0}, ${data?.newEmails?.length ?? 0} new.`
        )
      }

      await loadData(true)
    } catch (err) {
      console.error("Email scan failed:", err)
      setError(err instanceof Error ? err.message : "Email scan failed")
    } finally {
      setIsScanning(false)
    }
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[var(--color-bg)]">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenAddModal={() => setIsAddModalOpen(true)}
        totalCount={applications.length}
        emailCount={stats?.recentEvents?.filter((e) => e.event_type === "email_received").length || 0}
        onRefreshAll={() => loadData(false)}
        isRefreshing={isRefreshing}
      />

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="mx-auto max-w-7xl space-y-6">
          {error && <ErrorBanner message={error} retry={() => loadData(false)} />}

          {scanNotice && (
            <div
              role="status"
              className="flex items-center justify-between gap-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-300"
            >
              <span>{scanNotice}</span>
              <button
                onClick={() => setScanNotice(null)}
                aria-label="Dismiss scan result"
                className="rounded px-2 py-0.5 text-xs text-emerald-400/80 hover:bg-emerald-500/15 hover:text-emerald-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
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
              applications={applications}
              onSelectApplication={(id) => setSelectedAppId(id)}
            />
          )}

          {activeTab === "webhook" && <WebhookView />}

          {activeTab === "settings" && <SettingsView />}
        </div>
      </main>

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
