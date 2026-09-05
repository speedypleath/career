"use client"

import { useEffect, useState } from "react"
import { Inbox, Mail, Plus, RefreshCw } from "lucide-react"
import { ErrorBanner } from "./ErrorBanner"
import { EmailDetail } from "./emails/EmailDetail"
import { EmailFilters } from "./emails/EmailFilters"
import { EmailRow } from "./emails/EmailRow"
import { IngestEmailModal } from "./emails/IngestEmailModal"
import { cx } from "./format"
import { reanalyzeEmail, setEmailClassification } from "@/lib/api-client"
import { useEmailLogs } from "@/hooks/useEmailLogs"
import { OWNER_EMAIL } from "@/lib/owner"
import type { EmailLog } from "@/types"

interface EmailsViewProps {
  onScanEmails: () => void | Promise<void>
  isScanning: boolean
  onSelectApplication: (id: string) => void
}

/** How often to re-check while the queue still owes us a classification. */
const PENDING_POLL_MS = 3_000

export function EmailsView({ onScanEmails, isScanning, onSelectApplication }: EmailsViewProps) {
  const {
    data: emails,
    loading,
    error,
    reload,
    setData,
    setError,
    classification,
    setClassification,
    search,
    setSearch,
  } = useEmailLogs()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showIngest, setShowIngest] = useState(false)
  const [reanalyzingId, setReanalyzingId] = useState<string | null>(null)
  // A reanalysis that declines to run is a success, not a failure, so it gets
  // its own neutral line rather than the red banner.
  const [notice, setNotice] = useState<string | null>(null)

  // Reading the selection out of the list rather than copying it keeps the
  // panel in step with a reload; the old code held its own copy and had to
  // patch both by hand on every change.
  const selectedEmail = emails.find((email) => email.id === selectedId) ?? null

  const hasPending = emails.some((email) => email.classification_state === "pending")

  useEffect(() => {
    if (!hasPending) return
    const timer = window.setInterval(() => void reload(true), PENDING_POLL_MS)
    return () => window.clearInterval(timer)
  }, [hasPending, reload])

  function applyUpdate(updated: EmailLog) {
    setData((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)))
  }

  async function handleChangeClassification(id: string, next: string) {
    try {
      applyUpdate(await setEmailClassification(id, next))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the classification")
    }
  }

  async function handleReanalyze(id: string) {
    setReanalyzingId(id)
    setError(null)
    setNotice(null)
    try {
      const result = await reanalyzeEmail(id)
      applyUpdate(result.email)
      if (result.skipped) {
        setNotice("Left alone — this email keeps the classification you gave it.")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reanalyze that email")
    } finally {
      setReanalyzingId(null)
    }
  }

  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} retry={() => reload(false)} />}

      {notice && (
        <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-muted)]">
          {notice}
        </div>
      )}

      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold tracking-tight text-[var(--color-fg)]">Inbox</h1>
            <span className="inline-flex items-center gap-1 rounded bg-[var(--color-accent)]/10 px-2 py-0.5 text-3xs font-semibold text-[var(--color-accent)] border border-[var(--color-accent)]/20">
              <Mail className="h-3 w-3" /> {OWNER_EMAIL}
            </span>
          </div>
          <p className="text-xs text-[var(--color-muted)]">
            Every message the scanner has read, and what it decided each one was.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowIngest(true)}
            className="flex items-center gap-1.5 rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-fg)] hover:bg-[var(--color-surface-hi)] transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add an email
          </button>

          <button
            onClick={async () => {
              await onScanEmails()
              reload(true)
            }}
            disabled={isScanning}
            className="flex items-center gap-1.5 rounded-[var(--radius-panel)] bg-[var(--color-accent)] px-3.5 py-1.5 text-xs font-semibold text-[#0b0c0f] shadow-sm hover:bg-[var(--color-accent)]/90 disabled:opacity-50 transition-all"
          >
            <RefreshCw className={cx("h-3.5 w-3.5", isScanning && "animate-spin")} />
            {isScanning ? "Scanning" : "Scan inbox"}
          </button>
        </div>
      </div>

      <EmailFilters
        search={search}
        onSearchChange={setSearch}
        classification={classification}
        onClassificationChange={setClassification}
        count={emails.length}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 overflow-hidden rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)]">
          <div className="divide-y divide-[var(--color-line-soft)] max-h-[600px] overflow-y-auto">
            {loading ? (
              <div className="py-12 text-center text-xs text-[var(--color-faint)]">
                Loading your inbox
              </div>
            ) : emails.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <Inbox className="h-8 w-8 text-[var(--color-faint)] mx-auto" />
                <p className="text-xs text-[var(--color-muted)]">Nothing here yet</p>
                <p className="text-2xs text-[var(--color-faint)]">
                  Scan the inbox to pull in recent messages, or add one by hand.
                </p>
              </div>
            ) : (
              emails.map((email) => (
                <EmailRow
                  key={email.id}
                  email={email}
                  selected={selectedId === email.id}
                  reanalyzing={reanalyzingId === email.id}
                  onSelect={() => setSelectedId(email.id)}
                  onReanalyze={(e) => {
                    e.stopPropagation()
                    handleReanalyze(email.id)
                  }}
                />
              ))
            )}
          </div>
        </div>

        <div className="hidden lg:block rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 space-y-4">
          {!selectedEmail ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-[var(--color-faint)]">
              <Mail className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-xs">Pick an email to read it in full.</p>
            </div>
          ) : (
            <EmailDetail
              email={selectedEmail}
              onChangeClassification={(next) => handleChangeClassification(selectedEmail.id, next)}
              onReanalyze={() => handleReanalyze(selectedEmail.id)}
              reanalyzing={reanalyzingId === selectedEmail.id}
              onOpenApplication={onSelectApplication}
            />
          )}
        </div>
      </div>

      {selectedEmail && (
        <div className="fixed inset-0 z-50 flex lg:hidden items-center justify-center bg-black/80 backdrop-blur-sm p-3">
          <div className="w-full max-w-lg rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)] shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-3 bg-[var(--color-surface-hi)]">
              <span className="text-xs font-bold text-[var(--color-fg)] truncate">Email</span>
              <button
                onClick={() => setSelectedId(null)}
                aria-label="Close"
                className="rounded p-1 text-[var(--color-faint)] hover:text-[var(--color-fg)]"
              >
                ✕
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 text-xs">
              <EmailDetail
                email={selectedEmail}
                onChangeClassification={(next) => handleChangeClassification(selectedEmail.id, next)}
                onReanalyze={() => handleReanalyze(selectedEmail.id)}
                reanalyzing={reanalyzingId === selectedEmail.id}
                onOpenApplication={(id) => {
                  onSelectApplication(id)
                  setSelectedId(null)
                }}
                bodyClassName="max-h-56"
              />
            </div>

            <div className="border-t border-[var(--color-line)] p-3 bg-[var(--color-rail)] flex justify-end">
              <button
                onClick={() => setSelectedId(null)}
                className="rounded bg-[var(--color-surface-hi)] border border-[var(--color-line)] px-4 py-1.5 text-xs text-[var(--color-fg)]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showIngest && (
        <IngestEmailModal onClose={() => setShowIngest(false)} onIngested={() => reload(true)} />
      )}
    </div>
  )
}
