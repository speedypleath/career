"use client"

import type { Application } from "@/types"

/**
 * Four facts about how the application was filed. They are metadata, not the
 * content, so they read as a rule-separated row rather than four bordered cards
 * competing with the job description below them.
 */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="block text-3xs text-[var(--color-faint)]">{label}</span>
      <span className="mt-0.5 block truncate text-xs font-medium text-[var(--color-fg)] capitalize">
        {value}
      </span>
    </div>
  )
}

export function OverviewPanel({ application }: { application: Application }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-b border-[var(--color-line)] pb-4">
        <Fact label="Applied via" value={application.application_method} />
        <Fact label="Workplace" value={application.workplace_type} />
        <Fact label="Logged by" value={application.source || "You"} />
        <Fact label="Contact" value={application.contact_email || "None on file"} />
      </div>

      {application.notes && (
        <div>
          <h4 className="mb-2 text-xs font-semibold text-[var(--color-fg)]">Notes</h4>
          <p className="text-xs text-[var(--color-fg)] whitespace-pre-wrap leading-relaxed">
            {application.notes}
          </p>
        </div>
      )}

      <div>
        <h4 className="mb-2 text-xs font-semibold text-[var(--color-fg)]">Job description</h4>
        <div className="rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-4 max-h-96 overflow-y-auto font-mono text-xs leading-relaxed text-[var(--color-muted)] whitespace-pre-wrap">
          {application.job_description || "Nothing saved for this posting."}
        </div>
      </div>
    </div>
  )
}
