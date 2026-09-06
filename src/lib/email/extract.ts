import { ATS_DOMAINS as CLASSIFIER_ATS_DOMAINS } from "../email-classifier.ts"
import { BLACKLISTED_COMPANY_NAMES } from "./status.ts"
import { OWNER_NAME } from "../owner.ts"

// Matches any word of the owner's own name, e.g. "Alex Doe" -> /alex|doe/i.
// Guards a job-title heuristic below against picking up the applicant's own
// name from a subject line. Null (OWNER_NAME unset) just disables the guard.
const ownerNamePattern = OWNER_NAME.trim()
  ? new RegExp(OWNER_NAME.trim().split(/\s+/).join("|"), "i")
  : null

export function isAtsSender(sender: string): boolean {
  const lower = (sender || "").toLowerCase()
  return CLASSIFIER_ATS_DOMAINS.some((domain) => lower.includes(domain)) || lower.includes("linkedin.com")
}

export function sanitizeCompany(name: string): string {
  const trimmed = name.trim().replace(/^['"]|['"]$/g, "")
  if (trimmed.length < 2 || trimmed.length > 50) return "Unknown Company"
  if (BLACKLISTED_COMPANY_NAMES.has(trimmed.toLowerCase())) return "Unknown Company"
  if (/@|\b(?:newsletter|unsubscribe|digest|no-reply|noreply|passcode|verification)\b/i.test(trimmed)) {
    return "Unknown Company"
  }
  return trimmed
}

// Helper to extract clean company name from email metadata
/**
 * KNOWN BUG: `body` is accepted and never read. A company named only in the
 * message body (rather than the subject or the sender's domain) is therefore
 * never found — see the "job title is taken as the company" case in
 * tests/email-extract.test.ts. The parameter is kept so the signature stays
 * honest about what this function ought to consider, and so fixing it does not
 * require touching every call site.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function extractCompanyName(subject: string, sender: string, body: string): string {
  // 1. "You're invited to interview with <Company>"
  let m = subject.match(/(?:invited to interview with|interview with|invitation from)\s+([^!.,\n@]+)/i)
  if (m && m[1].trim().length > 1) {
    const s = sanitizeCompany(m[1])
    if (s !== "Unknown Company") return s
  }

  // 2. LinkedIn Easy Apply: "Alex, your application was sent to <Company>"
  m = subject.match(/application was sent to\s+([^!.,\n]+)/i)
  if (m && m[1].trim().length > 1) {
    const s = sanitizeCompany(m[1])
    if (s !== "Unknown Company") return s
  }

  // 3. "Your application to <Role> at <Company>" / "Your update from <Company>" / "Action Required for <Role> at <Company>"
  m = subject.match(/(?:application to|applied for|applied to|action required for|next steps for your job application:).+?\s+at\s+([^!.,\n]+)/i)
  if (m && m[1].trim().length > 1) {
    const s = sanitizeCompany(m[1])
    if (s !== "Unknown Company") return s
  }

  m = subject.match(/update from\s+([^!.,\n]+)/i)
  if (m && m[1].trim().length > 1) {
    const s = sanitizeCompany(m[1])
    if (s !== "Unknown Company") return s
  }

  // 4. "Thank you for applying to <Company>" / "Thanks for applying to <Company>"
  m = subject.match(/(?:applying to join|applying to|application to|interest in joining|interest in|application with)\s+([A-Za-z0-9\s._&-]+?)(?:!|\.|\(|$|\s+team|\s+hiring|\s+owner)/i)
  if (m && m[1].trim().length > 1) {
    const s = sanitizeCompany(m[1])
    if (s !== "Unknown Company") return s
  }

  // 5. "Update on your application at <Company>" / "Application received - <Company>"
  m = subject.match(/(?:application at|application -|application:)\s+([^!.,\n]+)/i)
  if (m && m[1].trim().length > 1) {
    const s = sanitizeCompany(m[1])
    if (s !== "Unknown Company") return s
  }

  // 6. "<Company> | Job Application" / "<Company> | Application Received"
  if (subject.includes(" | ")) {
    const parts = subject.split(" | ")
    if (parts[0].trim().length > 1 && parts[0].trim().length < 40 && !parts[0].toLowerCase().includes("invitation") && !parts[0].toLowerCase().includes("technical interview")) {
      const s = sanitizeCompany(parts[0])
      if (s !== "Unknown Company") return s
    }
    if (parts.length > 2 && parts[2].trim().length > 1 && parts[2].trim().length < 40) {
      const p = parts[2].trim()
      if (!p.toLowerCase().includes("invitation")) {
        const s = sanitizeCompany(p)
        if (s !== "Unknown Company") return s
      }
    }
  }

  // 7. "<Role> - <Company>"
  if (subject.includes(" - ")) {
    const parts = subject.split(" - ")
    if (parts[1] && parts[1].trim().length > 1 && parts[1].trim().length < 40) {
      const s = sanitizeCompany(parts[1])
      if (s !== "Unknown Company") return s
    }
    if (parts[0] && parts[0].trim().length > 1 && parts[0].trim().length < 40 && !parts[0].toLowerCase().includes("application") && !parts[0].toLowerCase().includes("invitation")) {
      const s = sanitizeCompany(parts[0])
      if (s !== "Unknown Company") return s
    }
  }

  // 8. Sender display name & direct domain
  if (sender) {
    if (sender.includes("<")) {
      const displayName = sender.split("<")[0].replace(/["']/g, "").trim()
      if (
        displayName &&
        !/linkedin|greenhouse|workable|ashby|smartrecruiters|lever|pinpoint|rippling|comeet|mailgun|sendgrid/i.test(displayName)
      ) {
        const cleaned = displayName
          .replace(/\s+(?:Hiring\s+Team|Team|Recruitment\s+Team|Recruiting\s+Team|Talent\s+Team|Careers|Recruiting|Jobs|Admin)$/i, "")
          .trim()
        if (cleaned.length > 1 && !cleaned.toLowerCase().includes("invitation")) {
          // If display name is recruiter's personal name, check domain
          const domain = sender.split("@")[1]?.split(">")[0]?.toLowerCase() || ""
          if (
            domain &&
            !/gmail|yahoo|hotmail|outlook|workablemail|ashbyhq|greenhouse|mailgun|pinpoint|rippling|comeet|lever|linkedin/i.test(domain)
          ) {
            const domainName = domain.split(".")[0]
            if (domainName.length > 1) {
              const s = sanitizeCompany(domainName.charAt(0).toUpperCase() + domainName.slice(1))
              if (s !== "Unknown Company") return s
            }
          }
          const s = sanitizeCompany(cleaned)
          if (s !== "Unknown Company") return s
        }
      }

      const domain = sender.split("@")[1]?.split(">")[0]?.toLowerCase() || ""
      if (
        domain &&
        !/gmail|yahoo|hotmail|outlook|workablemail|ashbyhq|greenhouse|mailgun|pinpoint|rippling|comeet|lever|linkedin/i.test(domain)
      ) {
        const domainName = domain.split(".")[0]
        if (domainName.length > 1) {
          const s = sanitizeCompany(domainName.charAt(0).toUpperCase() + domainName.slice(1))
          if (s !== "Unknown Company") return s
        }
      }
    } else if (sender.includes("@")) {
      const domain = sender.split("@")[1]?.toLowerCase() || ""
      if (
        domain &&
        !/gmail|yahoo|hotmail|outlook|workablemail|ashbyhq|greenhouse|mailgun|pinpoint|rippling|comeet|lever|linkedin/i.test(domain)
      ) {
        const domainName = domain.split(".")[0]
        if (domainName.length > 1) {
          const s = sanitizeCompany(domainName.charAt(0).toUpperCase() + domainName.slice(1))
          if (s !== "Unknown Company") return s
        }
      }
    }
  }

  return "Unknown Company"
}

// Helper to extract job title from subject or body
export function extractJobTitle(subject: string, body: string): string {
  // "Your application to <Role> at <Company>"
  let m = subject.match(/application to\s+(.+?)\s+at\s+/i)
  if (m && m[1].trim().length > 3 && m[1].trim().length < 80) {
    return m[1].trim()
  }

  // "Action Required for <Role> at <Company>"
  m = subject.match(/action required for\s+(.+?)(?:\s+at\s+|-|\.|$)/i)
  if (m && m[1].trim().length > 3 && m[1].trim().length < 80) {
    return m[1].trim()
  }

  // "Follow-up on your application to <Role>"
  m = subject.match(/application to\s+(.+?)(?:$|\s+at\s+|-|\.)/i)
  if (m && m[1].trim().length > 3 && m[1].trim().length < 80) {
    return m[1].trim()
  }

  // "Technical Interview | Alex Doe | Full Stack Developer @ ..."
  if (subject.includes("|")) {
    const parts = subject.split("|").map(s => s.trim())
    for (const part of parts) {
      if (
        /engineer|developer|architect|lead|manager|analyst|designer/i.test(part) &&
        !(ownerNamePattern && ownerNamePattern.test(part))
      ) {
        const cleaned = part.split("@")[0].trim()
        if (cleaned.length > 3) return cleaned
      }
    }
  }

  // "Senior Software Engineer - WorkMotion"
  if (subject.includes(" - ")) {
    const parts = subject.split(" - ")
    if (parts[0].trim().length > 3 && !parts[0].toLowerCase().includes("application") && !parts[0].toLowerCase().includes("update")) {
      return parts[0].trim()
    }
  }

  // "for the <Role> position" / "for <Role>"
  m = subject.match(/(?:for the|for)\s+([A-Za-z0-9\s._&/,()-]+?)(?:\s+position|\s+role|\s+at|\s+to|\s+-|!|\.|$)/i)
  if (m && m[1].trim().length > 3 && m[1].trim().length < 80) {
    return m[1].trim()
  }

  // Check body for explicit position mentions
  m = body.match(/(?:position of|role of|position:|role:)\s+(?:the\s+)?([A-Za-z0-9\s._&/,()-]+?)(?:\s+position|\s+role|\.|\n|$)/i)
  if (m && m[1].trim().length > 3 && m[1].trim().length < 80) {
    return m[1].trim()
  }

  m = body.match(/(?:applying for|application for)\s+(?:the\s+)?([A-Za-z0-9\s._&/,()-]+?)(?:\s+position|\s+role|\s+at|\.|\n|$)/i)
  if (m && m[1].trim().length > 3 && m[1].trim().length < 80) {
    return m[1].trim()
  }

  return "Software Engineer"
}
