import type { EmailClassification } from "../email-classifier.ts"
import type { ApplicationStatus } from "../../types.ts"

/**
 * The application status a freshly classified email implies.
 *
 * Returns null for classifications that say nothing about where the
 * application stands (a confirmation just means "received"), so callers can
 * leave the current status untouched.
 */
export function statusForClassification(classification: EmailClassification): ApplicationStatus | null {
  switch (classification) {
    case "offer":
      return "offer"
    case "rejection":
      return "rejected"
    case "interview":
      return "interviewing"
    case "assessment":
      return "technical_assessment"
    case "confirmation":
      return "applied"
    default:
      return null
  }
}

/**
 * Status changes that a rescan is allowed to make to an existing application.
 *
 * Ranked so a later stage never silently rewinds: an old confirmation arriving
 * after an interview invitation must not drag the application back to
 * "applied". "rejected" is exempt — it can arrive at any stage and always wins.
 */
export const STATUS_RANK: Record<string, number> = {
  wishlist: 0,
  applied: 1,
  interview_pending: 2,
  interviewing: 3,
  technical_assessment: 4,
  offer: 5,
  rejected: 6,
  archived: 7,
}

export function shouldAdvanceStatus(current: string | undefined, next: ApplicationStatus): boolean {
  if (!current) return true
  if (next === "rejected") return current !== "rejected"
  if (current === "rejected" || current === "archived") return false
  return (STATUS_RANK[next] ?? 0) > (STATUS_RANK[current] ?? 0)
}

export const BLACKLISTED_COMPANY_NAMES = new Set([
  "unknown company",
  "unknown role",
  "unknown",
  "linkedin",
  "google forms",
  "forms response receipts",
  "niv news",
  "ground news",
  "groundnews",
  "joburi hipo",
  "joburi hipo.ro",
  "hipo",
  "hipo.ro",
  "andrei gheorghe",
  "gheorgheandrei13",
  "smartrecruiters",
  "greenhouse",
  "workable",
  "ashby",
  "lever",
  "ziyue piao",
  "adcx",
  "ismir",
  "news",
  "newsletter",
])
