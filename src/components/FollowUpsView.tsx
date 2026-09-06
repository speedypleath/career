"use client"

import { useCallback, useState } from "react"
import { CheckSquare, Mail } from "lucide-react"
import { ErrorBanner } from "./ErrorBanner"
import { EmailDetail } from "./emails/EmailDetail"
import { EmailRow } from "./emails/EmailRow"
import {
  getApplications,
  linkEmailToApplication,
  reanalyzeEmail,
  setEmailClassification,
  setFollowUpDone,
} from "@/lib/api-client"
import { useAsync } from "@/hooks/useAsync"
import type { useFollowUps } from "@/hooks/useFollowUps"
import type { Application, EmailLog } from "@/types"

interface FollowUpsViewProps {
  followUps: ReturnType<typeof useFollowUps>
  onSelectApplication: (id: string) => void
}

/**
 * Assessments, questions and interview replies still waiting on a response —
 * a filtered lens on the same email_logs rows the Emails tab shows, not a
 * separate inbox. Marking one handled just sets a persisted flag; it does not
 * touch classification or remove the email from the regular Emails tab.
 */
export function FollowUpsView({ followUps, onSelectApplication }: FollowUpsViewProps) {
  const { data: emails, loading, error, reload, setData, setError } = followUps
  const { data: applications } = useAsync<Application[]>(useCallback(() => getApplications(), []), [])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reanalyzingId, setReanalyzingId] = useState<string | null>(null)
  const [linkingId, setLinkingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const selectedEmail = emails.find((email) => email.id === selectedId) ?? null

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

  async function handleChangeApplication(id: string, applicationId: string | null) {
    setLinkingId(id)
    try {
      applyUpdate(await linkEmailToApplication(id, applicationId))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the linked application")
    } finally {
      setLinkingId(null)
    }
  }

  async function handleReanalyze(id: string) {
    setReanalyzingId(id)
    try {
      const result = await reanalyzeEmail(id)
      applyUpdate(result.email)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reanalyze that email")
    } finally {
      setReanalyzingId(null)
    }
  }

  // Marking done removes the row from view rather than leaving it in place —
  // the whole point is that a handled item stops showing up here.
  async function handleToggleFollowUp(id: string, done: boolean) {
    setTogglingId(id)
    try {
      await setFollowUpDone(id, done)
      setData((prev) => prev.filter((item) => item.id !== id))
      if (selectedId === id) setSelectedId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update that follow-up")
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} retry={() => reload(false)} />}

      <div>
        <h1 className="text-lg font-bold tracking-tight text-[var(--color-fg)]">Follow-ups</h1>
        <p className="text-xs text-[var(--color-muted)]">
          Assessments, questions and interview replies still waiting on you.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 overflow-hidden rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)]">
          <div className="divide-y divide-[var(--color-line-soft)] max-h-[600px] overflow-y-auto">
            {loading ? (
              <div className="py-12 text-center text-xs text-[var(--color-faint)]">Loading</div>
            ) : emails.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <CheckSquare className="h-8 w-8 text-[var(--color-faint)] mx-auto" />
                <p className="text-xs text-[var(--color-muted)]">Nothing needs a reply right now</p>
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
              <p className="text-xs">Pick one to see the full message.</p>
            </div>
          ) : (
            <EmailDetail
              email={selectedEmail}
              applications={applications}
              onChangeClassification={(next) => handleChangeClassification(selectedEmail.id, next)}
              onChangeApplication={(next) => handleChangeApplication(selectedEmail.id, next)}
              onReanalyze={() => handleReanalyze(selectedEmail.id)}
              reanalyzing={reanalyzingId === selectedEmail.id}
              linking={linkingId === selectedEmail.id}
              onOpenApplication={onSelectApplication}
              onToggleFollowUp={(done) => handleToggleFollowUp(selectedEmail.id, done)}
              followUpBusy={togglingId === selectedEmail.id}
            />
          )}
        </div>
      </div>

      {selectedEmail && (
        <div className="fixed inset-0 z-50 flex lg:hidden items-center justify-center bg-black/80 backdrop-blur-sm p-3">
          <div className="w-full max-w-lg rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)] shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-3 bg-[var(--color-surface-hi)]">
              <span className="text-xs font-bold text-[var(--color-fg)] truncate">Follow-up</span>
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
                applications={applications}
                onChangeClassification={(next) => handleChangeClassification(selectedEmail.id, next)}
                onChangeApplication={(next) => handleChangeApplication(selectedEmail.id, next)}
                onReanalyze={() => handleReanalyze(selectedEmail.id)}
                reanalyzing={reanalyzingId === selectedEmail.id}
                linking={linkingId === selectedEmail.id}
                onOpenApplication={(id) => {
                  onSelectApplication(id)
                  setSelectedId(null)
                }}
                bodyClassName="max-h-56"
                onToggleFollowUp={(done) => handleToggleFollowUp(selectedEmail.id, done)}
                followUpBusy={togglingId === selectedEmail.id}
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
    </div>
  )
}
