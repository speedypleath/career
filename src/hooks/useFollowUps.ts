"use client"

import { useCallback } from "react"
import { getEmailLogs } from "@/lib/api-client"
import type { EmailLog } from "@/types"
import { useAsync } from "./useAsync"

const EMPTY: EmailLog[] = []

/**
 * Emails needing a follow-up (assessment/question/interview, not yet marked
 * handled), lifted to page.tsx so the Sidebar badge and the Follow-ups tab
 * share one fetch. Polled like useDashboard — the badge has to stay live
 * without a manual refresh.
 */
const POLL_MS = 15_000

export function useFollowUps() {
  const load = useCallback(() => getEmailLogs({ needsFollowUp: true }), [])
  return useAsync<EmailLog[]>(load, EMPTY, { pollMs: POLL_MS, refetchOnFocus: true })
}
