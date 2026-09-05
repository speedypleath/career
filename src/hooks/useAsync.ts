"use client"

import { useCallback, useEffect, useState } from "react"

/**
 * The loading / error / refresh cycle every view was writing by hand.
 *
 * `quiet` reloads leave the existing data on screen and only raise the
 * refreshing flag, which is what a poll or a window-focus refetch wants — the
 * old code threaded a boolean through each loader for exactly this.
 *
 * `load` is a dependency, so a loader that closes over filter state must be
 * wrapped in useCallback by the caller. That is what makes changing a filter
 * refetch through the same path as the first load.
 */
export interface AsyncState<T> {
  data: T
  loading: boolean
  refreshing: boolean
  error: string | null
  reload: (quiet?: boolean) => Promise<void>
  setData: React.Dispatch<React.SetStateAction<T>>
  setError: (message: string | null) => void
}

export function useAsync<T>(
  load: () => Promise<T>,
  initial: T,
  options: { pollMs?: number; refetchOnFocus?: boolean } = {},
): AsyncState<T> {
  const { pollMs, refetchOnFocus } = options
  const [data, setData] = useState<T>(initial)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(
    async (quiet = false) => {
      // Yielding first keeps every state update out of the caller's render and
      // effect-commit phase, so a reload triggered on mount cannot cascade.
      await Promise.resolve()

      if (!quiet) setLoading(true)
      setRefreshing(true)
      setError(null)
      try {
        setData(await load())
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong")
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [load],
  )

  useEffect(() => {
    // react-hooks flags fetch-on-mount because it can cascade renders. It is
    // the intended behaviour here: there is no server-side loader to hang this
    // off, and consolidating it into one hook is what removed the same warning
    // from four separate views.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload()

    const timer = pollMs ? setInterval(() => void reload(true), pollMs) : null
    const onFocus = () => void reload(true)
    if (refetchOnFocus) window.addEventListener("focus", onFocus)

    return () => {
      if (timer) clearInterval(timer)
      if (refetchOnFocus) window.removeEventListener("focus", onFocus)
    }
  }, [reload, pollMs, refetchOnFocus])

  return { data, loading, refreshing, error, reload, setData, setError }
}
