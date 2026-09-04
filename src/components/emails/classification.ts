import type { EmailLog } from "@/types"

/**
 * How each classification is shown, and the labels a person can pick from.
 *
 * This lived inside a switch in the middle of EmailsView, and the picker's
 * options were written out twice — once in the desktop rail and once in the
 * mobile modal, which is how they drifted apart. One list, used by both.
 */

export interface Badge {
  bg: string
  label: string
}

const BADGES: Record<string, Badge> = {
  interview: { bg: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30", label: "INTERVIEW" },
  offer: { bg: "bg-teal-500/20 text-teal-300 border-teal-500/40 font-bold", label: "OFFER 🎉" },
  rejection: { bg: "bg-rose-500/20 text-rose-400 border-rose-500/30", label: "REJECTION" },
  confirmation: { bg: "bg-blue-500/20 text-blue-300 border-blue-500/30", label: "CONFIRMATION" },
  assessment: { bg: "bg-violet-500/20 text-violet-300 border-violet-500/30", label: "ASSESSMENT" },
  question: { bg: "bg-amber-500/20 text-amber-300 border-amber-500/30", label: "QUESTION" },
  conference: {
    bg: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30 font-semibold",
    label: "CONFERENCE 🎟️",
  },
  unrelated: { bg: "bg-zinc-800 text-zinc-500 border-zinc-700", label: "NOT JOB MAIL" },
}

const OTHER: Badge = { bg: "bg-zinc-800 text-zinc-400 border-zinc-700", label: "OTHER" }

/** The queue's own states outrank the label, because the label is not final yet. */
const STATE_BADGES: Record<string, Badge> = {
  pending: { bg: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30", label: "CLASSIFYING" },
  failed: { bg: "bg-orange-500/15 text-orange-300 border-orange-500/30", label: "RETRY NEEDED" },
}

export function badgeFor(
  classification: string,
  state?: EmailLog["classification_state"],
): Badge {
  return (state && STATE_BADGES[state]) || BADGES[classification] || OTHER
}

export const CLASSIFICATION_OPTIONS = [
  { value: "interview", label: "Interview" },
  { value: "offer", label: "Offer 🎉" },
  { value: "assessment", label: "Assessment" },
  { value: "question", label: "Question" },
  { value: "confirmation", label: "Confirmation" },
  { value: "rejection", label: "Rejection" },
  { value: "conference", label: "Conference 🎟️" },
  { value: "unrelated", label: "Unrelated" },
] as const
