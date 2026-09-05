"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, Link2, RefreshCw } from "lucide-react"
import { cx, formatDateTime, getClassificationBadge } from "../format"
import type { EmailLog } from "@/types"

interface EmailThreadProps {
  emails: EmailLog[]
  suggested: EmailLog[]
  /** The id currently being reanalyzed, or null. One at a time, by design. */
  reanalyzingId: string | null
  reanalyzingAll: boolean
  linkingId: string | null
  onReanalyze: (id: string) => void
  onReanalyzeAll: () => void
  onLink: (id: string) => void
}

function EmailMeta({ email }: { email: EmailLog }) {
  const badge = getClassificationBadge(email.classification, email.classification_state)

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 space-y-0.5">
        <div className="text-xs font-semibold text-[var(--color-fg)] leading-snug">
          {email.subject}
        </div>
        <div className="text-2xs text-[var(--color-faint)]">
          From <span className="text-[var(--color-muted)]">{email.sender}</span> ·{" "}
          {formatDateTime(email.received_at)}
        </div>
      </div>
      <span className={cx("shrink-0 rounded border px-1.5 py-0.5 text-3xs font-semibold", badge.bg)}>
        {badge.label}
      </span>
    </div>
  )
}

export function EmailThread({
  emails,
  suggested,
  reanalyzingId,
  reanalyzingAll,
  linkingId,
  onReanalyze,
  onReanalyzeAll,
  onLink,
}: EmailThreadProps) {
  // Which body is open. Purely a viewing choice, so it stays here rather than
  // travelling up to the shell with the rest of the modal's state.
  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h4 className="text-xs font-semibold text-[var(--color-fg)]">Emails</h4>
          <p className="text-xs text-[var(--color-muted)]">
            Everything linked to this application, and anything from the same company that is
            not linked yet.
          </p>
        </div>
        {emails.length > 0 && (
          <button
            onClick={onReanalyzeAll}
            disabled={reanalyzingAll}
            className="flex items-center gap-1.5 rounded border border-[var(--color-line)] bg-[var(--color-surface-hi)] px-3 py-1.5 text-xs font-semibold text-[var(--color-muted)] hover:text-[var(--color-fg)] disabled:opacity-50 transition-colors shrink-0"
          >
            <RefreshCw className={cx("h-3.5 w-3.5", reanalyzingAll && "animate-spin")} />
            {reanalyzingAll ? "Reanalyzing" : "Reanalyze all"}
          </button>
        )}
      </div>

      <div className="space-y-3">
        <h5 className="text-xs font-semibold text-[var(--color-fg)]">Linked</h5>
        {emails.length > 0 ? (
          emails.map((email) => {
            const expanded = expandedId === email.id
            const hasBody = Boolean(email.body)

            return (
              <div
                key={email.id}
                className="rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-3 space-y-2"
              >
                <EmailMeta email={email} />

                {email.classification_error && (
                  <div className="text-2xs text-[var(--color-warn)] bg-[var(--color-warn)]/10 border border-[var(--color-warn)]/20 rounded px-2 py-1">
                    {email.classification_error}
                  </div>
                )}

                {hasBody ? (
                  expanded ? (
                    <div className="text-xs text-[var(--color-fg)] font-mono bg-[var(--color-surface)] p-3 rounded whitespace-pre-wrap max-h-[480px] overflow-y-auto leading-relaxed">
                      {email.body}
                    </div>
                  ) : (
                    email.snippet && (
                      <div className="text-xs text-[var(--color-muted)] font-mono bg-[var(--color-surface)] p-2 rounded line-clamp-3">
                        {email.snippet}
                      </div>
                    )
                  )
                ) : (
                  <div className="text-xs text-[var(--color-faint)] italic bg-[var(--color-surface)] p-2 rounded">
                    No body was stored — usually a passcode or one-time-link email.
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  {hasBody && (
                    <button
                      onClick={() => setExpandedId(expanded ? null : email.id)}
                      className="flex items-center gap-1 rounded border border-[var(--color-line)] bg-[var(--color-surface-hi)] px-2 py-1 text-2xs text-[var(--color-muted)] hover:text-[var(--color-fg)] transition-colors"
                    >
                      {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      {expanded ? "Collapse" : "Read full email"}
                    </button>
                  )}
                  <button
                    onClick={() => onReanalyze(email.id)}
                    disabled={reanalyzingId === email.id}
                    className="flex items-center gap-1 rounded border border-[var(--color-line)] bg-[var(--color-surface-hi)] px-2 py-1 text-2xs text-[var(--color-muted)] hover:text-[var(--color-fg)] disabled:opacity-50 transition-colors"
                  >
                    <RefreshCw className={cx("h-3 w-3", reanalyzingId === email.id && "animate-spin")} />
                    {reanalyzingId === email.id ? "Reanalyzing" : "Reanalyze"}
                  </button>
                </div>
              </div>
            )
          })
        ) : (
          <p className="text-xs text-[var(--color-faint)] py-4 text-center">
            Nothing linked yet. Scan the inbox, or link a suggestion below.
          </p>
        )}
      </div>

      <div className="space-y-3">
        <h5 className="text-xs font-semibold text-[var(--color-fg)]">Suggested</h5>
        {suggested.length > 0 ? (
          suggested.map((email) => (
            <div
              key={email.id}
              className="rounded border border-dashed border-[var(--color-line)] bg-[var(--color-bg)]/40 p-3 space-y-1.5"
            >
              <EmailMeta email={email} />

              {email.snippet && (
                <div className="text-xs text-[var(--color-muted)] font-mono bg-[var(--color-surface)] p-2 rounded line-clamp-2">
                  {email.snippet}
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => onLink(email.id)}
                  disabled={linkingId === email.id}
                  className="flex items-center gap-1 rounded bg-[var(--color-accent)] px-2.5 py-1 text-2xs font-semibold text-[#0b0c0f] hover:bg-[var(--color-accent)]/90 disabled:opacity-50 transition-colors"
                >
                  <Link2 className="h-3 w-3" />
                  {linkingId === email.id ? "Linking" : "Link to this application"}
                </button>
                <button
                  onClick={() => onReanalyze(email.id)}
                  disabled={reanalyzingId === email.id}
                  className="flex items-center gap-1 rounded border border-[var(--color-line)] bg-[var(--color-surface-hi)] px-2.5 py-1 text-2xs text-[var(--color-muted)] hover:text-[var(--color-fg)] disabled:opacity-50 transition-colors"
                >
                  <RefreshCw className={cx("h-3 w-3", reanalyzingId === email.id && "animate-spin")} />
                  Reanalyze
                </button>
              </div>
            </div>
          ))
        ) : (
          <p className="text-xs text-[var(--color-faint)] py-4 text-center">
            No unlinked mail from this company.
          </p>
        )}
      </div>
    </div>
  )
}
