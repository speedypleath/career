/**
 * gog sometimes hands back a pre-joined `body` string that is still raw HTML.
 * Stored as-is it leaks `<!DOCTYPE …>` into the snippet column and the UI, so
 * flatten it the same way the multipart walker flattens a text/html part.
 */
export function htmlToText(input: string): string {
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

export function looksLikeHtmlBody(input: string): boolean {
  return /<!DOCTYPE|<html|<body|<table|<div|<span/i.test(input)
}

export function normalizeBodyString(input: string): string {
  const text = input.replace(/\r\n/g, "\n")
  return looksLikeHtmlBody(text) ? htmlToText(text) : text
}

/** A MIME part as `gog gmail get --format full` reports it. */
interface GmailPart {
  mimeType?: string
  body?: { data?: string; attachmentId?: string }
  parts?: GmailPart[]
}

/**
 * The envelope gog returns. `body` is sometimes a pre-joined string rather
 * than a part, and the whole message is sometimes nested under `message`.
 */
interface GmailEnvelope {
  body?: string
  snippet?: string
  payload?: GmailPart
  message?: GmailEnvelope
}

// Helper to extract clean text body from Gmail API payload with full recursive traversal
export function extractBodyFromGmailPayload(parsed: GmailEnvelope | null | undefined): string {
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

  function walkParts(part: GmailPart | undefined) {
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
