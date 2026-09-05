import { cx } from "./format"

interface StatusDotProps {
  status: "online" | "warn" | "error" | "offline"
  className?: string
  pulse?: boolean
}

export function StatusDot({ status, className, pulse }: StatusDotProps) {
  const colors = {
    // Healthy is not news. Only a service that wants something from you earns
    // a colour, which is why online is monochrome and warn/error are not.
    online: "bg-[var(--color-muted)]",
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
