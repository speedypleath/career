"use client"

import { cx } from "../format"

export type DetailTab = "details" | "cover_letter" | "emails" | "timeline" | "edit"

interface TabsProps {
  active: DetailTab
  onChange: (tab: DetailTab) => void
  emailCount: number
  timelineCount: number
  hasCoverLetter: boolean
}

export function Tabs({ active, onChange, emailCount, timelineCount, hasCoverLetter }: TabsProps) {
  const tabs: { id: DetailTab; label: string; count?: number; dot?: boolean }[] = [
    { id: "details", label: "Overview" },
    { id: "cover_letter", label: "Cover letter", dot: hasCoverLetter },
    { id: "emails", label: "Emails", count: emailCount },
    { id: "timeline", label: "Timeline", count: timelineCount },
  ]

  return (
    <div className="flex border-b border-[var(--color-line)] px-3 sm:px-6 bg-[var(--color-surface)] overflow-x-auto no-scrollbar whitespace-nowrap">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cx(
            "flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors shrink-0",
            active === tab.id
              ? "border-[var(--color-accent)] text-[var(--color-accent)]"
              : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-fg)]",
          )}
        >
          {tab.label}
          {tab.dot && <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />}
          {tab.count ? (
            <span className="rounded-full bg-[var(--color-line)] px-1.5 py-0.2 text-3xs text-[var(--color-muted)]">
              {tab.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  )
}
