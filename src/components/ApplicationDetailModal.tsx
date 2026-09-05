"use client"

import { useState } from "react"
import { ErrorBanner } from "./ErrorBanner"
import { CoverLetterPanel } from "./application-detail/CoverLetterPanel"
import { EditForm } from "./application-detail/EditForm"
import { EmailThread } from "./application-detail/EmailThread"
import { Header } from "./application-detail/Header"
import { OverviewPanel } from "./application-detail/OverviewPanel"
import { StatusStepper } from "./application-detail/StatusStepper"
import { Tabs, type DetailTab } from "./application-detail/Tabs"
import { Timeline } from "./application-detail/Timeline"
import { useApplicationDetail } from "@/hooks/useApplicationDetail"
import {
  deleteApplication,
  linkEmailToApplication,
  reanalyzeApplicationEmails,
  reanalyzeEmail,
  updateApplication,
  updateApplicationStatus,
} from "@/lib/api-client"
import type { Application, ApplicationStatus } from "@/types"

interface ApplicationDetailModalProps {
  applicationId: string | null
  isOpen: boolean
  onClose: () => void
  onUpdated: () => void
  onDeleted: () => void
}

/**
 * A shell: it owns the tab, the busy flags and the one error channel, and hands
 * everything else to the panels. Every write goes through the api client, and
 * every failure lands in the banner above the panels — the old version raised
 * seven separate alert() dialogs and swallowed the load error entirely.
 */
export function ApplicationDetailModal({
  applicationId,
  isOpen,
  onClose,
  onUpdated,
  onDeleted,
}: ApplicationDetailModalProps) {
  // A closed modal must not fetch, so the id is withheld until it opens.
  const { data: app, loading, error, reload, setData, setError } = useApplicationDetail(
    isOpen ? applicationId : null,
  )

  const [tab, setTab] = useState<DetailTab>("details")
  const [saving, setSaving] = useState(false)
  const [addingNote, setAddingNote] = useState(false)
  const [reanalyzingId, setReanalyzingId] = useState<string | null>(null)
  const [reanalyzingAll, setReanalyzingAll] = useState(false)
  const [linkingId, setLinkingId] = useState<string | null>(null)
  // A write that declines to run is a success, not a failure, so it gets its
  // own neutral line rather than the red banner.
  const [notice, setNotice] = useState<string | null>(null)

  if (!isOpen || !applicationId) return null

  // A const the handlers can close over: TypeScript drops the null check on a
  // prop binding once it is read inside a callback.
  const id = applicationId

  /** One try/catch for every write, so no failure can go unreported again. */
  async function run(fallback: string, action: () => Promise<void>) {
    setError(null)
    setNotice(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback)
    }
  }

  function merge(updated: Application) {
    setData((prev) => (prev ? { ...prev, ...updated } : prev))
  }

  const handleStatusChange = (status: ApplicationStatus) =>
    run("Could not change the status", async () => {
      merge(await updateApplicationStatus(id, status))
      onUpdated()
    })

  const handleSave = (patch: Partial<Application>) =>
    run("Could not save your changes", async () => {
      setSaving(true)
      try {
        merge(await updateApplication(id, patch))
        setTab("details")
        onUpdated()
      } finally {
        setSaving(false)
      }
    })

  const handleAddNote = (note: string) =>
    run("Could not add the note", async () => {
      setAddingNote(true)
      try {
        await updateApplication(id, { note_entry: note })
        await reload(true)
        onUpdated()
      } finally {
        setAddingNote(false)
      }
    })

  const handleDelete = () =>
    run("Could not delete the application", async () => {
      if (!app) return
      if (!confirm(`Delete the ${app.title} application at ${app.company}?`)) return
      await deleteApplication(id)
      onDeleted()
      onClose()
    })

  const handleReanalyze = (emailId: string) =>
    run("Could not reanalyze that email", async () => {
      setReanalyzingId(emailId)
      try {
        const result = await reanalyzeEmail(emailId)
        if (result.skipped) {
          setNotice("Left alone — this email keeps the classification you gave it.")
        }
        await reload(true)
      } finally {
        setReanalyzingId(null)
      }
    })

  const handleReanalyzeAll = () =>
    run("Could not reanalyze the emails", async () => {
      setReanalyzingAll(true)
      try {
        const result = await reanalyzeApplicationEmails(id)
        if (result.skippedCount > 0) {
          setNotice(
            `${result.reanalyzedCount} reanalyzed. ${result.skippedCount} kept the classification you gave them.`,
          )
        }
        await reload(true)
        onUpdated()
      } finally {
        setReanalyzingAll(false)
      }
    })

  const handleLink = (emailId: string) =>
    run("Could not link that email", async () => {
      setLinkingId(emailId)
      try {
        await linkEmailToApplication(emailId, id)
        await reload(true)
        onUpdated()
      } finally {
        setLinkingId(null)
      }
    })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)] shadow-2xl my-2 sm:my-6 flex flex-col max-h-[94vh] sm:max-h-[88vh]">
        <Header
          application={app}
          editing={tab === "edit"}
          onToggleEdit={() => setTab(tab === "edit" ? "details" : "edit")}
          onDelete={handleDelete}
          onClose={onClose}
        />

        <StatusStepper status={app?.status} onChange={handleStatusChange} />

        <Tabs
          active={tab}
          onChange={setTab}
          emailCount={(app?.emails.length ?? 0) + (app?.suggestedEmails.length ?? 0)}
          timelineCount={(app?.events.length ?? 0) + (app?.emails.length ?? 0)}
          hasCoverLetter={Boolean(app?.cover_letter)}
        />

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {error && <ErrorBanner message={error} retry={() => void reload()} />}
          {notice && <p className="text-xs text-[var(--color-muted)]">{notice}</p>}

          {loading && !app && (
            <p className="py-12 text-center text-xs text-[var(--color-faint)]">Loading…</p>
          )}

          {app && tab === "details" && <OverviewPanel application={app} />}
          {app && tab === "cover_letter" && <CoverLetterPanel application={app} />}
          {app && tab === "emails" && (
            <EmailThread
              emails={app.emails}
              suggested={app.suggestedEmails}
              reanalyzingId={reanalyzingId}
              reanalyzingAll={reanalyzingAll}
              linkingId={linkingId}
              onReanalyze={handleReanalyze}
              onReanalyzeAll={handleReanalyzeAll}
              onLink={handleLink}
            />
          )}
          {app && tab === "timeline" && (
            <Timeline
              events={app.events}
              emails={app.emails}
              onAddNote={handleAddNote}
              submitting={addingNote}
            />
          )}
          {app && tab === "edit" && (
            <EditForm
              key={app.id}
              application={app}
              onSave={handleSave}
              onCancel={() => setTab("details")}
              saving={saving}
            />
          )}
        </div>
      </div>
    </div>
  )
}
