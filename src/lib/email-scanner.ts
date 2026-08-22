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
    let gogMessages: Array<{ id: string; subject: string; sender: string; snippet: string; date: string }> = []
    
    try {
      const gogAccount = settings?.gmail_account || "owner@example.com"
      const { stdout } = await execAsync(
        `gog gmail messages search "newer_than:7d (job OR interview OR application OR 'thank you' OR rejection OR offer)" --max 25 --account ${gogAccount} --format json 2>/dev/null || gog gmail search "newer_than:7d" --max 20 --account ${gogAccount} 2>/dev/null || true`
      )
      
      if (stdout && stdout.trim().startsWith("[")) {
        gogMessages = JSON.parse(stdout)
      }
    } catch {
      // gog might require reauth or not output json, continue with fallback
    }

    // 4. Also check for local simulation / test ingest or recent email files
    // Let's process any discovered messages or mock/simulated incoming signals
    for (const msg of gogMessages) {
      result.scannedCount++
      const messageId = msg.id || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
      const sender = msg.sender || ""
      const subject = msg.subject || ""
      const snippet = msg.snippet || ""
      const classification = classifyEmail(subject, snippet)

      if (classification === "unrelated") continue

      // Match application
      let matchedAppId: string | null = null
      for (const app of applications) {
        const compLower = app.company.toLowerCase()
        const senderLower = sender.toLowerCase()
        const subjectLower = subject.toLowerCase()
        const bodyLower = snippet.toLowerCase()

        if (
          senderLower.includes(compLower) ||
          subjectLower.includes(compLower) ||
          bodyLower.includes(compLower) ||
          (app.contact_email && senderLower.includes(app.contact_email.toLowerCase()))
        ) {
          matchedAppId = app.id
          break
        }
      }

      // Check if already in email_logs
      const existing = await query(`SELECT id FROM email_logs WHERE message_id = $1`, [messageId])
      if (existing.rows.length === 0) {
        const logRes = await query<EmailLog>(
          `INSERT INTO email_logs (application_id, message_id, sender, recipient, subject, snippet, body, classification, received_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
           RETURNING *`,
          [matchedAppId, messageId, sender, settings?.gmail_account || "", subject, snippet, snippet, classification]
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
