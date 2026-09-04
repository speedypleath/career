import { exec } from "child_process"
import { randomUUID } from "node:crypto"
import { promisify } from "util"
import { query } from "./db"
import { classifyEmailDetailed, ATS_DOMAINS as CLASSIFIER_ATS_DOMAINS } from "./email-classifier"
import type { EmailClassification } from "./email-classifier"
import {
  MAX_QUEUED_CLASSIFICATIONS_PER_SCAN,
  buildClassificationJob,
  enqueueClassificationJob,
} from "./email-classification-queue"
import type { Application, ApplicationStatus, EmailLog } from "@/types"

export { classifyEmail, classifyEmailDetailed } from "./email-classifier"
export type { EmailClassification, ClassificationResult } from "./email-classifier"

const execAsync = promisify(exec)

export interface ScanResult {
  source: string
  scannedCount: number
  matchedCount: number
  queuedCount: number
  /** Messages the classifier judged to be unrelated to any application. */
  skippedCount: number
  newEmails: EmailLog[]
  errors: string[]
}

/**
 * The application status a freshly classified email implies.
 *
 * Returns null for classifications that say nothing about where the
 * application stands (a confirmation just means "received"), so callers can
 * leave the current status untouched.
 */
function statusForClassification(classification: EmailClassification): ApplicationStatus | null {
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
const STATUS_RANK: Record<string, number> = {
  wishlist: 0,
  applied: 1,
  interview_pending: 2,
  interviewing: 3,
  technical_assessment: 4,
  offer: 5,
  rejected: 6,
  archived: 7,
}

function shouldAdvanceStatus(current: string | undefined, next: ApplicationStatus): boolean {
  if (!current) return true
  if (next === "rejected") return current !== "rejected"
  if (current === "rejected" || current === "archived") return false
  return (STATUS_RANK[next] ?? 0) > (STATUS_RANK[current] ?? 0)
}

function isAtsSender(sender: string): boolean {
  const lower = (sender || "").toLowerCase()
  return CLASSIFIER_ATS_DOMAINS.some((domain) => lower.includes(domain)) || lower.includes("linkedin.com")
}


/**
 * gog sometimes hands back a pre-joined `body` string that is still raw HTML.
 * Stored as-is it leaks `<!DOCTYPE …>` into the snippet column and the UI, so
 * flatten it the same way the multipart walker flattens a text/html part.
 */
function htmlToText(input: string): string {
  return input
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function looksLikeHtmlBody(input: string): boolean {
  return /<!DOCTYPE|<html|<body|<table|<div|<span/i.test(input)
}

function normalizeBodyString(input: string): string {
  const text = input.replace(/\r\n/g, "\n")
  return looksLikeHtmlBody(text) ? htmlToText(text) : text
}

// Helper to extract clean text body from Gmail API payload with full recursive traversal
function extractBodyFromGmailPayload(parsed: any): string {
  if (!parsed) return ""

  if (typeof parsed.body === "string" && parsed.body.trim()) {
    return normalizeBodyString(parsed.body)
  }

  const root = parsed.message || parsed
  if (typeof root.body === "string" && root.body.trim()) {
    return normalizeBodyString(root.body)
  }

  let plainText = ""
  let htmlText = ""

  function walkParts(part: any) {
    if (!part) return

    if (part.mimeType === "text/plain" && part.body?.data) {
      try {
        const decoded = Buffer.from(part.body.data, "base64").toString("utf-8")
        if (decoded.trim()) {
          plainText += (plainText ? "\n" : "") + decoded.replace(/\r\n/g, "\n")
        }
      } catch {}
    } else if (part.mimeType === "text/html" && part.body?.data) {
      try {
        const decoded = Buffer.from(part.body.data, "base64").toString("utf-8")
        const stripped = decoded
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<br\s*[\/]?>/gi, "\n")
          .replace(/<\/p>/gi, "\n\n")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&#39;/g, "'")
          .replace(/&quot;/g, '"')
          .replace(/\s+/g, " ")
          .trim()
        if (stripped) {
          htmlText += (htmlText ? "\n" : "") + stripped
        }
      } catch {}
    }

    if (Array.isArray(part.parts)) {
      for (const sub of part.parts) {
        walkParts(sub)
      }
    }
  }

  if (root.payload) {
    walkParts(root.payload)
  }

  if (plainText.trim()) return plainText.trim()
  if (htmlText.trim()) return htmlText.trim()

  if (root.payload?.body?.data) {
    try {
      const decoded = Buffer.from(root.payload.body.data, "base64").toString("utf-8")
      if (decoded.trim()) return normalizeBodyString(decoded)
    } catch {}
  }

  return root.snippet || parsed.snippet || ""
}

const BLACKLISTED_COMPANY_NAMES = new Set([
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
  "owner name",
  "owner",
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

  // "Technical Interview | Owner Name | Full Stack Developer @ ..."
  if (subject.includes("|")) {
    const parts = subject.split("|").map(s => s.trim())
    for (const part of parts) {
      if (
        /engineer|developer|architect|lead|manager|analyst|designer/i.test(part) &&
        !/owner|name/i.test(part)
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

export async function scanEmails(): Promise<ScanResult> {
  const result: ScanResult = {
    source: "local-scanner",
    scannedCount: 0,
    matchedCount: 0,
    queuedCount: 0,
    skippedCount: 0,
    newEmails: [],
    errors: [],
  }

  try {
    // 1. Fetch all current applications to correlate
    const appsRes = await query<Application>(`SELECT id, company, title, contact_email, status FROM applications`)
    const applications = appsRes.rows

    // 2. Fetch email settings
    const settingsRes = await query<{
      imap_host: string
      imap_port: number
      imap_user: string
      imap_password?: string
      imap_tls: boolean
      gmail_account: string
    }>(`SELECT * FROM email_settings WHERE id = 'default'`)
    const settings = settingsRes.rows[0]

    // 3. Scan via gog CLI with wide search query covering interviews, follow-ups, rejections, offers
    let gogMessages: Array<{
      id: string
      subject?: string
      from?: string
      sender?: string
      snippet?: string
      date?: string
    }> = []

    const gogAccount = settings?.gmail_account || "owner@example.com"
    try {
      const searchQuery = `newer_than:90d (job OR interview OR "invited to" OR invitation OR screening OR "phone call" OR "next steps" OR "follow up" OR "follow-up" OR "touch base" OR "availability" OR application OR "thank you" OR "thanks for" OR "we got it" OR "your application" OR "update on your application" OR "status of your application" OR rejection OR unfortunately OR "not moving forward" OR "other candidates" OR "not selected" OR offer OR assessment OR challenge OR workablemail OR greenhouse OR ashbyhq OR lever OR smartrecruiters OR pinpoint.email)`

      const { stdout, stderr } = await execAsync(
        `gog gmail search '${searchQuery}' --json --account ${gogAccount} --max 200`
      )

      const trimmed = (stdout || "").trim()
      if (trimmed.startsWith("[")) {
        gogMessages = JSON.parse(trimmed)
      } else if (trimmed.startsWith("{")) {
        const parsed = JSON.parse(trimmed)
        gogMessages = parsed.messages || parsed.results || parsed.threads || []
      } else if (trimmed) {
        result.errors.push(`Gmail scan returned unexpected output: ${trimmed.slice(0, 200)}`)
      } else if (stderr && stderr.trim()) {
        result.errors.push(`Gmail scan: ${stderr.trim().slice(0, 300)}`)
      }
    } catch (err) {
      const raw = err instanceof Error
        ? `${err.message}${(err as { stderr?: string }).stderr ?? ""}`
        : String(err)

      if (/invalid_grant|expired or revoked|token/i.test(raw)) {
        result.errors.push(
          `Gmail access expired for ${gogAccount}. Re-authorize with: gog auth manage login`
        )
      } else if (/not found|command not found|ENOENT/i.test(raw)) {
        result.errors.push(`The 'gog' CLI is not available on PATH — Gmail scanning is disabled.`)
      } else {
        result.errors.push(`Gmail scan failed: ${raw.slice(0, 300)}`)
      }
    }

    // 3b. Hydrate message bodies via `gog gmail get` (using full format, no --results-only to avoid array truncation on calendar attachments)
    const bodies = new Map<string, string>()
    if (gogMessages.length > 0) {
      const CONCURRENCY = 6
      const queue = [...gogMessages]

      const worker = async () => {
        for (;;) {
          const msg = queue.shift()
          if (!msg?.id) return
          try {
            const { stdout } = await execAsync(
              `gog gmail get ${msg.id} --account ${gogAccount} --json --format full`,
              { maxBuffer: 8 * 1024 * 1024 }
            )
            const trimmed = (stdout || "").trim()
            if (!trimmed.startsWith("{")) continue
            const parsed = JSON.parse(trimmed)
            const bodyText = extractBodyFromGmailPayload(parsed)
            if (bodyText) {
              bodies.set(msg.id, bodyText.slice(0, 8000))
            }
          } catch {
            // Unreadable message shouldn't abort scan
          }
        }
      }

      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, gogMessages.length) }, worker)
      )
    }

    // 4. Deterministic decisions are applied immediately. Ambiguous messages
    // are persisted as pending and queued for the Supabase Edge Function.
    const maxQueued = Math.max(
      0,
      Number(process.env.EMAIL_CLASSIFIER_MAX_CALLS_PER_SCAN ?? MAX_QUEUED_CLASSIFICATIONS_PER_SCAN),
    )
    for (const msg of gogMessages) {
      result.scannedCount++
      const messageId = msg.id || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
      const sender = msg.from || msg.sender || ""
      const subject = msg.subject || ""
      const body = bodies.get(msg.id) || msg.snippet || ""
      const snippet = (body || msg.snippet || "").slice(0, 300)
      const verdict = await classifyEmailDetailed({ subject, body, sender })
      const classification = verdict.classification

      const extractedCompany = extractCompanyName(subject, sender, body)
      const extractedRole = extractJobTitle(subject, body)

      // Intelligent match to existing applications
      let matchedApp = findBestMatchingApplication(applications, {
        company: extractedCompany,
        role: extractedRole,
        sender,
        subject,
        body,
        snippet,
      })

      let matchedAppId = matchedApp ? matchedApp.id : null

      // Check if already in email_logs
      const existing = await query<EmailLog & { manual_override: boolean }>(
        `SELECT id, classification, application_id, manual_override, classification_state FROM email_logs WHERE message_id = $1`,
        [messageId]
      )

      if (verdict.source === "fallback" && result.queuedCount < maxQueued) {
        if (existing.rows.length > 0) {
          // At-least-once queue delivery plus the unique message id make
          // rescans idempotent. A pending or resolved row must not enqueue a
          // second paid inference request.
          continue
        }

        const emailLogId = randomUUID()
        const job = buildClassificationJob(
          { subject, body, sender },
          {
            emailLogId,
            messageId,
            applicationId: matchedAppId,
            sender,
            subject,
            company: extractedCompany,
            role: extractedRole,
            snippet,
          },
        )

        const pendingRes = await query<EmailLog>(
          `INSERT INTO email_logs (
             id, application_id, message_id, sender, recipient, subject, snippet, body,
             classification, classification_state, classification_source,
             classifier_prompt_hash, classifier_prompt_tokens, received_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', 'queue', $10, $11, NOW())
           RETURNING *`,
          [
            emailLogId,
            matchedAppId,
            messageId,
            sender,
            settings?.gmail_account || "",
            subject,
            snippet,
            body,
            classification,
            job.promptHash,
            job.estimatedInputTokens,
          ],
        )

        try {
          await enqueueClassificationJob(job)
          result.queuedCount++
          result.newEmails.push(pendingRes.rows[0])
          continue
        } catch (error) {
          // Remove the just-created pending row so the conservative fallback
          // below can complete normally instead of leaving a stuck job.
          await query(`DELETE FROM email_logs WHERE id = $1 AND classification_state = 'pending'`, [emailLogId])
          result.errors.push(
            `Could not enqueue ${messageId}; used deterministic fallback: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }

      if (classification === "unrelated" || classification === "conference") {
        result.skippedCount++
        if (existing.rows.length === 0) {
          const logRes = await query<EmailLog>(
            `INSERT INTO email_logs (application_id, message_id, sender, recipient, subject, snippet, body, classification, classification_state, classification_source, received_at)
             VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, 'resolved', $8, NOW())
             RETURNING *`,
            [messageId, sender, settings?.gmail_account || "", subject, snippet, body, classification, verdict.source]
          )
          result.newEmails.push(logRes.rows[0])
        } else {
          const existingRow = existing.rows[0]
          if (!existingRow.manual_override && (existingRow.classification !== classification || existingRow.application_id !== null)) {
            await query(
              `UPDATE email_logs SET classification = $1, application_id = NULL, classification_state = 'resolved', classification_source = $2 WHERE id = $3`,
              [classification, verdict.source, existingRow.id]
            )
          }
        }
        continue
      }

      if (existing.rows.length === 0) {
        // Auto-create an application ONLY when we have a valid, non-blacklisted company name
        const canCreateApp = extractedCompany !== "Unknown Company" && !BLACKLISTED_COMPANY_NAMES.has(extractedCompany.toLowerCase())

        if (!matchedAppId && canCreateApp) {
          const initStatus = statusForClassification(classification) ?? "applied"

          const newAppRes = await query<Application>(
            `INSERT INTO applications (title, company, workplace_type, status, application_method, contact_email, notes, priority, source, applied_at, created_at, updated_at)
             VALUES ($1, $2, 'remote', $3, 'email', $4, $5, 'medium', 'email_scanner', NOW(), NOW(), NOW())
             RETURNING *`,
            [extractedRole, extractedCompany, initStatus, isAtsSender(sender) ? "" : sender, `Auto-detected from email: "${subject}"`]
          )
          const newApp = newAppRes.rows[0]
          matchedApp = newApp
          matchedAppId = newApp.id
          applications.push(newApp)

          await query(
            `INSERT INTO application_events (application_id, event_type, title, description)
             VALUES ($1, 'email_created', 'Application Auto-Detected', $2)`,
            [matchedAppId, `Created application for ${extractedRole} at ${extractedCompany} from email: "${subject}"`]
          )
        }

        const logRes = await query<EmailLog>(
          `INSERT INTO email_logs (application_id, message_id, sender, recipient, subject, snippet, body, classification, received_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
           RETURNING *`,
          [matchedAppId, messageId, sender, settings?.gmail_account || "", subject, snippet, body, classification]
        )

        const logged = logRes.rows[0]
        result.newEmails.push(logged)

        if (matchedAppId) {
          result.matchedCount++

          // A "question" is the one case that depends on where the application
          // already stands: being asked for details while merely "applied"
          // means somebody is actually looking at it.
          const newStatus =
            classification === "question"
              ? matchedApp?.status === "applied"
                ? ("interview_pending" as ApplicationStatus)
                : null
              : statusForClassification(classification)

          if (newStatus && shouldAdvanceStatus(matchedApp?.status, newStatus)) {
            await query(`UPDATE applications SET status = $1, updated_at = NOW() WHERE id = $2`, [newStatus, matchedAppId])
            if (matchedApp) matchedApp.status = newStatus
          }

          // Add event to application timeline
          await query(
            `INSERT INTO application_events (application_id, event_type, title, description, metadata)
             VALUES ($1, 'email_received', $2, $3, $4)`,
            [
              matchedAppId,
              `Email received: ${classification.toUpperCase()}`,
              `Subject: "${subject}" from ${sender}`,
              JSON.stringify({ messageId, classification, snippet }),
            ]
          )
        }
      } else {
        // Already logged: re-run the classifier over it, but never overwrite a
        // human correction — that is the whole point of manual_override.
        const existingRow = existing.rows[0]
        const locked = existingRow.manual_override === true
        const effectiveClass = locked ? existingRow.classification : classification

        const needUpdateClass = !locked && existingRow.classification !== classification
        const needUpdateApp = !existingRow.application_id && !!matchedAppId

        if (needUpdateClass || needUpdateApp) {
          const finalAppId = matchedAppId || existingRow.application_id
          await query(
            `UPDATE email_logs SET classification = $1, application_id = $2, body = COALESCE(NULLIF($3, ''), body) WHERE id = $4`,
            [effectiveClass, finalAppId, body, existingRow.id]
          )

          if (finalAppId) {
            const app = applications.find((a) => a.id === finalAppId)
            const newStatus = statusForClassification(effectiveClass as EmailClassification)
            if (newStatus && shouldAdvanceStatus(app?.status, newStatus)) {
              await query(`UPDATE applications SET status = $1, updated_at = NOW() WHERE id = $2`, [newStatus, finalAppId])
              if (app) app.status = newStatus
            }
          }
        }
      }
    }

    // Update last_synced_at
    await query(`UPDATE email_settings SET last_synced_at = NOW() WHERE id = 'default'`)
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err))
  }

  return result
}
