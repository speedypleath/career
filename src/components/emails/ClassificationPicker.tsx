"use client"

import { Sparkles } from "lucide-react"
import { cx } from "../format"
import { CLASSIFICATION_OPTIONS } from "./classification"

interface ClassificationPickerProps {
  value: string
  onChange: (classification: string) => void
  onReanalyze: () => void
  reanalyzing: boolean
}

/**
 * Changing the label here is not an ordinary edit: it marks the log as a
 * manual override, and from then on rescans, the reanalyze route and the queue
 * worker all leave the row alone. Hence one named handler rather than an
 * inline fetch, and hence reanalysing an overridden email does nothing.
 */
export function ClassificationPicker({
  value,
  onChange,
  onReanalyze,
  reanalyzing,
}: ClassificationPickerProps) {
  return (
    <div className="mt-1 flex items-center gap-1.5">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Classification"
        className="rounded border border-[var(--color-line)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-fg)] focus:border-[var(--color-accent)] focus:outline-none"
      >
        {CLASSIFICATION_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={onReanalyze}
        disabled={reanalyzing}
        title="Run the classifier over this email again"
        className="flex items-center gap-1 rounded border border-[var(--color-line)] bg-[var(--color-bg)] px-2 py-1 text-xs font-medium text-[var(--color-fg)] hover:bg-[var(--color-surface-hi)] hover:text-[var(--color-accent)] disabled:opacity-50 transition-colors"
      >
        <Sparkles
          className={cx("h-3 w-3 text-[var(--color-accent)]", reanalyzing && "animate-spin")}
        />
        <span>{reanalyzing ? "Reanalyzing" : "Reanalyze"}</span>
      </button>
    </div>
  )
}
