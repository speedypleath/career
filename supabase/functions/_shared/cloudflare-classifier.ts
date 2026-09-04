export const CLOUDFLARE_MODEL = "@cf/meta/llama-3.2-1b-instruct"
export const MAX_MODEL_OUTPUT_TOKENS = 16
export const SYSTEM_PROMPT =
  "Classify the email for a career job tracker. Reply with exactly one digit (0-7): " +
  "0=unrelated (news, spam, newsletters, digests, job alerts/recommendations, OTPs/passcodes, marketing), " +
  "1=confirmation (acknowledgement of receipt of an application submitted by candidate), " +
  "2=interview (invitation to an interview or screening call), " +
  "3=assessment (coding test or take-home assignment to complete), " +
  "4=question (recruiter asking candidate clarifying questions), " +
  "5=rejection (formal notice that application was not selected or moving forward), " +
  "6=offer (formal job offer letter or contract), " +
  "7=conference (tech conference, summit, meetup, webinar, call for papers/speakers/volunteers, event ticket). " +
  "Reply with only the digit."

export const CLASSIFICATION_LABELS = [
  "unrelated",
  "confirmation",
  "interview",
  "assessment",
  "question",
  "rejection",
  "offer",
  "conference",
] as const

export type CloudflareClassification = (typeof CLASSIFICATION_LABELS)[number]

export interface CloudflareCredentials {
  accountId: string
  apiToken: string
}

interface CloudflareResponse {
  success?: boolean
  errors?: Array<{ message?: string }>
  result?: {
    response?: string
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
  }
}

export function parseClassification(raw: string): CloudflareClassification | null {
  // The 1B instruct model is chatty and may wrap the answer in prose
  // ("Here is the answer: 2"). Prefer a standalone 0-7 digit, then a bare
  // label word, then any lone digit as a last resort.
  const text = raw.trim()
  const standalone = text.match(/(?<![0-9])[0-7](?![0-9])/)
  if (standalone) return CLASSIFICATION_LABELS[Number(standalone[0])]
  const lower = text.toLowerCase()
  for (const label of CLASSIFICATION_LABELS) {
    if (new RegExp(`\\b${label}\\b`).test(lower)) return label
  }
  const digit = text.match(/[0-7]/)?.[0]
  return digit === undefined ? null : CLASSIFICATION_LABELS[Number(digit)]
}

export function buildCloudflareRequest(prompt: string) {
  return {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    temperature: 0,
    max_tokens: MAX_MODEL_OUTPUT_TOKENS,
    stream: false,
  }
}

export async function classifyWithCloudflare(
  prompt: string,
  credentials: CloudflareCredentials,
  fetcher: typeof fetch = fetch,
): Promise<{
  classification: CloudflareClassification
  promptTokens: number | null
  completionTokens: number | null
}> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12_000)

  try {
    const response = await fetcher(
      `https://api.cloudflare.com/client/v4/accounts/${credentials.accountId}/ai/run/${CLOUDFLARE_MODEL}`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${credentials.apiToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(buildCloudflareRequest(prompt)),
      },
    )

    const payload = (await response.json()) as CloudflareResponse
    if (!response.ok || payload.success === false) {
      const errDetail = payload.errors?.map(e => e.message).filter(Boolean).join("; ") || ""
      throw new Error(`Cloudflare Workers AI HTTP ${response.status}: ${errDetail || payload.errors?.[0]?.message || "Request failed"}`)
    }

    const rawResp = payload.result?.response || ""
    const classification = parseClassification(rawResp)
    if (!classification) throw new Error(`Cloudflare Workers AI returned invalid classification: ${JSON.stringify(rawResp)}`)

    return {
      classification,
      promptTokens: payload.result?.usage?.prompt_tokens ?? null,
      completionTokens: payload.result?.usage?.completion_tokens ?? null,
    }
  } finally {
    clearTimeout(timeout)
  }
}
