/** Minimal-token email classifier: deterministic exits -> queued tiny LLM -> safe fallback. */
import {
  MAX_MODEL_OUTPUT_TOKENS,
  SYSTEM_PROMPT,
} from "../../supabase/functions/_shared/cloudflare-classifier.ts"

export type EmailClassification = "confirmation" | "interview" | "assessment" | "question" | "rejection" | "offer" | "unrelated" | "conference"
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

export const MAX_MODEL_INPUT_TOKENS = 1_500
export const MODEL_INPUT_LIMITS = Object.freeze({ sender: 160, subject: 320, body: 3_700 })
export { MAX_MODEL_OUTPUT_TOKENS, SYSTEM_PROMPT }
export const ATS_DOMAINS = [
  "greenhouse-mail.io", "workablemail.com", "ashbyhq.com", "lever.co", "smartrecruiters.com",
  "bamboohr.com", "rippling.com", "pinpoint.email", "teamtailor-mail.com", "recruitee.com",
  "personio.de", "jobvite.com", "icims.com", "myworkday.com", "successfactors.com", "avature.net",
  "taleo.net", "breezy.hr", "join.com", "zohorecruit.com",
]

const LABELS: EmailClassification[] = ["unrelated", "confirmation", "interview", "assessment", "question", "rejection", "offer", "conference"]
const NOISE_SENDER = /(?:newsletter|digest|marketing|promo|jobalert|job-alert|messages-noreply@linkedin\.com|burstyourbubble|groundnews|harpercollins|newslettere\.hipo\.ro|hipo\.ro|glassdoor\.com|indeed(?:mail)?\.com|ziprecruiter\.com|substack\.com|mailchimp|medium\.com|quora\.com|greenhouse-jobs)/i
const NOISE_SHAPE = /\b(?:unsubscribe|weekly digest|daily digest|job alert|recommended jobs|community update|view in browser|manage preferences|newsletter|dream job|show recruiters)\b/i
const JOB_DIGEST_OR_ALERT = /\b(?:job alert|weekly digest|daily digest|job trends|joburi noi|locuri de munca|recommended jobs|jobs for you|job recommendations|people open to hiring|are hiring in your network|just hired|roles were hired this week|job match for you|career trends in your network)\b/i
const SECURITY_PASSCODE = /\b(?:one-time[- ]passcode|one-time[- ]password|verification code|security code|passcode|login code|auth code|two-factor|2fa code|confirm your email|reset your password|verify your account)\b/i
const GENERAL_NEWS_OR_NON_JOB = /\b(?:darkest moment|trusting god|devotional|bible|scripture|breaking news|top headlines|weather update|daily horoscope)\b/i
const CONFERENCE_EVENT = /\b(?:ADCx?|ADC 202\d|ISMIR(?:-Community)?|Devoxx|QCon|GOTO|KubeCon|PyCon|EuroPython|RustConf|CppCon|React Summit|JSNation|Audio Developer Conference|conference|summit|symposium|hackathon|call for (?:papers|speakers|proposals|volunteers|contributions)|cfp|poster application|poster submission|conference registration|event ticket|onsite volunteer|volunteer call)\b/i
const NON_JOB = /\b(?:paper|poster|grant|scholarship|visa|membership) application\b/i
const JOB_CONTEXT = /\b(?:job|role|position|candidate|recruit(?:er|ing|ment)?|hiring|application|interview|assessment|resume|cv)\b/i
const STRONG_RULES: Array<{ category: EmailClassification; label: string; re: RegExp }> = [
  { category: "rejection", label: "explicit-rejection", re: /\b(?:not moving forward|will not be moving forward|decided not to proceed|not selected|pursue other candidates|chose someone else|selected another candidate|unable to offer you|regret to inform|unfortunately,? we (?:have decided|are unable))\b/i },
  { category: "offer", label: "explicit-offer", re: /\b(?:pleased to (?:extend|make) (?:you )?an offer|offer you the (?:role|position)|formal offer|offer letter|job offer)\b/i },
  { category: "interview", label: "explicit-interview", re: /\b(?:invite you (?:to|for) (?:an? )?interview|schedule (?:an? |your )?(?:interview|screening call)|book (?:a|your) (?:time|interview)|calendar invitation|invitation to interview)\b/i },
  { category: "assessment", label: "explicit-assessment", re: /\b(?:please (?:complete|take|submit) (?:the|this|a) (?:assessment|test|challenge|take-home)|coding (?:assessment|challenge)|technical assessment|hackerrank|codility|testgorilla)\b/i },
  { category: "assessment", label: "complete-application", re: /\b(?:complete (?:the|your) application|finish (?:the|your) application|action required.*application|incomplete application)\b/i },
  { category: "confirmation", label: "explicit-confirmation", re: /\b(?:we (?:have )?received your application|application (?:has been )?(?:received|submitted)|thank you for (?:your interest|applying)|thanks for applying|your application was sent to)\b/i },
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
    isNoiseSender: NOISE_SENDER.test(email) || NOISE_SENDER.test(raw), isNoReply, isPersonal: Boolean(email) && !isNoReply,
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
  // 1. One-time passcodes, verification codes, auth tokens are always unrelated
  if (SECURITY_PASSCODE.test(norm.text)) {
    return makeResult("unrelated", 0.99, "gate", "authentication or security passcode")
  }

  // 2. LinkedIn explicit rejection tracking URL
  if (norm.links.some((link) => /jobs_application_rejected/i.test(link))) {
    return makeResult("rejection", 0.99, "rule", "LinkedIn rejection tracking tag")
  }

  // 3. Religious texts / general news / homonym false positives (e.g. biblical "Job's darkest moment")
  if (GENERAL_NEWS_OR_NON_JOB.test(norm.text) || /harpercollins|groundnews/i.test(sender.raw)) {
    return makeResult("unrelated", 0.99, "gate", "general news or non-job content")
  }

  // 4. Job alerts, newsletters, network digests, promo emails
  if (sender.isNoiseSender || JOB_DIGEST_OR_ALERT.test(norm.text) || (NOISE_SHAPE.test(norm.text) && !sender.isAts)) {
    return makeResult("unrelated", 0.98, "gate", "bulk sender, digest, or job alert")
  }

  // 5. Tech conferences, summits, workshops, call for papers/speakers/volunteers
  if (CONFERENCE_EVENT.test(norm.text)) {
    return makeResult("conference", 0.96, "rule", "tech conference, summit, or event announcement")
  }

  // 6. User's own outbound sent messages
  if (sender.email === "owner@example.com") {
    return makeResult("unrelated", 0.95, "gate", "outbound email from user")
  }

  // 7. Non-job applications (e.g. visa, grant)
  if (NON_JOB.test(norm.text) && !sender.isAts) {
    return makeResult("unrelated", 0.94, "gate", "non-job application")
  }

  const personalContext = JOB_CONTEXT.test(norm.text)
  if (!personalContext && !sender.isAts) {
    return makeResult("unrelated", 0.92, "gate", "no job-search context")
  }

  // 8. Strong job outcome rules
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
  if (CONFERENCE_EVENT.test(norm.text)) {
    return makeResult("conference", 0.90, "fallback", "conference or event signal")
  }
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
