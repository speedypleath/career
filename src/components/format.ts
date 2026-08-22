export function cx(...classes: (string | boolean | null | undefined)[]) {
  return classes.filter(Boolean).join(" ")
}

export function formatAgo(timestamp?: string | null): string {
  if (!timestamp) return "never"
  const diff = Date.now() - new Date(timestamp).getTime()
  if (diff < 0) return "just now"
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}d ago`
  const month = Math.floor(day / 30)
  return `${month}mo ago`
}

export function formatDate(timestamp?: string | null): string {
  if (!timestamp) return "—"
  const d = new Date(timestamp)
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export function formatDateTime(timestamp?: string | null): string {
  if (!timestamp) return "—"
  const d = new Date(timestamp)
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function getStatusColor(status: string) {
  switch (status) {
    case "applied":
      return {
        bg: "bg-blue-500/10",
        text: "text-blue-400",
        border: "border-blue-500/20",
        dot: "bg-blue-400",
        label: "Applied",
      }
    case "interview_pending":
      return {
        bg: "bg-amber-500/10",
        text: "text-amber-400",
        border: "border-amber-500/20",
        dot: "bg-amber-400",
        label: "Interview Pending",
      }
    case "interviewing":
      return {
        bg: "bg-emerald-500/10",
        text: "text-emerald-400",
        border: "border-emerald-500/20",
        dot: "bg-emerald-400",
        label: "Interviewing",
      }
    case "technical_assessment":
      return {
        bg: "bg-purple-500/10",
        text: "text-purple-400",
        border: "border-purple-500/20",
        dot: "bg-purple-400",
        label: "Tech Assessment",
      }
    case "offer":
      return {
        bg: "bg-teal-500/10",
        text: "text-teal-300 font-bold",
        border: "border-teal-500/30",
        dot: "bg-teal-300",
        label: "Offer Received 🎉",
      }
    case "rejected":
      return {
        bg: "bg-red-500/10",
        text: "text-red-400",
        border: "border-red-500/20",
        dot: "bg-red-400",
        label: "Rejected",
      }
    case "wishlist":
      return {
        bg: "bg-zinc-500/10",
        text: "text-zinc-400",
        border: "border-zinc-500/20",
        dot: "bg-zinc-400",
        label: "Wishlist",
      }
    case "archived":
      return {
        bg: "bg-zinc-700/10",
        text: "text-zinc-500",
        border: "border-zinc-700/20",
        dot: "bg-zinc-600",
        label: "Archived",
      }
    default:
      return {
        bg: "bg-zinc-500/10",
        text: "text-zinc-400",
        border: "border-zinc-500/20",
        dot: "bg-zinc-400",
        label: status,
      }
  }
}

export function getWorkplaceBadge(workplace: string) {
  switch (workplace) {
    case "remote":
      return {
        label: "Remote",
        bg: "bg-emerald-950/40 text-emerald-300 border-emerald-800/30",
      }
    case "hybrid":
      return {
        label: "Hybrid",
        bg: "bg-sky-950/40 text-sky-300 border-sky-800/30",
      }
    case "on-site":
    case "onsite":
      return {
        label: "On-site",
        bg: "bg-amber-950/40 text-amber-300 border-amber-800/30",
      }
    default:
      return {
        label: workplace,
        bg: "bg-zinc-900 text-zinc-400 border-zinc-800",
      }
  }
}

export function getPriorityBadge(priority: string) {
  switch (priority) {
    case "top":
      return { label: "TOP", bg: "bg-rose-500/20 text-rose-300 border-rose-500/30 font-semibold" }
    case "high":
      return { label: "HIGH", bg: "bg-amber-500/20 text-amber-300 border-amber-500/30" }
    case "medium":
      return { label: "MED", bg: "bg-blue-500/20 text-blue-300 border-blue-500/30" }
    case "low":
    default:
      return { label: "LOW", bg: "bg-zinc-800 text-zinc-400 border-zinc-700/50" }
  }
}
