"use client"

import { useCallback } from "react"
import { getApplication } from "@/lib/api-client"
import type { ApplicationDetail } from "@/lib/api-client"
import { useAsync } from "./useAsync"

/**
 * The detail payload for one application.
 *
 * The modal is mounted before an id is picked, so `id` is nullable and a null
 * id resolves to null rather than fetching. The modal keys this hook on the id,
 * which is what makes opening a second application refetch.
 */
export function useApplicationDetail(id: string | null) {
  const load = useCallback(
    () => (id ? getApplication(id) : Promise.resolve(null)),
    [id],
  )

  return useAsync<ApplicationDetail | null>(load, null)
}
