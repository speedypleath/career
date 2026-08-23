import { exec } from "child_process"
import { promisify } from "util"
import { query } from "./db"
import type { Application, EmailLog } from "@/types"

const execAsync = promisify(exec)

export interface ScanResult {
  source: string
  scannedCount: number
  matchedCount: number
  newEmails: EmailLog[]
  errors: string[]
}

// Classifier function
export function classifyEmail(subject: string, body: string): "confirmation" | "interview" | "rejection" | "question" | "offer" | "unrelated" {
  const text = `${subject} ${body}`.toLowerCase()

  // High priority: Offer
  if (
    text.includes("offer of employment") ||
    text.includes("formal offer") ||
    text.includes("job offer") ||
    text.includes("pleased to offer you the position") ||
    text.includes("we would like to offer you")
  ) {
    return "offer"
  }

  // Interview
  if (
    text.includes("invitation to interview") ||
    text.includes("schedule an interview") ||
    text.includes("invite you for an interview") ||
    text.includes("technical interview") ||
    text.includes("coding interview") ||
    text.includes("next steps in the interview") ||
    text.includes("schedule a call") ||
    text.includes("phone screen") ||
    text.includes("video call") ||
    text.includes("meet the team") ||
    text.includes("calendly.com")
  ) {
    return "interview"
  }

  // Rejection
  if (
    text.includes("regret to inform") ||
    text.includes("unfortunately") ||
    text.includes("not moving forward") ||
    text.includes("decided to proceed with other candidates") ||
    text.includes("other candidates whose qualifications") ||
    text.includes("will not be moving forward") ||
    text.includes("position has been filled") ||
    text.includes("thank you for your interest, however")
  ) {
    return "rejection"
  }

  // Questions / Take home
  if (
    text.includes("take-home") ||
    text.includes("coding challenge") ||
    text.includes("assessment") ||
    text.includes("hackerrank") ||
    text.includes("codesignal") ||
    text.includes("additional information needed")
  ) {
    return "question"
  }

  // Confirmation
  if (
    text.includes("thank you for applying") ||
    text.includes("application received") ||
    text.includes("we received your application") ||
    text.includes("confirmation of your application") ||
    text.includes("acknowledgment of application") ||
    text.includes("we have received your resume")
  ) {
    return "confirmation"
  }

  return "unrelated"
}

export async function scanEmails(): Promise<ScanResult> {
  const result: ScanResult = {
    source: "local-scanner",
    scannedCount: 0,
    matchedCount: 0,
    newEmails: [],
    errors: [],
  }

  try {
    // 1. Fetch all current applications to know companies & titles to correlate
    const appsRes = await query<Application>(`SELECT id, company, title, contact_email FROM applications`)
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

    // 3. Try scanning via gog CLI if available
    // gog's search output uses `from` (not `sender`) and carries no body at all,
    // so the body is fetched per-message below via `gog gmail get`.
    let gogMessages: Array<{
      id: string
      subject?: string
      from?: string
      sender?: string
      snippet?: string
      date?: string
    }> = []
    
    const gogAccount = settings?.gmail_account || "gheorgheandrei13@gmail.com"
    try {
      const { stdout, stderr } = await execAsync(
        `gog gmail search "newer_than:14d (job OR interview OR application OR 'thank you' OR rejection OR offer)" --json --results-only --account ${gogAccount} --max 25`
      )

      const trimmed = (stdout || "").trim()
      if (trimmed.startsWith("[")) {
        gogMessages = JSON.parse(trimmed)
      } else if (trimmed.startsWith("{")) {
        // Some gog versions wrap results in an object
        const parsed = JSON.parse(trimmed)
        gogMessages = parsed.messages || parsed.results || parsed.threads || []
      } else if (trimmed) {
        result.errors.push(`Gmail scan returned unexpected output: ${trimmed.slice(0, 200)}`)
      } else if (stderr && stderr.trim()) {
        result.errors.push(`Gmail scan: ${stderr.trim().slice(0, 300)}`)
      }
    } catch (err) {
      // Surface the failure instead of silently reporting "0 new emails".
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

    // 3b. Hydrate message bodies. `gog gmail search` returns only id/subject/from/date,
    // so classifying on the subject alone marks nearly everything "unrelated".
    // Fetch each body with `gog gmail get`, with bounded concurrency.
    const bodies = new Map<string, string>()
    if (gogMessages.length > 0) {
      const CONCURRENCY = 5
      const queue = [...gogMessages]

      const worker = async () => {
        for (;;) {
          const msg = queue.shift()
          if (!msg?.id) return
          try {
            const { stdout } = await execAsync(
              `gog gmail get ${msg.id} --account ${gogAccount} --json --results-only`,
              { maxBuffer: 4 * 1024 * 1024 }
            )
            const trimmed = (stdout || "").trim()
            if (!trimmed.startsWith("{")) continue
            const parsed = JSON.parse(trimmed) as { body?: string }
            if (typeof parsed.body === "string") {
              // Strip the quoted-printable line breaks and cap the size we classify on.
              bodies.set(msg.id, parsed.body.replace(/\r\n/g, "\n").slice(0, 8000))
            }
          } catch {
            // A single unreadable message must not abort the whole scan.
          }
        }
      }

      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, gogMessages.length) }, worker)
      )

      if (bodies.size === 0) {
        result.errors.push(
          `Fetched ${gogMessages.length} message headers but could not read any bodies — classification will be unreliable.`
        )
      }
    }

    // 4. Process discovered messages
    for (const msg of gogMessages) {
      result.scannedCount++
      const messageId = msg.id || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
      const sender = msg.from || msg.sender || ""
      const subject = msg.subject || ""
      const body = bodies.get(msg.id) || msg.snippet || ""
      const snippet = body.slice(0, 300)
      const classification = classifyEmail(subject, body)

      if (classification === "unrelated") continue

      // Match application
      let matchedAppId: string | null = null
      for (const app of applications) {
        const compLower = app.company.toLowerCase()
        const senderLower = sender.toLowerCase()
        const subjectLower = subject.toLowerCase()
        const bodyLower = snippet.toLowerCase()

        if (
          compLower.length > 2 && (
            senderLower.includes(compLower) ||
            subjectLower.includes(compLower) ||
            bodyLower.includes(compLower) ||
            (app.contact_email && senderLower.includes(app.contact_email.toLowerCase()))
          )
        ) {
          matchedAppId = app.id
          break
        }
      }

      // Check if already in email_logs
      const existing = await query(`SELECT id FROM email_logs WHERE message_id = $1`, [messageId])
      if (existing.rows.length === 0) {
        // If not matched to existing app, auto-create app if confirmation/interview email
        if (!matchedAppId && (classification === "confirmation" || classification === "interview" || classification === "offer")) {
          // Extract probable company name from subject or sender
          let companyName = "Unknown Company"
          if (subject.includes(" at ")) {
            companyName = subject.split(" at ")[1].split(/[-–|!\.]/)[0].trim()
          } else if (subject.includes(" - ")) {
            companyName = subject.split(" - ")[0].trim()
          } else if (sender.includes("<")) {
            const domain = sender.split("@")[1]?.split(">")[0]
            if (domain) companyName = domain.split(".")[0].toUpperCase()
          }

          let jobTitle = "Software Engineer"
          if (subject.includes("for ")) {
            const extracted = subject.split("for ")[1].split(/ at | - |!|\./)[0].trim()
            if (extracted.length > 3 && extracted.length < 50) jobTitle = extracted
          }

          const newAppRes = await query<Application>(
            `INSERT INTO applications (title, company, workplace_type, status, application_method, contact_email, notes, priority, source, applied_at, created_at, updated_at)
             VALUES ($1, $2, 'remote', 'applied', 'email', $3, $4, 'medium', 'email_scanner', NOW(), NOW(), NOW())
             RETURNING *`,
            [jobTitle, companyName, sender, `Auto-detected from email: "${subject}"`]
          )
          const newApp = newAppRes.rows[0]
          matchedAppId = newApp.id
          applications.push(newApp)

          await query(
            `INSERT INTO application_events (application_id, event_type, title, description)
             VALUES ($1, 'email_created', 'Application Auto-Detected', $2)`,
            [matchedAppId, `Created application from email: "${subject}"`]
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
          // Update application status if it's an interview or rejection or offer
          let newStatus: string | null = null
          if (classification === "interview") newStatus = "interviewing"
          else if (classification === "offer") newStatus = "offer"
          else if (classification === "rejection") newStatus = "rejected"

          if (newStatus) {
            await query(`UPDATE applications SET status = $1, updated_at = NOW() WHERE id = $2`, [newStatus, matchedAppId])
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
      }
    }

    // Update last_synced_at
    await query(`UPDATE email_settings SET last_synced_at = NOW() WHERE id = 'default'`)

  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err))
  }

  return result
}
