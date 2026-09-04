"use client"

import { useState, useEffect } from "react"
import {
  X,
  Building,
  Briefcase,
  Globe,
  Mail,
  DollarSign,
  Calendar,
  Clock,
  Copy,
  Check,
  Edit2,
  Trash2,
  Send,
  ExternalLink,
  MessageSquare,
  Sparkles,
  ShieldCheck,
  Inbox,
  CheckCircle2,
  AlertCircle
} from "lucide-react"
import type { Application, ApplicationEvent, EmailLog, ApplicationStatus, WorkplaceType } from "@/types"
import { getStatusColor, getWorkplaceBadge, getPriorityBadge, formatDate, formatDateTime, cx } from "./format"

interface ApplicationDetailModalProps {
  applicationId: string | null
  isOpen: boolean
  onClose: () => void
  onUpdated: () => void
  onDeleted: () => void
}

export function ApplicationDetailModal({
  applicationId,
  isOpen,
  onClose,
  onUpdated,
  onDeleted,
}: ApplicationDetailModalProps) {
  const [app, setApp] = useState<(Application & { events?: ApplicationEvent[]; emails?: EmailLog[] }) | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedLetter, setCopiedLetter] = useState(false)
  const [activeTab, setActiveTab] = useState<"details" | "cover_letter" | "timeline" | "edit">("details")
  const [newNote, setNewNote] = useState("")
  const [submittingNote, setSubmittingNote] = useState(false)

  // Edit fields
  const [editTitle, setEditTitle] = useState("")
  const [editCompany, setEditCompany] = useState("")
  const [editStatus, setEditStatus] = useState<ApplicationStatus>("applied")
  const [editWorkplace, setEditWorkplace] = useState<WorkplaceType>("remote")
  const [editLocation, setEditLocation] = useState("")
  const [editSalary, setEditSalary] = useState("")
  const [editUrl, setEditUrl] = useState("")
  const [editJobDesc, setEditJobDesc] = useState("")
  const [editInfoProvided, setEditInfoProvided] = useState("")
  const [editCoverLetter, setEditCoverLetter] = useState("")
  const [editNotes, setEditNotes] = useState("")
  const [editContactEmail, setEditContactEmail] = useState("")

  useEffect(() => {
    if (!applicationId || !isOpen) {
      setApp(null)
      return
    }

    async function fetchDetails() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/applications/${applicationId}`)
        if (!res.ok) throw new Error("Failed to load application details")
        const data = await res.json()
        setApp(data.application)
        
        // Populate edit state
        setEditTitle(data.application.title || "")
        setEditCompany(data.application.company || "")
        setEditStatus(data.application.status || "applied")
        setEditWorkplace(data.application.workplace_type || "remote")
        setEditLocation(data.application.location || "")
        setEditSalary(data.application.salary || "")
        setEditUrl(data.application.url || "")
        setEditJobDesc(data.application.job_description || "")
        setEditInfoProvided(data.application.info_provided || "")
        setEditCoverLetter(data.application.cover_letter || "")
        setEditNotes(data.application.notes || "")
        setEditContactEmail(data.application.contact_email || "")
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error loading details")
      } finally {
        setLoading(false)
      }
    }

    void fetchDetails()
  }, [applicationId, isOpen])

  if (!isOpen || !applicationId) return null

  async function handleQuickStatusChange(newStatus: ApplicationStatus) {
    if (!app) return
    try {
      const res = await fetch(`/api/applications/${app.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error("Failed to update status")
      const data = await res.json()
      setApp((prev) => prev ? { ...prev, ...data.application } : null)
      setEditStatus(newStatus)
      onUpdated()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Update failed")
    }
  }

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault()
    if (!newNote.trim() || !app) return
    setSubmittingNote(true)
    try {
      const res = await fetch(`/api/applications/${app.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note_entry: newNote.trim() }),
      })
      if (!res.ok) throw new Error("Failed to add note")
      setNewNote("")
      // Refresh details
      const detailRes = await fetch(`/api/applications/${app.id}`)
      const detailData = await detailRes.json()
      setApp(detailData.application)
      onUpdated()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add note")
    } finally {
      setSubmittingNote(false)
    }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!app) return
    setLoading(true)
    try {
      const res = await fetch(`/api/applications/${app.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim(),
          company: editCompany.trim(),
          status: editStatus,
          workplace_type: editWorkplace,
          location: editLocation.trim(),
          salary: editSalary.trim(),
          url: editUrl.trim(),
          job_description: editJobDesc.trim(),
          info_provided: editInfoProvided.trim(),
          cover_letter: editCoverLetter.trim(),
          notes: editNotes.trim(),
          contact_email: editContactEmail.trim(),
        }),
      })
      if (!res.ok) throw new Error("Failed to save changes")
      const data = await res.json()
      setApp((prev) => prev ? { ...prev, ...data.application } : null)
      setActiveTab("details")
      onUpdated()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!app) return
    if (!confirm(`Are you sure you want to delete application for ${app.company}?`)) return
    try {
      const res = await fetch(`/api/applications/${app.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete")
      onDeleted()
      onClose()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete")
    }
  }

  function handleCopyCoverLetter() {
    if (!app?.cover_letter) return
    navigator.clipboard.writeText(app.cover_letter)
    setCopiedLetter(true)
    setTimeout(() => setCopiedLetter(false), 2000)
  }

  const statusStyle = app ? getStatusColor(app.status) : null
  const workplaceBadge = app ? getWorkplaceBadge(app.workplace_type) : null
  const priorityBadge = app ? getPriorityBadge(app.priority) : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)] shadow-2xl my-2 sm:my-6 flex flex-col max-h-[94vh] sm:max-h-[88vh]">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[var(--color-line)] p-4 sm:p-6 bg-[var(--color-surface-hi)]/40 gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-bold text-[var(--color-fg)] truncate">{app?.title || "Application Details"}</h2>
              <span className="text-xs sm:text-sm font-semibold text-[var(--color-accent)]">@ {app?.company}</span>
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
                {formatDate(app?.applied_at)}
              </span>
              {app?.location && (
                <span className="flex items-center gap-1">
                  <Globe className="h-3.5 w-3.5" />
                  {app.location}
                </span>
              )}
              {app?.salary && (
                <span className="flex items-center gap-1 text-[var(--color-muted)]">
                  <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
                  {app.salary}
                </span>
              )}
              {app?.url && (
                <a
                  href={app.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[var(--color-accent)] hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Link
                </a>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setActiveTab(activeTab === "edit" ? "details" : "edit")}
              className={cx(
                "flex items-center gap-1 rounded border px-2 py-1 text-xs transition-colors",
                activeTab === "edit"
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                  : "border-[var(--color-line)] text-[var(--color-muted)] hover:bg-[var(--color-surface-hi)]"
              )}
            >
              <Edit2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{activeTab === "edit" ? "View" : "Edit"}</span>
            </button>
            <button
              onClick={handleDelete}
              title="Delete application"
              className="rounded border border-[var(--color-danger)]/30 p-1.5 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/20 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onClose}
              className="rounded p-1 text-[var(--color-faint)] hover:bg-[var(--color-surface-hi)] hover:text-[var(--color-fg)] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Status Bar Quick Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[var(--color-line)] px-4 sm:px-6 py-2.5 bg-[var(--color-bg)]/60 text-xs gap-2">
          <div className="flex items-center gap-2">
            <span className="label">Status:</span>
            {statusStyle && (
              <span className={cx("flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-medium text-[11px]", statusStyle.bg, statusStyle.text, statusStyle.border)}>
                <span className={cx("h-1.5 w-1.5 rounded-full", statusStyle.dot)} />
                {statusStyle.label}
              </span>
            )}
          </div>

          {/* Quick status stepper buttons */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
            <span className="label mr-1 hidden sm:inline">Move:</span>
            {[
              { id: "applied", label: "Applied" },
              { id: "interview_pending", label: "Pending" },
              { id: "interviewing", label: "Interview" },
              { id: "technical_assessment", label: "Assessment" },
              { id: "offer", label: "Offer 🎉" },
              { id: "rejected", label: "Rejected" },
            ].map((st) => (
              <button
                key={st.id}
                onClick={() => handleQuickStatusChange(st.id as ApplicationStatus)}
                className={cx(
                  "rounded border px-2 py-0.5 text-[10px] whitespace-nowrap shrink-0 transition-colors",
                  app?.status === st.id
                    ? "border-[var(--color-accent)] bg-[var(--color-accent)]/20 text-[var(--color-accent)] font-semibold"
                    : "border-[var(--color-line)] text-[var(--color-faint)] hover:border-[var(--color-muted)] hover:text-[var(--color-fg)]"
                )}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex border-b border-[var(--color-line)] px-3 sm:px-6 bg-[var(--color-surface)] overflow-x-auto no-scrollbar whitespace-nowrap">
          <button
            onClick={() => setActiveTab("details")}
            className={cx(
              "px-3 sm:px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors shrink-0",
              activeTab === "details"
                ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-fg)]"
            )}
          >
            Overview & Job Info
          </button>
          <button
            onClick={() => setActiveTab("cover_letter")}
            className={cx(
              "flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors shrink-0",
              activeTab === "cover_letter"
                ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-fg)]"
            )}
          >
            Cover Letter & Info
            {app?.cover_letter && <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />}
          </button>
          <button
            onClick={() => setActiveTab("timeline")}
            className={cx(
              "flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors shrink-0",
              activeTab === "timeline"
                ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-fg)]"
            )}
          >
            Timeline & Emails
            <span className="rounded-full bg-[var(--color-line)] px-1.5 py-0.2 text-[10px] text-[var(--color-muted)]">
              {(app?.events?.length || 0) + (app?.emails?.length || 0)}
            </span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading && !app && (
            <div className="py-12 text-center text-xs text-[var(--color-faint)]">Loading details...</div>
          )}

          {activeTab === "details" && app && (
            <div className="space-y-6">
              {/* Submission metadata pills */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded border border-[var(--color-line)] bg-[var(--color-bg)]/40 p-3">
                  <span className="label block text-[10px]">Method</span>
                  <span className="text-xs font-medium text-[var(--color-fg)] capitalize mt-1 block">
                    {app.application_method}
                  </span>
                </div>
                <div className="rounded border border-[var(--color-line)] bg-[var(--color-bg)]/40 p-3">
                  <span className="label block text-[10px]">Workplace</span>
                  <span className="text-xs font-medium text-[var(--color-fg)] capitalize mt-1 block">
                    {app.workplace_type}
                  </span>
                </div>
                <div className="rounded border border-[var(--color-line)] bg-[var(--color-bg)]/40 p-3">
                  <span className="label block text-[10px]">Source</span>
                  <span className="text-xs font-medium text-[var(--color-fg)] mt-1 block truncate">
                    {app.source || "Manual"}
                  </span>
                </div>
                <div className="rounded border border-[var(--color-line)] bg-[var(--color-bg)]/40 p-3">
                  <span className="label block text-[10px]">Contact</span>
                  <span className="text-xs font-medium text-[var(--color-fg)] mt-1 block truncate">
                    {app.contact_email || "Not specified"}
                  </span>
                </div>
              </div>

              {/* Notes */}
              {app.notes && (
                <div className="rounded border border-[var(--color-line)] bg-[var(--color-bg)]/50 p-4">
                  <h4 className="label mb-2">Notes & Context</h4>
                  <p className="text-xs text-[var(--color-fg)] whitespace-pre-wrap leading-relaxed">
                    {app.notes}
                  </p>
                </div>
              )}

              {/* Job Description */}
              <div>
                <h4 className="label mb-2">Job Description & Requirements</h4>
                <div className="rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-4 max-h-96 overflow-y-auto font-mono text-xs leading-relaxed text-[var(--color-muted)] whitespace-pre-wrap">
                  {app.job_description || "No job description saved."}
                </div>
              </div>
            </div>
          )}

          {activeTab === "cover_letter" && app && (
            <div className="space-y-6">
              {/* Info Provided */}
              {app.info_provided && (
                <div>
                  <h4 className="label mb-2">Info Provided (Resume Version & Answers)</h4>
                  <div className="rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-4 font-mono text-xs leading-relaxed text-[var(--color-fg)] whitespace-pre-wrap">
                    {app.info_provided}
                  </div>
                </div>
              )}

              {/* Cover Letter */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="label">Cover Letter</h4>
                  {app.cover_letter && (
                    <button
                      onClick={handleCopyCoverLetter}
                      className="flex items-center gap-1 rounded border border-[var(--color-line)] bg-[var(--color-surface-hi)] px-2.5 py-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-fg)] transition-colors"
                    >
                      {copiedLetter ? (
                        <>
                          <Check className="h-3 w-3 text-[var(--color-accent)]" />
                          <span className="text-[var(--color-accent)]">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span>Copy Letter</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                <div className="rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-4 max-h-[500px] overflow-y-auto font-mono text-xs leading-relaxed text-[var(--color-fg)] whitespace-pre-wrap">
                  {app.cover_letter || (
                    <span className="text-[var(--color-faint)] italic">No cover letter attached to this application.</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "timeline" && app && (
            <div className="space-y-6">
              {/* Add Note / Event Form */}
              <form onSubmit={handleAddNote} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Log quick note or update (e.g. Completed initial screening call)..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  className="flex-1 rounded border border-[var(--color-line)] bg-[var(--color-bg)] py-2 px-3 text-xs text-[var(--color-fg)] placeholder-[var(--color-faint)] focus:border-[var(--color-accent)] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={submittingNote || !newNote.trim()}
                  className="flex items-center gap-1.5 rounded bg-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-[#0b0c0f] hover:bg-[var(--color-accent)]/90 disabled:opacity-50 transition-colors"
                >
                  <Send className="h-3.5 w-3.5" />
                  Add Event
                </button>
              </form>

              {/* Event & Email list */}
              <div className="space-y-3">
                {/* Linked Emails */}
                {app.emails && app.emails.length > 0 && (
                  <div className="space-y-2">
                    <h5 className="label text-[var(--color-accent)]">Linked Emails</h5>
                    {app.emails.map((email) => (
                      <div
                        key={email.id}
                        className="rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-3 space-y-1.5"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-[var(--color-fg)]">{email.subject}</span>
                          <span className="text-[10px] text-[var(--color-faint)]">{formatDateTime(email.received_at)}</span>
                        </div>
                        <div className="text-[11px] text-[var(--color-faint)]">
                          From: <span className="text-[var(--color-muted)]">{email.sender}</span> | Classification: <span className="text-[var(--color-accent)] uppercase">{email.classification}</span>
                        </div>
                        {email.snippet && (
                          <div className="text-xs text-[var(--color-muted)] font-mono bg-[var(--color-surface)] p-2 rounded">
                            {email.snippet}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Timeline Events */}
                <div className="space-y-2">
                  <h5 className="label">Activity Log</h5>
                  {app.events && app.events.length > 0 ? (
                    app.events.map((ev) => (
                      <div
                        key={ev.id}
                        className="flex items-start gap-3 rounded border border-[var(--color-line)] bg-[var(--color-surface-hi)]/30 p-3"
                      >
                        <div className="mt-0.5">
                          {ev.event_type === "status_change" ? (
                            <Clock className="h-4 w-4 text-[var(--color-warn)]" />
                          ) : ev.event_type === "email_received" ? (
                            <Mail className="h-4 w-4 text-[var(--color-accent)]" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-[var(--color-muted)]" />
                          )}
                        </div>
                        <div className="flex-1 space-y-0.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-[var(--color-fg)]">{ev.title}</span>
                            <span className="text-[10px] text-[var(--color-faint)]">{formatDateTime(ev.created_at)}</span>
                          </div>
                          {ev.description && (
                            <p className="text-xs text-[var(--color-muted)]">{ev.description}</p>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-[var(--color-faint)] py-4 text-center">
                      No events recorded yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "edit" && (
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="label block mb-1">Job Title</label>
                  <input
                    type="text"
                    required
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] py-2 px-3 text-xs text-[var(--color-fg)] focus:border-[var(--color-accent)] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="label block mb-1">Company</label>
                  <input
                    type="text"
                    required
                    value={editCompany}
                    onChange={(e) => setEditCompany(e.target.value)}
                    className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] py-2 px-3 text-xs text-[var(--color-fg)] focus:border-[var(--color-accent)] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="label block mb-1">Workplace Type</label>
                  <select
                    value={editWorkplace}
                    onChange={(e) => setEditWorkplace(e.target.value as WorkplaceType)}
                    className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] py-2 px-3 text-xs text-[var(--color-fg)] focus:border-[var(--color-accent)] focus:outline-none"
                  >
                    <option value="remote">Remote</option>
                    <option value="hybrid">Hybrid</option>
                    <option value="on-site">On-site</option>
                  </select>
                </div>
                <div>
                  <label className="label block mb-1">Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as ApplicationStatus)}
                    className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] py-2 px-3 text-xs text-[var(--color-fg)] focus:border-[var(--color-accent)] focus:outline-none"
                  >
                    <option value="applied">Applied</option>
                    <option value="wishlist">Wishlist</option>
                    <option value="interview_pending">Interview Pending</option>
                    <option value="interviewing">Interviewing</option>
                    <option value="technical_assessment">Technical Assessment</option>
                    <option value="offer">Offer</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
                <div>
                  <label className="label block mb-1">Location</label>
                  <input
                    type="text"
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] py-2 px-3 text-xs text-[var(--color-fg)] focus:border-[var(--color-accent)] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="label block mb-1">Salary</label>
                  <input
                    type="text"
                    value={editSalary}
                    onChange={(e) => setEditSalary(e.target.value)}
                    className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] py-2 px-3 text-xs text-[var(--color-fg)] focus:border-[var(--color-accent)] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="label block mb-1">Job URL</label>
                  <input
                    type="url"
                    value={editUrl}
                    onChange={(e) => setEditUrl(e.target.value)}
                    className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] py-2 px-3 text-xs text-[var(--color-fg)] focus:border-[var(--color-accent)] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="label block mb-1">Contact Email</label>
                  <input
                    type="text"
                    value={editContactEmail}
                    onChange={(e) => setEditContactEmail(e.target.value)}
                    className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] py-2 px-3 text-xs text-[var(--color-fg)] focus:border-[var(--color-accent)] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="label block mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-2.5 text-xs text-[var(--color-fg)] focus:border-[var(--color-accent)] focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="label block mb-1">Cover Letter</label>
                <textarea
                  rows={4}
                  value={editCoverLetter}
                  onChange={(e) => setEditCoverLetter(e.target.value)}
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-2.5 text-xs text-[var(--color-fg)] focus:border-[var(--color-accent)] focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="label block mb-1">Job Description</label>
                <textarea
                  rows={4}
                  value={editJobDesc}
                  onChange={(e) => setEditJobDesc(e.target.value)}
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-2.5 text-xs text-[var(--color-fg)] focus:border-[var(--color-accent)] focus:outline-none font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[var(--color-line)]">
                <button
                  type="button"
                  onClick={() => setActiveTab("details")}
                  className="rounded border border-[var(--color-line)] px-3 py-1.5 text-xs text-[var(--color-muted)] hover:bg-[var(--color-surface-hi)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-[#0b0c0f] hover:bg-[var(--color-accent)]/90"
                >
                  Save Changes
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
