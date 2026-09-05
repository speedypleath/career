"use client"

import { getEmailSettings } from "@/lib/api-client"
import type { EmailSettings } from "@/types"
import { useAsync } from "./useAsync"

export function useEmailSettings() {
  return useAsync<EmailSettings | null>(getEmailSettings, null)
}
