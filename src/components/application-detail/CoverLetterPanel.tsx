"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"
import type { Application } from "@/types"

const COPIED_MS = 2_000

export function CoverLetterPanel({ application }: { application: Application }) {
  const [copied, setCopied] = useState(false)

  function copy() {
    if (!application.cover_letter) return
    navigator.clipboard.writeText(application.cover_letter)
    setCopied(true)
    setTimeout(() => setCopied(false), COPIED_MS)
  }

  return (
    <div className="space-y-6">
      {application.info_provided && (
        <div>
          <h4 className="mb-2 text-xs font-semibold text-[var(--color-fg)]">
            What you sent them
          </h4>
          <div className="rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-4 font-mono text-xs leading-relaxed text-[var(--color-fg)] whitespace-pre-wrap">
            {application.info_provided}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-[var(--color-fg)]">Cover letter</h4>
          {application.cover_letter && (
            <button
              onClick={copy}
              className="flex items-center gap-1 rounded border border-[var(--color-line)] bg-[var(--color-surface-hi)] px-2.5 py-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-fg)] transition-colors"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-[var(--color-accent)]" />
                  <span className="text-[var(--color-accent)]">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  <span>Copy</span>
                </>
              )}
            </button>
          )}
        </div>

        <div className="rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-4 max-h-[500px] overflow-y-auto font-mono text-xs leading-relaxed text-[var(--color-fg)] whitespace-pre-wrap">
          {application.cover_letter || (
            <span className="text-[var(--color-faint)] italic">
              No cover letter saved for this application.
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
