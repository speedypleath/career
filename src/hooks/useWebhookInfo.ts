"use client"

import { getWebhookInfo } from "@/lib/api-client"
import type { WebhookInfo } from "@/lib/api-client"
import { useAsync } from "./useAsync"

export function useWebhookInfo() {
  return useAsync<WebhookInfo | null>(getWebhookInfo, null)
}
