"use client"

import { cx, getStatusColor } from "../format"
import type { ApplicationStatus } from "@/types"

/**
 * The stages worth one click. `archived` is deliberately absent — it is not a
 * step along the way, and the edit form still reaches it.
 */
const STEPS: { id: ApplicationStatus; label: string }[] = [
  { id: "applied", label: "Applied" },
  { id: "interview_pending", label: "Pending" },
  { id: "interviewing", label: "Interview" },
  { id: "technical_assessment", label: "Assessment" },
  { id: "offer", label: "Offer 🎉" },
  { id: "rejected", label: "Rejected" },
]

/**
 * `wishlist` is not a pipeline step — it sits before `applied` — so it gets its
 * own one-click affordance, set off from the linear steps.
 */
const WISHLIST: { id: ApplicationStatus; label: string } = { id: "wishlist", label: "Wishlist" }

interface StatusStepperProps {
  status: ApplicationStatus | undefined
  onChange: (status: ApplicationStatus) => void
}

export function StatusStepper({ status, onChange }: StatusStepperProps) {
  const style = status ? getStatusColor(status) : null

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[var(--color-line)] px-4 sm:px-6 py-2.5 bg-[var(--color-bg)]/60 text-xs gap-2">
      <div className="flex items-center gap-2">
        <span className="text-[var(--color-faint)]">Status</span>
        {style && (
          <span
            className={cx(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-medium text-2xs",
              style.bg,
              style.text,
              style.border,
            )}
          >
            <span className={cx("h-1.5 w-1.5 rounded-full", style.dot)} />
            {style.label}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
        <span className="mr-1 hidden sm:inline text-[var(--color-faint)]">Move to</span>
        <button
          key={WISHLIST.id}
          onClick={() => onChange(WISHLIST.id)}
          className={cx(
            "rounded border px-2 py-0.5 text-3xs whitespace-nowrap shrink-0 transition-colors",
            status === WISHLIST.id
              ? "border-[var(--color-accent)] bg-[var(--color-accent)]/20 text-[var(--color-accent)] font-semibold"
              : "border-[var(--color-line)] text-[var(--color-faint)] hover:border-[var(--color-muted)] hover:text-[var(--color-fg)]",
          )}
        >
          {WISHLIST.label}
        </button>
        <span className="mx-0.5 h-3 w-px shrink-0 bg-[var(--color-line)]" />
        {STEPS.map((step) => (
          <button
            key={step.id}
            onClick={() => onChange(step.id)}
            className={cx(
              "rounded border px-2 py-0.5 text-3xs whitespace-nowrap shrink-0 transition-colors",
              status === step.id
                ? "border-[var(--color-accent)] bg-[var(--color-accent)]/20 text-[var(--color-accent)] font-semibold"
                : "border-[var(--color-line)] text-[var(--color-faint)] hover:border-[var(--color-muted)] hover:text-[var(--color-fg)]",
            )}
          >
            {step.label}
          </button>
        ))}
      </div>
    </div>
  )
}
