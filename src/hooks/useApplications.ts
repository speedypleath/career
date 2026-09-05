"use client"

import { useCallback } from "react"
import { getApplications, getStats } from "@/lib/api-client"
import type { Application, Stats } from "@/types"
import { useAsync } from "./useAsync"

/** Applications and stats are always shown together, so they load together. */
export interface Dashboard {
  applications: Application[]
  stats: Stats | null
}

const EMPTY: Dashboard = { applications: [], stats: null }

/**
 * Polled every fifteen seconds and refetched on window focus, because
 * applications also arrive from the webhook and the email scanner while the
 * page is open.
 */
const POLL_MS = 15_000

export function useDashboard() {
  // Stable identity: useAsync treats the loader as a dependency, so an inline
  // arrow here would restart the poll on every render.
  const load = useCallback(async (): Promise<Dashboard> => {
    const [applications, stats] = await Promise.all([getApplications(), getStats()])
    return { applications, stats }
  }, [])

  return useAsync<Dashboard>(load, EMPTY, { pollMs: POLL_MS, refetchOnFocus: true })
}
