import { ReactNode } from "react"
import { cx } from "./format"

interface MetricCardProps {
  label: string
  value: string | number
  unit?: string
  sub?: string
  icon?: ReactNode
  accent?: boolean
  warn?: boolean
  danger?: boolean
  className?: string
  onClick?: () => void
}

export function MetricCard({
  label,
  value,
  unit,
  sub,
  icon,
  accent,
  warn,
  danger,
  className,
  onClick,
}: MetricCardProps) {
  return (
    <div
      onClick={onClick}
      className={cx(
        "relative rounded-[var(--radius-panel)] border bg-[var(--color-surface)] p-4 transition-all duration-200",
        onClick && "cursor-pointer hover:border-[var(--color-line)] hover:bg-[var(--color-surface-hi)]",
        accent
          ? "border-[var(--color-accent)]/30 bg-gradient-to-b from-[var(--color-surface)] to-[var(--color-surface-hi)]"
          : warn
          ? "border-[var(--color-warn)]/30"
          : danger
          ? "border-[var(--color-danger)]/30"
          : "border-[var(--color-line)]",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="label">{label}</span>
        {icon && <div className="text-[var(--color-muted)]">{icon}</div>}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span
          className={cx(
            "tnum text-2xl font-bold tracking-tight",
            accent
              ? "text-[var(--color-accent)]"
              : warn
              ? "text-[var(--color-warn)]"
              : danger
              ? "text-[var(--color-danger)]"
              : "text-[var(--color-fg)]"
          )}
        >
          {value}
        </span>
        {unit && <span className="text-xs text-[var(--color-muted)]">{unit}</span>}
      </div>
      {sub && <div className="mt-1 text-xs text-[var(--color-faint)] truncate">{sub}</div>}
    </div>
  )
}
