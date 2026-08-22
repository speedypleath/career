import { cx } from "./format"

interface StatusDotProps {
  status: "online" | "warn" | "error" | "offline"
  className?: string
  pulse?: boolean
}

export function StatusDot({ status, className, pulse }: StatusDotProps) {
  const colors = {
    online: "bg-[var(--color-accent)]",
    warn: "bg-[var(--color-warn)]",
    error: "bg-[var(--color-danger)]",
    offline: "bg-[var(--color-faint)]",
  }

  return (
    <span className={cx("relative inline-flex h-2 w-2 rounded-full", colors[status], className)}>
      {pulse && (
        <span
          className={cx(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
            colors[status]
          )}
        />
      )}
    </span>
  )
}
