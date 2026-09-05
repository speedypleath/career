"use client"

import type { Application } from "@/types"

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-[var(--color-line)] bg-[var(--color-bg)]/40 p-3">
      <span className="block text-[10px] text-[var(--color-faint)]">{label}</span>
      <span className="text-xs font-medium text-[var(--color-fg)] capitalize mt-1 block truncate">
        {value}
      </span>
    </div>
  )
}

export function OverviewPanel({ application }: { application: Application }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Fact label="Applied via" value={application.application_method} />
        <Fact label="Workplace" value={application.workplace_type} />
        <Fact label="Logged by" value={application.source || "You"} />
        <Fact label="Contact" value={application.contact_email || "None on file"} />
      </div>

      {application.notes && (
        <div className="rounded border border-[var(--color-line)] bg-[var(--color-bg)]/50 p-4">
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
