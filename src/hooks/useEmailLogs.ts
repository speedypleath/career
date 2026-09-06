"use client"

import { useCallback, useState } from "react"
import { getEmailLogs } from "@/lib/api-client"
import type { EmailLog } from "@/types"
import { useAsync } from "./useAsync"

const EMPTY: EmailLog[] = []

/**
 * Email logs, filtered server-side.
 *
 * The filters live here rather than in the view so that changing one reloads
 * through the same path as the initial fetch.
 */
export function useEmailLogs() {
  const [classification, setClassification] = useState("all")
  const [search, setSearch] = useState("")
  // Unrelated mail (newsletters, alerts, etc.) is hidden by default — the
  // classification filter can still be set to "unrelated" to see it.
  const [excludeUnrelated, setExcludeUnrelated] = useState(true)

  const load = useCallback(
    () => getEmailLogs({ classification, search, excludeUnrelated }),
    [classification, search, excludeUnrelated],
  )

  const state = useAsync<EmailLog[]>(load, EMPTY)

  return {
    ...state,
    classification,
    setClassification,
    search,
    setSearch,
    excludeUnrelated,
    setExcludeUnrelated,
  }
}
