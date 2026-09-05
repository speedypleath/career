import { isAtsSender } from "./extract.ts"
import type { Application } from "../../types.ts"

// Intelligent matching of an email to existing applications
export function findBestMatchingApplication(
  applications: Application[],
  params: {
    company: string
    role: string
    sender: string
    subject: string
    body: string
    snippet: string
  }
): Application | null {
  const { company, role, sender, subject, body, snippet } = params
  const fullText = `${subject} ${snippet} ${body}`.toLowerCase()
  const compClean = company.toLowerCase().replace(/[^a-z0-9]/g, "")
  const senderIsAts = isAtsSender(sender)

  // 1. Filter applications that match the target company
  const companyMatches = applications.filter((app) => {
    const appCompClean = app.company.toLowerCase().replace(/[^a-z0-9]/g, "")
    if (appCompClean.length < 2) return false

    // Direct company name match
    if (
      compClean.length > 2 &&
      (compClean.includes(appCompClean) || appCompClean.includes(compClean))
    ) {
      return true
    }

    // Company name explicitly mentioned in subject or body
    if (fullText.includes(app.company.toLowerCase())) {
      return true
    }

    // Sender domain match (only for direct company domains)
    if (
      !senderIsAts &&
      app.contact_email &&
      !isAtsSender(app.contact_email) &&
      sender.toLowerCase().includes(app.contact_email.toLowerCase())
    ) {
      return true
    }

    return false
  })

  if (companyMatches.length === 0) {
    return null
  }

  if (companyMatches.length === 1) {
    return companyMatches[0]
  }

  // 2. If multiple applications exist for this company, score by title keywords
  const roleText = `${role} ${subject} ${snippet} ${body}`.toLowerCase()

  let bestApp: Application | null = null
  let maxScore = -1

  for (const app of companyMatches) {
    let score = 0
    const titleWords = app.title
      .toLowerCase()
      .split(/[\s,()/-]+/)
      .filter((w) => w.length > 2)

    for (const word of titleWords) {
      if (
        [
          "python",
          "rust",
          "react",
          "django",
          "java",
          "spring",
          "sre",
          "reliability",
          "platform",
          "evaluation",
          "ai",
          "backend",
          "fullstack",
          "frontend",
          "campaigns",
          "fuse",
          "cloud",
          "integrations",
          "node",
          "nodejs",
          "databricks",
          "backbone",
          "build",
          "storage",
          "kubernetes",
          "devops",
        ].includes(word)
      ) {
        if (roleText.includes(word)) score += 5
      } else {
        if (roleText.includes(word)) score += 1
      }
    }

    if (score > maxScore) {
      maxScore = score
      bestApp = app
    }
  }

  return bestApp || companyMatches[0]
}
