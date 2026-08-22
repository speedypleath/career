interface ErrorBannerProps {
  message: string
  retry?: () => void
}

export function ErrorBanner({ message, retry }: ErrorBannerProps) {
  return (
    <div className="flex items-center justify-between rounded-[var(--radius-panel)] border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-4 py-3 text-xs text-[var(--color-danger)]">
      <span>{message}</span>
      {retry && (
        <button
          onClick={retry}
          className="rounded border border-[var(--color-danger)]/40 px-2 py-1 hover:bg-[var(--color-danger)]/20 transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  )
}
