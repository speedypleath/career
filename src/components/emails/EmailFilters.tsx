"use client"

import { Search } from "lucide-react"
import { CLASSIFICATION_OPTIONS } from "./classification"

interface EmailFiltersProps {
  search: string
  onSearchChange: (value: string) => void
  classification: string
  onClassificationChange: (value: string) => void
  count: number
}

export function EmailFilters({
  search,
  onSearchChange,
  classification,
  onClassificationChange,
  count,
}: EmailFiltersProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)] p-3">
      <div className="relative min-w-44 flex-1">
        <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[var(--color-faint)]" />
        <input
          type="search"
          placeholder="Search senders, subjects and companies"
          aria-label="Search emails"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] py-1.5 pl-8 pr-3 text-xs text-[var(--color-fg)] placeholder-[var(--color-faint)] focus:border-[var(--color-accent)] focus:outline-none"
        />
      </div>

      <select
        value={classification}
        onChange={(e) => onClassificationChange(e.target.value)}
        aria-label="Filter by classification"
        className="rounded border border-[var(--color-line)] bg-[var(--color-bg)] px-2.5 py-1.5 text-xs text-[var(--color-fg)] focus:border-[var(--color-accent)] focus:outline-none"
      >
        <option value="all">All ({count})</option>
        {CLASSIFICATION_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
