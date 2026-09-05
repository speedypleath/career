import { exec } from "child_process"
import { promisify } from "util"
import { extractBodyFromGmailPayload } from "./mime.ts"

const execAsync = promisify(exec)

/**
 * The shape of the shell-out, injectable so the transport can be tested
 * without a `gog` binary or a Google account.
 */
export type ExecFn = (
  command: string,
  options?: { maxBuffer?: number },
) => Promise<{ stdout: string; stderr: string }>

const defaultExec: ExecFn = (command, options) =>
  execAsync(command, options) as Promise<{ stdout: string; stderr: string }>

export interface GogMessage {
  id: string
  subject?: string
  from?: string
  sender?: string
  snippet?: string
  date?: string
}

/** Wide query covering interviews, follow-ups, rejections and offers. */
export const GMAIL_SEARCH_QUERY = `newer_than:90d (job OR interview OR "invited to" OR invitation OR screening OR "phone call" OR "next steps" OR "follow up" OR "follow-up" OR "touch base" OR "availability" OR application OR "thank you" OR "thanks for" OR "we got it" OR "your application" OR "update on your application" OR "status of your application" OR rejection OR unfortunately OR "not moving forward" OR "other candidates" OR "not selected" OR offer OR assessment OR challenge OR workablemail OR greenhouse OR ashbyhq OR lever OR smartrecruiters OR pinpoint.email)`

export const MAX_SEARCH_RESULTS = 200
export const BODY_HYDRATION_CONCURRENCY = 6
/** email_logs.body is capped at this many characters. */
export const MAX_BODY_CHARS = 8000

/**
 * Search Gmail through the `gog` CLI.
 *
 * Never throws. A failure comes back in `errors`, because the caller has to be
 * able to tell "the mailbox is empty" (no messages, no errors) apart from
 * "we were blocked" (no messages, errors present) — the UI shows those
 * differently, and a thrown error would collapse the distinction.
 */
export async function searchMessages(
  account: string,
  run: ExecFn = defaultExec,
): Promise<{ messages: GogMessage[]; errors: string[] }> {
  const messages: GogMessage[] = []
  const errors: string[] = []

  try {
    const { stdout, stderr } = await run(
      `gog gmail search '${GMAIL_SEARCH_QUERY}' --json --account ${account} --max ${MAX_SEARCH_RESULTS}`,
    )

    const trimmed = (stdout || "").trim()
    if (trimmed.startsWith("[")) {
      messages.push(...JSON.parse(trimmed))
    } else if (trimmed.startsWith("{")) {
      const parsed = JSON.parse(trimmed)
      messages.push(...(parsed.messages || parsed.results || parsed.threads || []))
    } else if (trimmed) {
      errors.push(`Gmail scan returned unexpected output: ${trimmed.slice(0, 200)}`)
    } else if (stderr && stderr.trim()) {
      errors.push(`Gmail scan: ${stderr.trim().slice(0, 300)}`)
    }
  } catch (err) {
    const raw = err instanceof Error
      ? `${err.message}${(err as { stderr?: string }).stderr ?? ""}`
      : String(err)

    if (/invalid_grant|expired or revoked|token/i.test(raw)) {
      errors.push(
        `Gmail access expired for ${account}. Re-authorize with: gog auth add ${account}`
      )
    } else if (/not found|command not found|ENOENT/i.test(raw)) {
      errors.push(`The 'gog' CLI is not available on PATH — Gmail scanning is disabled.`)
    } else {
      errors.push(`Gmail scan failed: ${raw.slice(0, 300)}`)
    }
  }

  return { messages, errors }
}

/**
 * Fetch full message bodies for the given ids.
 *
 * Uses `--format full` rather than `--results-only`, which truncates the parts
 * array on messages carrying calendar attachments. An individual message that
 * cannot be read is skipped rather than aborting the scan.
 */
export async function hydrateBodies(
  messages: GogMessage[],
  account: string,
  run: ExecFn = defaultExec,
): Promise<Map<string, string>> {
  const bodies = new Map<string, string>()
  if (messages.length === 0) return bodies

  const queue = [...messages]

  const worker = async () => {
    for (;;) {
      const msg = queue.shift()
      if (!msg?.id) return
      try {
        const { stdout } = await run(
          `gog gmail get ${msg.id} --account ${account} --json --format full`,
          { maxBuffer: 8 * 1024 * 1024 }
        )
        const trimmed = (stdout || "").trim()
        if (!trimmed.startsWith("{")) continue
        const parsed = JSON.parse(trimmed)
        const bodyText = extractBodyFromGmailPayload(parsed)
        if (bodyText) {
          bodies.set(msg.id, bodyText.slice(0, MAX_BODY_CHARS))
        }
      } catch {
        // Unreadable message shouldn't abort scan
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(BODY_HYDRATION_CONCURRENCY, messages.length) }, worker)
  )

  return bodies
}
