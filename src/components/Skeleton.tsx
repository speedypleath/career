import { cx } from "./format"

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton rounded", className)} />
}
