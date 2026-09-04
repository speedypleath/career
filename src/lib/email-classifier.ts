/** Minimal-token email classifier: deterministic exits -> queued tiny LLM -> safe fallback. */
import {
  MAX_MODEL_OUTPUT_TOKENS,
  SYSTEM_PROMPT,
} from "../../supabase/functions/_shared/cloudflare-classifier.ts"

export type EmailClassification = "confirmation" | "interview" | "assessment" | "question" | "rejection" | "offer" | "unrelated"
export type ClassifierSource = "gate" | "rule" | "fallback" | "queue" | "cloudflare" | "cache"

export interface ClassificationSignal { category: EmailClassification; label: string; weight: number; evidence: string }
export interface ClassificationResult {
  classification: EmailClassification
  confidence: number
  signals: ClassificationSignal[]
  reasons: string[]
  scores: Record<string, number>
  source: ClassifierSource
  modelUsed: boolean
  estimatedInputTokens: number
}
export interface ClassifyInput { subject: string; body: string; sender?: string }
export interface NormalizedEmail { subject: string; body: string; text: string; links: string[]; processSectionAt: number }
export interface SenderInfo {
  raw: string; displayName: string; email: string; domain: string
  isAts: boolean; isNoiseSender: boolean; isNoReply: boolean; isPersonal: boolean
}

export const MAX_MODEL_INPUT_TOKENS = 1_100
export const MODEL_INPUT_LIMITS = Object.freeze({ sender: 160, subject: 320, body: 3_700 })
export { MAX_MODEL_OUTPUT_TOKENS, SYSTEM_PROMPT }
export const ATS_DOMAINS = [
  "greenhouse-mail.io", "workablemail.com", "ashbyhq.com", "lever.co", "smartrecruiters.com",
  "bamboohr.com", "rippling.com", "pinpoint.email", "teamtailor-mail.com", "recruitee.com",
  "personio.de", "jobvite.com", "icims.com", "myworkday.com", "successfactors.com", "avature.net",
  "taleo.net", "breezy.hr", "join.com", "zohorecruit.com",
]

const LABELS: EmailClassification[] = ["unrelated", "confirmation", "interview", "assessment", "question", "rejection", "offer"]
const NOISE_SENDER = /(?:newsletter|digest|marketing|promo|jobalert)|glassdoor\.com|indeed(?:mail)?\.com|ziprecruiter\.com|substack\.com|mailchimp/i
const NOISE_SHAPE = /\b(?:unsubscribe|weekly digest|job alert|recommended jobs|community update|view in browser)\b/i
const NON_JOB = /\b(?:conference|paper|poster|grant|scholarship|visa|membership) application\b/i
const JOB_CONTEXT = /\b(?:job|role|position|candidate|recruit(?:er|ing|ment)?|hiring|application|interview|assessment|resume|cv)\b/i
const STRONG_RULES: Array<{ category: EmailClassification; label: string; re: RegExp }> = [
  { category: "rejection", label: "explicit-rejection", re: /\b(?:not moving forward|will not be moving forward|decided not to proceed|not selected|pursue other candidates|chose someone else|selected another candidate|unable to offer you|regret to inform)\b/i },
  { category: "offer", label: "explicit-offer", re: /\b(?:pleased to (?:extend|make) (?:you )?an offer|offer you the (?:role|position)|formal offer|offer letter)\b/i },
  { category: "interview", label: "explicit-interview", re: /\b(?:invite you (?:to|for) (?:an? )?interview|schedule (?:an? |your )?(?:interview|screening call)|book (?:a|your) (?:time|interview)|calendar invitation)\b/i },
  { category: "assessment", label: "explicit-assessment", re: /\b(?:please (?:complete|take|submit) (?:the|this|a) (?:assessment|test|challenge|take-home)|coding (?:assessment|challenge)|technical assessment)\b/i },
  { category: "confirmation", label: "explicit-confirmation", re: /\b(?:we (?:have )?received your application|application (?:has been )?(?:received|submitted)|thank you for (?:your interest|applying)|thanks for applying)\b/i },
]
const WEAK_RULES: Array<{ category: EmailClassification; re: RegExp }> = [
  { category: "rejection", re: /\b(?:unfortunately|other candidates|not successful)\b/i },
  { category: "offer", re: /\b(?:compensation|start date|salary|offer)\b/i },
  { category: "interview", re: /\b(?:availability|meet with|interview|screening call|calendar)\b/i },
  { category: "assessment", re: /\b(?:assessment|take-home|coding test|challenge)\b/i },
  { category: "question", re: /\b(?:could you|can you|please (?:provide|confirm|share)|what is your|when are you)\b/i },
  { category: "confirmation", re: /\b(?:application|applied|candidate)\b/i },
]

function stripHtml(value: string): string {
  return value.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ")
}
function decodeEntities(value: string): string {
  return value.replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;|&#34;/gi, '"').replace(/&#39;|&apos;/gi, "'")
}
export function normalizeEmail(subject: string, body: string): NormalizedEmail {
  const links = [...(body || "").matchAll(/https?:\/\/[^\s<>\")\]]+/gi)].map((match) => match[0].toLowerCase())
  const cleanSubject = decodeEntities(subject || "").replace(/\s+/g, " ").trim()
  const cleanBody = decodeEntities(stripHtml(body || ""))
    .replace(/^>.*$/gm, " ").replace(/https?:\/\/[^\s<>\")\]]+/gi, " LINK ")
    .replace(/\b(?:unsubscribe|manage preferences|privacy policy)\b[\s\S]*$/i, " ").replace(/\s+/g, " ").trim()
  const processSectionAt = cleanBody.search(/\b(?:what happens next|our hiring process|next steps include)\b/i)
  return { subject: cleanSubject, body: cleanBody, text: `${cleanSubject}\n${cleanBody}`, links, processSectionAt }
}
export function parseSender(raw: string): SenderInfo {
  const match = (raw || "").match(/^(.*?)\s*<?([\w.+-]+@[\w.-]+)>?$/)
  const email = (match?.[2] || (raw.includes("@") ? raw : "")).toLowerCase().trim()
  const domain = email.split("@")[1] || ""
  const isNoReply = /(?:no-?reply|donotreply|notifications?)@/i.test(email)
  return {
    raw, displayName: (match?.[1] || "").replace(/^['"]|['"]$/g, "").trim(), email, domain,
    isAts: ATS_DOMAINS.some((candidate) => domain === candidate || domain.endsWith(`.${candidate}`)),
    isNoiseSender: NOISE_SENDER.test(email), isNoReply, isPersonal: Boolean(email) && !isNoReply,
  }
}
function emptyScores(): Record<string, number> { return Object.fromEntries(LABELS.map((label) => [label, 0])) }
function makeResult(classification: EmailClassification, confidence: number, source: ClassifierSource, reason: string, signal?: ClassificationSignal, estimatedInputTokens = 0): ClassificationResult {
  const scores = emptyScores(); scores[classification] = Math.round(confidence * 10)
  return { classification, confidence, source, modelUsed: source === "cloudflare" || source === "cache", estimatedInputTokens, signals: signal ? [signal] : [], reasons: [reason], scores }
}
function compact(value: string, limit: number): string {
  if (value.length <= limit) return value
  const head = Math.ceil(limit * 0.7)
  return `${value.slice(0, head)} … ${value.slice(-(limit - head - 3))}`
}
export function buildModelPrompt(input: ClassifyInput): string {
  const norm = normalizeEmail(input.subject, input.body)
  return `F:${compact(input.sender || "", MODEL_INPUT_LIMITS.sender)}\nS:${compact(norm.subject, MODEL_INPUT_LIMITS.subject)}\nB:${compact(norm.body, MODEL_INPUT_LIMITS.body)}`
}
export function estimateTokens(text: string): number { return Math.ceil(text.length / 4) }
function deterministicExit(norm: NormalizedEmail, sender: SenderInfo): ClassificationResult | null {
  const personalContext = JOB_CONTEXT.test(norm.text)
  if (norm.links.some((link) => /jobs_application_rejected/i.test(link))) return makeResult("rejection", 0.99, "rule", "LinkedIn rejection tracking tag")
  if ((sender.isNoiseSender || NOISE_SHAPE.test(norm.text)) && !personalContext) return makeResult("unrelated", 0.97, "gate", "bulk sender or newsletter shape")
  if (NON_JOB.test(norm.text) && !sender.isAts) return makeResult("unrelated", 0.94, "gate", "non-job application")
  if (!personalContext && !sender.isAts) return makeResult("unrelated", 0.92, "gate", "no job-search context")
  for (const rule of STRONG_RULES) {
    const match = norm.text.match(rule.re)
    if (!match) continue
    if (rule.category === "interview" && norm.processSectionAt >= 0 && (match.index || 0) > norm.subject.length + norm.processSectionAt) continue
    const signal = { category: rule.category, label: rule.label, weight: 9, evidence: match[0].slice(0, 100) }
    return makeResult(rule.category, 0.96, "rule", rule.label, signal)
  }
  return null
}
function conservativeFallback(norm: NormalizedEmail): ClassificationResult {
  for (const weak of WEAK_RULES) {
    const match = norm.text.match(weak.re)
    if (match) return makeResult(weak.category, 0.58, "fallback", "model unavailable; weak deterministic signal", { category: weak.category, label: "weak-fallback", weight: 3, evidence: match[0].slice(0, 100) })
  }
  return makeResult("unrelated", 0.72, "fallback", "model unavailable; no reliable signal")
}
export async function classifyEmailDetailed(input: ClassifyInput): Promise<ClassificationResult> {
  const norm = normalizeEmail(input.subject, input.body)
  const fast = deterministicExit(norm, parseSender(input.sender || ""))
  if (fast) return fast
  const prompt = buildModelPrompt(input)
  const estimatedInputTokens = estimateTokens(`${SYSTEM_PROMPT}\n${prompt}`)
  return { ...conservativeFallback(norm), estimatedInputTokens }
}
export async function classifyEmail(subject: string, body: string, sender = ""): Promise<EmailClassification> {
  return (await classifyEmailDetailed({ subject, body, sender })).classification
}
