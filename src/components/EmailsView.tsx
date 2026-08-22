"use client"

import { useState, useEffect } from "react"
import {
  Mail,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Inbox,
  Building,
  ArrowUpRight,
  Send,
  Plus
} from "lucide-react"
import { StatusDot } from "./StatusDot"
import { formatDateTime, formatAgo, cx } from "./format"
import type { EmailLog, Application } from "@/types"

interface EmailsViewProps {
  onScanEmails: () => void
  isScanning: boolean
  applications: Application[]
  onSelectApplication: (id: string) => void
}

export function EmailsView({
  onScanEmails,
  isScanning,
  applications,
  onSelectApplication,
}: EmailsViewProps) {
  const [emails, setEmails] = useState<EmailLog[]>([])
  const [loading, setLoading] = useState(true)
  const [filterClass, setFilterClass] = useState<string>("all")
  const [search, setSearch] = useState("")
  const [selectedEmail, setSelectedEmail] = useState<EmailLog | null>(null)

  // Ingest Manual/Test Email Modal state
  const [showIngestModal, setShowIngestModal] = useState(false)
  const [ingestSender, setIngestSender] = useState("")
  const [ingestSubject, setIngestSubject] = useState("")
  const [ingestBody, setIngestBody] = useState("")
  const [ingestSubmitting, setIngestSubmitting] = useState(false)

  async function fetchEmails() {
    setLoading(true)
    try {
      let url = "/api/email/logs?"
      if (filterClass !== "all") url += `classification=${filterClass}&`
      if (search) url += `search=${encodeURIComponent(search)}&`
      const res = await fetch(url)
      const data = await res.json()
      if (data.emails) {
        setEmails(data.emails)
      }
    } catch (err) {
      console.error("Failed to load emails:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEmails()
  }, [filterClass, search])

  async function handleIngestEmail(e: React.FormEvent) {
    e.preventDefault()
    if (!ingestSender || !ingestSubject) return

    setIngestSubmitting(true)
    try {
      const res = await fetch("/api/email/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: ingestSender,
          subject: ingestSubject,
          body: ingestBody,
          snippet: ingestBody.slice(0, 200),
        }),
      })
      if (res.ok) {
        setShowIngestModal(false)
        setIngestSender("")
        setIngestSubject("")
        setIngestBody("")
        fetchEmails()
      }
    } catch (err) {
      console.error("Ingest email error:", err)
    } finally {
      setIngestSubmitting(false)
    }
  }

  async function handleUpdateClassification(emailId: string, classification: string) {
    try {
      const res = await fetch("/api/email/logs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: emailId, classification }),
      })
      if (res.ok) {
        fetchEmails()
      }
    } catch (err) {
      console.error("Failed to update classification:", err)
    }
  }

  function getClassificationBadge(classification: string) {
    switch (classification) {
      case "interview":
        return { bg: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30", label: "INTERVIEW" }
      case "offer":
        return { bg: "bg-teal-500/20 text-teal-300 border-teal-500/40 font-bold", label: "OFFER 🎉" }
      case "rejection":
        return { bg: "bg-rose-500/20 text-rose-400 border-rose-500/30", label: "REJECTION" }
      case "confirmation":
        return { bg: "bg-blue-500/20 text-blue-300 border-blue-500/30", label: "CONFIRMATION" }
      case "question":
        return { bg: "bg-amber-500/20 text-amber-300 border-amber-500/30", label: "ASSESSMENT / Q" }
      default:
        return { bg: "bg-zinc-800 text-zinc-400 border-zinc-700", label: "OTHER" }
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold tracking-tight text-[var(--color-fg)]">
              Email Radar & Response Classifier
            </h1>
            <span className="inline-flex items-center gap-1 rounded bg-[var(--color-accent)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-accent)] border border-[var(--color-accent)]/20">
              <Mail className="h-3 w-3" /> owner@example.com
            </span>
          </div>
          <p className="text-xs text-[var(--color-muted)]">
            Auto-scans and classifies recruiter invitations, confirmations, rejections, and test assessments
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowIngestModal(true)}
            className="flex items-center gap-1.5 rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-fg)] hover:bg-[var(--color-surface-hi)] transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Ingest Email
          </button>

          <button
            onClick={async () => {
              await onScanEmails()
              fetchEmails()
            }}
            disabled={isScanning}
            className="flex items-center gap-1.5 rounded-[var(--radius-panel)] bg-[var(--color-accent)] px-3.5 py-1.5 text-xs font-semibold text-[#0b0c0f] shadow-sm hover:bg-[var(--color-accent)]/90 disabled:opacity-50 transition-all"
          >
            <RefreshCw className={cx("h-3.5 w-3.5", isScanning && "animate-spin")} />
            {isScanning ? "Scanning Gmail..." : "Run Gmail Scanner"}
          </button>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)] p-3">
        <div className="relative min-w-64 flex-1">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[var(--color-faint)]" />
          <input
            type="text"
            placeholder="Search email subjects, sender addresses, snippets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] py-1.5 pl-8 pr-3 text-xs text-[var(--color-fg)] placeholder-[var(--color-faint)] focus:border-[var(--color-accent)] focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filterClass}
            onChange={(e) => setFilterClass(e.target.value)}
            className="rounded border border-[var(--color-line)] bg-[var(--color-bg)] px-2.5 py-1.5 text-xs text-[var(--color-fg)] focus:border-[var(--color-accent)] focus:outline-none"
          >
            <option value="all">All Classifications</option>
            <option value="interview">Interviews</option>
            <option value="offer">Offers</option>
            <option value="confirmation">Confirmations</option>
            <option value="rejection">Rejections</option>
            <option value="question">Assessments / Questions</option>
            <option value="unrelated">Unrelated</option>
          </select>
        </div>
      </div>

      {/* Main Grid: Email List & Email Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Email List (2 cols) */}
        <div className="lg:col-span-2 overflow-hidden rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)]">
          <div className="divide-y divide-[var(--color-line-soft)] max-h-[600px] overflow-y-auto">
            {loading ? (
              <div className="py-12 text-center text-xs text-[var(--color-faint)]">
                Loading email radar logs...
              </div>
            ) : emails.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <Inbox className="h-8 w-8 text-[var(--color-faint)] mx-auto" />
                <p className="text-xs text-[var(--color-muted)]">No emails logged in the radar</p>
                <p className="text-[11px] text-[var(--color-faint)]">
                  Click "Run Gmail Scanner" to pull recent messages or "Ingest Email" to add manually.
                </p>
              </div>
            ) : (
              emails.map((email) => {
                const badge = getClassificationBadge(email.classification)
                const isSelected = selectedEmail?.id === email.id

                return (
                  <div
                    key={email.id}
                    onClick={() => setSelectedEmail(email)}
                    className={cx(
                      "group p-3.5 cursor-pointer transition-colors space-y-1.5",
                      isSelected
                        ? "bg-[var(--color-surface-hi)] border-l-2 border-l-[var(--color-accent)]"
                        : "hover:bg-[var(--color-surface-hi)]/60"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-xs text-[var(--color-fg)] truncate">
                          {email.sender}
                        </span>
                        <span className={cx("text-[9px] px-1.5 py-0.2 rounded border font-mono font-bold shrink-0", badge.bg)}>
                          {badge.label}
                        </span>
                      </div>
                      <span className="tnum text-[10px] text-[var(--color-faint)] shrink-0">
                        {formatAgo(email.received_at || email.created_at)}
                      </span>
                    </div>

                    <div className="text-xs font-medium text-[var(--color-fg)] truncate">
                      {email.subject}
                    </div>

                    <div className="text-[11px] text-[var(--color-muted)] line-clamp-1">
                      {email.snippet}
                    </div>

                    {email.company && (
                      <div className="flex items-center gap-1.5 pt-1 text-[10px] text-[var(--color-accent)]">
                        <Building className="h-3 w-3" />
                        <span>Matched to application: <strong>{email.company}</strong></span>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Selected Email Detail Card (1 col) */}
        <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 space-y-4">
          {!selectedEmail ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-[var(--color-faint)]">
              <Mail className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-xs">Select an email to view full content and details</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="label text-[9px]">Classification</span>
                  <div className="mt-1">
                    <select
                      value={selectedEmail.classification}
                      onChange={(e) => {
                        handleUpdateClassification(selectedEmail.id, e.target.value)
                        setSelectedEmail({ ...selectedEmail, classification: e.target.value as any })
                      }}
                      className="rounded border border-[var(--color-line)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-fg)] focus:outline-none"
                    >
                      <option value="interview">Interview</option>
                      <option value="offer">Offer 🎉</option>
                      <option value="confirmation">Confirmation</option>
                      <option value="rejection">Rejection</option>
                      <option value="question">Question / Assessment</option>
                      <option value="unrelated">Unrelated</option>
                    </select>
                  </div>
                </div>

                <div className="text-right">
                  <span className="label text-[9px]">Received</span>
                  <div className="text-[11px] text-[var(--color-fg)] tnum mt-1">
                    {formatDateTime(selectedEmail.received_at || selectedEmail.created_at)}
                  </div>
                </div>
              </div>

              <div>
                <span className="label text-[9px]">Sender</span>
                <p className="text-xs font-mono text-[var(--color-fg)] break-all mt-0.5">
                  {selectedEmail.sender}
                </p>
              </div>

              <div>
                <span className="label text-[9px]">Subject</span>
                <p className="text-xs font-bold text-[var(--color-fg)] mt-0.5">
                  {selectedEmail.subject}
                </p>
              </div>

              {selectedEmail.application_id && (
                <div className="rounded border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/5 p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-[var(--color-accent)] font-semibold">
                      Linked Application: {selectedEmail.company || "Job Application"}
                    </span>
                    <button
                      onClick={() => onSelectApplication(selectedEmail.application_id!)}
                      className="text-[10px] text-[var(--color-fg)] hover:text-[var(--color-accent)] flex items-center gap-0.5"
                    >
                      Open <ArrowUpRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )}

              <div>
                <span className="label text-[9px]">Body / Snippet</span>
                <div className="mt-1.5 max-h-64 overflow-y-auto rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-3 text-xs text-[var(--color-muted)] font-mono whitespace-pre-wrap">
                  {selectedEmail.body || selectedEmail.snippet || "(No body content)"}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Ingest Email Modal */}
      {showIngestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)] p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-[var(--color-fg)]">Ingest Incoming Email</h2>
              <button onClick={() => setShowIngestModal(false)} className="text-[var(--color-faint)] hover:text-[var(--color-fg)]">
                ✕
              </button>
            </div>

            <form onSubmit={handleIngestEmail} className="space-y-3">
              <div>
                <label className="label block mb-1">Sender Email</label>
                <input
                  type="text"
                  placeholder="e.g. jobs@spotify.com or hr@reaktor.com"
                  required
                  value={ingestSender}
                  onChange={(e) => setIngestSender(e.target.value)}
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-2 text-xs text-[var(--color-fg)] focus:border-[var(--color-accent)] focus:outline-none"
                />
              </div>

              <div>
                <label className="label block mb-1">Subject</label>
                <input
                  type="text"
                  placeholder="e.g. Invitation to interview with Reaktor"
                  required
                  value={ingestSubject}
                  onChange={(e) => setIngestSubject(e.target.value)}
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-2 text-xs text-[var(--color-fg)] focus:border-[var(--color-accent)] focus:outline-none"
                />
              </div>

              <div>
                <label className="label block mb-1">Email Body Content</label>
                <textarea
                  rows={5}
                  placeholder="Paste email body here..."
                  value={ingestBody}
                  onChange={(e) => setIngestBody(e.target.value)}
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-2 text-xs text-[var(--color-fg)] focus:border-[var(--color-accent)] focus:outline-none font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowIngestModal(false)}
                  className="rounded border border-[var(--color-line)] px-3 py-1.5 text-xs text-[var(--color-muted)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={ingestSubmitting}
                  className="rounded bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-[#0b0c0f]"
                >
                  {ingestSubmitting ? "Classifying..." : "Ingest & Classify"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
