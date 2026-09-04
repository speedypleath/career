/**
 * Email Radar — response classifier.
 *
 * Replaces the previous ordered `includes()` chain with a scored, evidence-based
 * engine. The old approach failed in three predictable ways:
 *
 *   1. A keyword anywhere in the message won, even inside boilerplate.
 *      ("all official communication comes from @goodtime.io" → interview)
 *   2. Descriptions of a *future* hiring process read as invitations.
 *      ("Next steps: Recruitment Screening Call — a Zoom call…" → interview)
 *   3. Newsletters and job-board digests matched job vocabulary.
 *      ("I accepted the job offer" in a Glassdoor community digest → offer)
 *
 * The pipeline here is: normalise → gate non-job mail on sender/shape →
 * score every category from rules scoped to sentences → suppress signals that
 * sit in hypothetical or process-overview context → resolve with priorities.
 */

export type EmailClassification =
  | "confirmation"
  | "interview"
  | "assessment"
  | "question"
  | "rejection"
  | "offer"
  | "unrelated"

export interface ClassificationSignal {
  category: EmailClassification
  label: string
  weight: number
  evidence: string
}

export interface ClassificationResult {
  classification: EmailClassification
  confidence: number
  signals: ClassificationSignal[]
  reasons: string[]
  scores: Record<string, number>
}

export interface ClassifyInput {
  subject: string
  body: string
  sender?: string
}

/* ------------------------------------------------------------------ *
 * Sender knowledge
 * ------------------------------------------------------------------ */

export const ATS_DOMAINS = [
  "greenhouse-mail.io",
  "workablemail.com",
  "ashbyhq.com",
  "lever.co",
  "hire.lever.co",
  "smartrecruiters.com",
  "bamboohr.com",
  "rippling.com",
  "pinpoint.email",
  "comeet-notifications.com",
  "teamtailor-mail.com",
  "recruitee.com",
  "personio.de",
  "jobvite.com",
  "icims.com",
  "myworkday.com",
  "myworkdayjobs.com",
  "successfactors.com",
  "avature.net",
  "taleo.net",
  "breezy.hr",
  "traffit-mail.com",
  "atsmail.employmenthero.com",
  "join.com",
  "hibob.com",
  "occupop.com",
  "manatal.com",
  "zohorecruit.com",
  "inbound.recruitee.com",
  "mailgun.org",
  "sendgrid.net",
]

/** Async / one-way video interview and coding-test platforms. */
const ASSESSMENT_PLATFORMS = [
  "hackerrank.com",
  "codesignal.com",
  "coderbyte.com",
  "testgorilla.com",
  "codility.com",
  "devskiller.com",
  "woven.teamable.com",
  "karat.com",
  "hirevue.com",
  "hireflix.com",
  "willo.video",
  "sparkhire.com",
  "myinterview.com",
  "vidcruiter.com",
  "codesubmit.io",
  "coderpad.io",
  "qualified.io",
  "alooba.com",
  "testdome.com",
  "predictiveindex.com",
  "criteriacorp.com",
  "hackerearth.com",
  "imocha.io",
  "mettl.com",
  "adaface.com",
  "equest.com",
  "pymetrics.com",
]

/** Live-scheduling / calendar booking tools. */
const SCHEDULING_HOSTS = [
  "calendly.com",
  "cal.com",
  "goodtime.io",
  "chilipiper.com",
  "tidycal.com",
  "savvycal.com",
  "hubspot.com/meetings",
  "meetings.hubspot.com",
  "youcanbook.me",
  "scheduleonce.com",
  "oncehub.com",
  "meet.google.com",
  "zoom.us",
  "teams.microsoft.com",
  "teams.live.com",
  "whereby.com",
  "meetings.ringcentral.com",
]

/**
 * Senders that never carry a personal application update, only digests,
 * marketing, community activity or job recommendations.
 */
const NOISE_SENDER_PATTERNS = [
  /glassdoor\.com/i,
  /indeed(mail|apply)?\.com/i,
  /ziprecruiter\.com/i,
  /jobalerts?@/i,
  /jobs-listings@linkedin\.com/i,
  /jobalerts-noreply@linkedin\.com/i,
  /news(letter)?@/i,
  /digest@/i,
  /marketing@/i,
  /promo(tions)?@/i,
  /substack\.com/i,
  /mailchimp(app)?\.com/i,
  /beehiiv\.com/i,
  /medium\.com/i,
  /revolut\.com/i,
  /wise\.com/i,
  /paypal\.com/i,
  /emag\.ro.*(promo|newsletter)/i,
  /uber\.com/i,
  /bolt\.eu/i,
  /booking\.com/i,
  /steampowered\.com/i,
  /spotify\.com/i,
  /github\.com/i,
]

export interface SenderInfo {
  raw: string
  displayName: string
  email: string
  domain: string
  isAts: boolean
  isNoiseSender: boolean
  isNoReply: boolean
  isPersonal: boolean
}

export function parseSender(raw: string): SenderInfo {
  const value = (raw || "").trim()
  const angle = value.match(/<([^>]+)>/)
  const email = (angle ? angle[1] : value.includes("@") ? value : "").trim().toLowerCase()
  const displayName = (angle ? value.slice(0, angle.index).replace(/["']/g, "") : "").trim()
  const domain = email.includes("@") ? email.split("@")[1] : ""

  const isAts = ATS_DOMAINS.some((d) => domain.endsWith(d) || domain.includes(d))
  const isNoiseSender = NOISE_SENDER_PATTERNS.some((re) => re.test(value))
  const isNoReply = /^(no[-._]?reply|do[-._]?not[-._]?reply|noreply|notifications?|automated)/i.test(
    email.split("@")[0] || ""
  )
  // "Firstname Lastname - Company" or "Firstname Lastname" with a real mailbox
  const isPersonal =
    !isNoReply &&
    /^[A-Za-zĂÂÎȘȚăâîșț'’.-]+\s+[A-Za-zĂÂÎȘȚăâîșț'’.-]+/.test(displayName) &&
    !/team|recruit|talent|careers|hiring|support|hr\b|people ops/i.test(displayName)

  return { raw: value, displayName, email, domain, isAts, isNoiseSender, isNoReply, isPersonal }
}

/* ------------------------------------------------------------------ *
 * Normalisation
 * ------------------------------------------------------------------ */

const HTML_ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&mdash;": "—",
  "&ndash;": "–",
  "&hellip;": "…",
  "&zwnj;": "",
  "&#x27;": "'",
  "&#x2F;": "/",
}

function decodeEntities(input: string): string {
  return input
    .replace(/&[a-z]+;|&#x?[0-9a-f]+;/gi, (m) => HTML_ENTITIES[m.toLowerCase()] ?? m)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
}

function looksLikeHtml(input: string): boolean {
  return /<\/?(?:html|body|table|tbody|tr|td|div|span|p|a|img|br|style|head)\b/i.test(input)
}

function stripHtml(input: string): string {
  return input
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(style|script|head)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
}

/** Cut everything from the first quoted-reply marker onwards. */
function stripQuotedReply(text: string): string {
  const markers: RegExp[] = [
    /^\s*On .{5,160}\bwrote:\s*$/im,
    /^\s*-{2,}\s*Original Message\s*-{2,}/im,
    /^\s*_{10,}\s*$/m,
    /^\s*From:\s.+$/im,
    /^\s*(?:>\s?){1,}\S/m,
    /^\s*Le .{5,160}\ba écrit\s*:/im,
  ]

  let cut = text.length
  for (const re of markers) {
    const m = text.match(re)
    if (m && m.index !== undefined && m.index < cut && m.index > 40) cut = m.index
  }
  return text.slice(0, cut)
}

const FOOTER_LINE = new RegExp(
  [
    "^\\s*(unsubscribe|manage (your )?(email )?preferences|update your preferences)",
    "^\\s*(view (this )?(email|message) in (your )?browser|view online)",
    "^\\s*(privacy (policy|notice)|terms (of (service|use))|cookie policy)",
    "^\\s*(all rights reserved|©|\\(c\\) ?\\d{4}|copyright \\d{4})",
    "^\\s*(this email was sent to|you (are )?receiv(ed|ing) this (email|message) because)",
    "^\\s*(do not reply|please do not reply|this is an automated (email|message)|sent from an unattended)",
    "^\\s*(sent from my (iphone|ipad|android))",
    "^\\s*(confidentiality notice|disclaimer:)",
  ].join("|"),
  "i"
)

function stripFooters(text: string): string {
  return text
    .split("\n")
    .filter((line) => !FOOTER_LINE.test(line))
    .join("\n")
}

export interface NormalizedEmail {
  subject: string
  body: string
  text: string
  sentences: string[]
  links: string[]
  /** Character offset where the message starts describing its own hiring process. */
  processSectionAt: number
}

const PROCESS_SECTION_MARKERS = [
  /what happens next/i,
  /what to expect/i,
  /what should you expect/i,
  /what comes next/i,
  /next steps?\s*[:?\n]/i,
  /upcoming steps/i,
  /friendly guide to/i,
  /here'?s (a|what|how)/i,
  /🔜/,
  /our (hiring|recruitment|interview|selection) process/i,
  /the (hiring|recruitment|interview) process/i,
  /overview of our/i,
  /how (our|the) process works/i,
  /process (looks like|is as follows|consists of)/i,
  /(stages|steps) (of|in) (our|the)/i,
  /typically (takes|involves|consists)/i,
]

export function normalizeEmail(subject: string, body: string): NormalizedEmail {
  const rawSubject = decodeEntities(subject || "").replace(/\s+/g, " ").trim()

  let raw = body || ""
  if (looksLikeHtml(raw)) raw = stripHtml(raw)
  raw = decodeEntities(raw)
  raw = stripQuotedReply(raw)
  raw = stripFooters(raw)

  const links: string[] = []
  raw = raw.replace(/https?:\/\/[^\s<>")\]]+/gi, (url) => {
    links.push(url.toLowerCase())
    return " \u0000LINK\u0000 "
  })

  const cleanBody = raw
    .replace(/[ \t ]+/g, " ")
    .replace(/\r/g, "")
    .replace(/^[-=_*]{4,}\s*$/gm, " ")
    .replace(/\n{2,}/g, " ¶ ")
    .replace(/\n/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()

  const text = `${rawSubject}\n${cleanBody}`

  let processSectionAt = -1
  for (const re of PROCESS_SECTION_MARKERS) {
    const m = cleanBody.match(re)
    if (m && m.index !== undefined && (processSectionAt === -1 || m.index < processSectionAt)) {
      processSectionAt = m.index
    }
  }

  const sentences = splitSentences(cleanBody)

  return { subject: rawSubject, body: cleanBody, text, sentences, links, processSectionAt }
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?;:])\s+|\s*¶\s*|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/* ------------------------------------------------------------------ *
 * Context suppressors
 * ------------------------------------------------------------------ */

const HYPOTHETICAL = new RegExp(
  [
    "\\bif\\b",
    "\\bshould you\\b",
    "\\bin case\\b",
    "\\bunless\\b",
    "\\bin the event\\b",
    "\\bprovided that\\b",
    "\\bwere you to\\b",
    "\\bmay be (invited|asked|contacted|selected)\\b",
    "\\bmight be (invited|asked|contacted)\\b",
    "\\bwould be (invited|asked|contacted)\\b",
    "\\bcould be (invited|asked|contacted)\\b",
    "\\bin the (coming|next) (days|weeks)\\b.*\\b(will|shall)\\b",
    "\\bdac[ăa]\\b",
  ].join("|"),
  "i"
)

const FUTURE_PROCESS = new RegExp(
  [
    "\\bwe (will|'ll) (be in touch|reach out|contact you|get back to you|let you know)\\b",
    "\\bwill (then )?(be )?(reach out|contact you|invite you|get in touch)\\b",
    "\\b(a|an|our) (recruiter|talent acquisition|hiring manager)[^.]{0,60}\\bwill\\b",
    "\\bis (the|our) (first|next|second|third|final) (step|stage|round)\\b",
    "\\b(first|next|second|third|final) step is\\b",
    "\\btypically\\b",
    "\\busually\\b",
    "\\bgenerally\\b",
    "\\bconsists? of\\b",
  ].join("|"),
  "i"
)

/** Rejection boilerplate that is explicitly conditional and must not fire. */
const REJECTION_CONDITIONALS = [
  /if you (?:don'?t|do not) hear (?:back )?from us[^.!?\n]*/gi,
  /if you are not (?:contacted|selected|shortlisted)[^.!?\n]*/gi,
  /if we (?:decide|find|feel|do not|don'?t)[^.!?\n]*/gi,
  /(?:however|but) if[^.!?\n]*/gi,
  /should you not (?:hear|be)[^.!?\n]*/gi,
]

/* ------------------------------------------------------------------ *
 * Rules
 * ------------------------------------------------------------------ */

type Scope = "subject" | "body" | "text"

interface Rule {
  category: EmailClassification
  label: string
  weight: number
  re: RegExp
  scope: Scope
  /** Signal describes an action the recipient must take now. */
  actionable?: boolean
  /** Skip hypothetical / process-description suppression. */
  immune?: boolean
}

const RULES: Rule[] = [
  /* ---------------- offer ---------------- */
  { category: "offer", label: "formal-offer", weight: 10, scope: "text", re: /\b(offer of employment|formal (job )?offer|offer letter|employment agreement attached|contract of employment)\b/i },
  { category: "offer", label: "offer-extended", weight: 10, scope: "text", re: /\b(pleased to (offer you|extend an offer)|we would like to offer you|delighted to offer you|happy to offer you|extending you an offer)\b/i },
  { category: "offer", label: "offer-subject", weight: 8, scope: "subject", re: /\b(job offer|offer letter|your offer|offer for the)\b/i },
  { category: "offer", label: "compensation-package", weight: 4, scope: "body", re: /\b(base salary of|annual salary of|compensation package|start date would be|starting salary)\b/i },

  /* ---------------- rejection ---------------- */
  { category: "rejection", label: "ats-rejection-tag", weight: 12, scope: "text", re: /\b(email_)?jobs_application_rejected\b/i, immune: true },
  { category: "rejection", label: "regret", weight: 9, scope: "text", re: /\b(we regret to inform|regretfully inform|it is with regret)\b/i },
  { category: "rejection", label: "not-moving-forward", weight: 9, scope: "text", re: /\b(not|won'?t|will not|shall not|decided not|chosen not|unable) (be )?(to )?(mov(e|ing)|proceed(ing)?|continu(e|ing)|progress(ing)?) (forward|ahead|with your|to the next)/i },
  { category: "rejection", label: "other-candidates", weight: 9, scope: "text", re: /\b(pursue|proceed with|selected|moving forward with) (other|another|different) candidate/i },
  { category: "rejection", label: "not-selected", weight: 9, scope: "text", re: /\b(you (have|were) not been selected|were not selected|have not been selected|not been shortlisted|was not successful|were unsuccessful)\b/i },
  { category: "rejection", label: "position-filled", weight: 8, scope: "text", re: /\b(position|role|vacancy|opening) (has|had|was|is)? ?(already |since |now )?(been )?(filled|closed|cancelled|put on hold|no longer (available|open))\b/i },
  { category: "rejection", label: "no-interview", weight: 8, scope: "text", re: /\b(unable to (offer you an interview|progress your application)|not (be )?able to (take|move) your application)\b/i },
  { category: "rejection", label: "not-a-fit", weight: 7, scope: "text", re: /\b(not (a|the) (right|best|ideal) (fit|match)|closer match to the requirements|more closely (match|aligned))\b/i },
  { category: "rejection", label: "keep-on-file", weight: 3, scope: "text", re: /\b(keep your (cv|resume|details|profile) on file|retain your (details|application) for future)\b/i },
  { category: "rejection", label: "unfortunately", weight: 4, scope: "body", re: /\bunfortunatel(y|ly)\b|\bdin p[ăa]cate\b|\bregret[ăa]m\b/i },
  { category: "rejection", label: "decision-subject", weight: 4, scope: "subject", re: /\b(application (status|update|outcome)|update (on|regarding) your application|regarding your application)\b/i },

  /* ---------------- interview (real invitations) ---------------- */
  { category: "interview", label: "calendar-invite", weight: 12, scope: "subject", re: /^\s*(invitation|updated invitation|accepted|invite):/i, immune: true },
  { category: "interview", label: "appointment-booked", weight: 12, scope: "subject", re: /\b(appointment booked|interview (scheduled|confirmed)|your interview (is )?(scheduled|confirmed)|meeting confirmed)\b/i, immune: true },
  { category: "interview", label: "invited-to-interview", weight: 10, scope: "text", re: /\b(you'?re invited to interview|invit(ed|ation) to (an? )?interview|we'?d? (would )?(like|love) to invite you (to|for) (an? )?(interview|call|chat|conversation))\b/i, actionable: true },
  { category: "interview", label: "schedule-imperative", weight: 9, scope: "body", re: /\b(please (book|schedule|pick|select|choose|use the link)|you can (book|schedule|pick a time)|book a (time|slot|call)|schedule (a|your|our) (call|chat|interview|time)|pick a time|select a time|choose a time that works|grab a (time|slot))\b/i, actionable: true },
  { category: "interview", label: "availability-request", weight: 8, scope: "body", re: /\b((share|send|let us know|confirm) (me |us )?your availability|what (times|days) (work|suit)|when (are|would) you (available|be free)|your availability for)\b/i, actionable: true },
  { category: "interview", label: "scheduling-link", weight: 8, scope: "body", re: /\u0000LINK\u0000/, actionable: true },
  { category: "interview", label: "speak-with-you", weight: 6, scope: "body", re: /\b(would (love|like) to (speak|chat|connect|talk) with you|like to set up (a|some) time|set up a (call|chat|time) (with you|to)|move you (forward |on )?to the next (step|round)|advance to the next (round|stage))\b/i },
  { category: "interview", label: "screen-noun", weight: 5, scope: "body", re: /\b(phone screen|screening call|recruiter screen|intro(ductory)? call|initial (screen|call)|first (round|stage) interview)\b/i },
  { category: "interview", label: "explicit-datetime", weight: 6, scope: "body", re: /\b(on )?(mon|tue|wed|thu|fri|sat|sun)[a-z]*,? \d{1,2}(st|nd|rd|th)? [a-z]{3,9}|(\b\d{1,2}:\d{2}\s?(am|pm|utc|cet|eet|est|pst)\b)/i },
  { category: "interview", label: "interview-subject", weight: 6, scope: "subject", re: /\b(technical|final|onsite|panel|hr|hiring manager) interview\b|\binterview (invitation|invite)\b/i },

  /* ---------------- assessment ---------------- */
  { category: "assessment", label: "assessment-platform", weight: 10, scope: "text", re: new RegExp(`\\b(${ASSESSMENT_PLATFORMS.map((h) => h.replace(/\./g, "\\.")).join("|")})`, "i"), immune: true },
  { category: "assessment", label: "video-interview-task", weight: 9, scope: "text", re: /\b(video interview|one[- ]way interview|recorded interview|async(hronous)? interview)\b/i, actionable: true },
  { category: "assessment", label: "coding-task", weight: 9, scope: "text", re: /\b(coding (challenge|assessment|exercise|test)|technical (assessment|challenge|test|exercise)|take[- ]home (task|assignment|test|challenge|project)|skills? (assessment|test)|online (assessment|test))\b/i },
  { category: "assessment", label: "complete-imperative", weight: 6, scope: "body", re: /\b(complete (the|your|this|our)[^.!?]{0,40}?(assessment|test|challenge|exercise|interview)|start your (interview|assessment)|begin the (assessment|test)|submit your (solution|assignment)|(pick|choose|book) a (time )?slot for your (assessment|test|interview)|you can start (right away|now|immediately))\b/i, actionable: true },
  // "You can start right away" is an instruction, not a description of a future
  // stage, so it survives the process-section suppression around it.
  { category: "assessment", label: "immediate-start", weight: 8, scope: "body", re: /\b(you can start (right away|now|immediately)|no need to wait for another email|start (the|your) (assessment|test|challenge) (right away|now|today))\b/i, actionable: true, immune: true },
  { category: "assessment", label: "deadline", weight: 4, scope: "body", re: /\b(within (the next )?\d+ (hours?|days?)|\d+ hours? (remaining|left)|expires? (in|on)|deadline (is|of))\b/i, actionable: true },

  /* ---------------- question / action required ---------------- */
  { category: "question", label: "action-required", weight: 8, scope: "subject", re: /\b(action required|action needed|response required|reminder:|awaiting your (reply|response)|incomplete application)\b/i, actionable: true },
  { category: "question", label: "screening-questions", weight: 8, scope: "body", re: /\b(screening (questions?|questionnaire)|answer (a few|the following|some) questions|additional (information|details) (is )?(needed|required)|we (still )?need (you to|some)|questionnaire)\b/i, actionable: true },
  { category: "question", label: "documents", weight: 6, scope: "body", re: /\b(please (sign|complete|fill (in|out)|provide|upload|send us)|sign the document|upload your (cv|resume|documents)|fill (in|out) the form)\b/i, actionable: true },
  { category: "question", label: "salary-expectations", weight: 6, scope: "body", re: /\b(salary expectations|expected (salary|compensation|rate)|notice period|earliest start date|work authorization|right to work|visa (status|sponsorship))\b/i },
  { category: "question", label: "gdpr-consent", weight: 5, scope: "text", re: /\b(gdpr|data privacy consent|consent to (the )?process(ing)? (of )?your (personal )?data|mesaj gdpr|prelucrarea datelor)\b/i },
  { category: "question", label: "follow-up", weight: 5, scope: "subject", re: /\b(follow[- ]?up (on|regarding)|following up (on|regarding)|checking in (on|about))\b/i },

  /* ---------------- confirmation ---------------- */
  { category: "confirmation", label: "thanks-for-applying", weight: 8, scope: "text", re: /\b(thank you|thanks|thank you very much) for (applying|your application|submitting your application|your interest in (the|joining|our|working))\b/i },
  { category: "confirmation", label: "application-received", weight: 9, scope: "text", re: /\b(we('ve| have)? (just )?received your (job )?(application|resume|cv)|your (job )?application (has been|was|is) (received|submitted|sent|successfully)|application (received|submitted|confirmation)|we (just )?got (it|your application)|submission received|successfully (submitted|applied|received))\b/i },
  { category: "confirmation", label: "under-review", weight: 6, scope: "body", re: /\b(we('re| are| will)? (currently |carefully )?review(ing|) your (application|profile|cv|resume)|your application (is|will be) (currently )?(under|being|carefully) review(ed)?|(our|the) (team|hiring team|recruiter) will (review|look)|will be reviewed by|is now (with|being reviewed))\b/i },
  { category: "confirmation", label: "appreciate-interest", weight: 7, scope: "text", re: /\b(we )?(appreciate|value) (your|the) (interest|time|application)\b|\btime you'?ve invested in applying\b|\bthanks? for (taking the time to apply|considering us)\b/i },
  { category: "confirmation", label: "candidacy", weight: 6, scope: "text", re: /\b(your candidacy|as a candidate (on|in) our|candidate (profile|database|pool))\b/i },
  { category: "confirmation", label: "application-sent-to", weight: 8, scope: "subject", re: /\byour application was sent to\b/i },
  { category: "confirmation", label: "security-code", weight: 6, scope: "subject", re: /\bsecurity code for your application\b/i, immune: true },
  { category: "confirmation", label: "talent-pool", weight: 5, scope: "body", re: /\b(talent (pipeline|pool|community)|keep you in mind for future|consider(ed)? for (future|other) (roles|opportunities))\b/i },
  { category: "confirmation", label: "applied-subject", weight: 4, scope: "subject", re: /\b(your application (to|for)|application (to|for) the|you applied (to|for))\b/i },
  { category: "confirmation", label: "ro-application-received", weight: 8, scope: "text", re: /\b(am primit (aplica[țt]ia|candidatura|cv-?ul)|mul[țt]umim pentru (aplica[țt]ie|aplicare|interesul|timpul)|aplica[țt]ia ta (a fost|este))\b/i },

  /* ---------------- Romanian ---------------- */
  { category: "interview", label: "ro-meeting-set", weight: 10, scope: "body", re: /\b(ne conect[ăa]m|te a[șs]tept[ăa]m la (sediul|birou)|ne (vedem|[îi]nt[âa]lnim)|te invit[ăa]m la (un |o )?(interviu|discu[țt]ie|[îi]nt[âa]lnire)|pentru (discu[țt]ia|[îi]nt[âa]lnirea|interviul))\b/i, actionable: true },
  { category: "interview", label: "ro-datetime", weight: 6, scope: "body", re: /\b(luni|mar[țt]i|miercuri|joi|vineri|s[âa]mb[ăa]t[ăa]|duminic[ăa])\b[^.\n]{0,40}\bora \d{1,2}([:.]\d{2})?\b/i },
  { category: "interview", label: "ro-availability", weight: 6, scope: "body", re: /\b(disponibilitatea ta|c[âa]nd e[șs]ti disponibil|ce or[ăa] [țt]i se potrive[șs]te|propune(-mi)? un interval)\b/i, actionable: true },
  { category: "rejection", label: "ro-rejection", weight: 9, scope: "text", re: /\b(nu (vom|am) (continua|mai continua)|am decis s[ăa] (continu[ăa]m|mergem [îi]nainte) cu (al[țt]i|alte)|nu ai fost selectat|nu a[țt]i fost selectat|candidatura ta nu|nu se potrive[șs]te (cu )?(profilul|cerin[țt]ele))\b/i },
  { category: "question", label: "ro-action", weight: 6, scope: "text", re: /\b(te rug[ăa]m s[ăa] (completezi|semnezi|trimi[țt]i|confirmi)|avem nevoie de (c[âa]teva|mai multe) (informa[țt]ii|detalii)|revin cu documentul|a[șs]a cum am discutat|ajut[ăa][ -]m[ăa][,]? te rog|num[ăa]r de telefon|s[ăa] lu[ăa]m leg[ăa]tura|a[șs]tept[ăa]m un r[ăa]spuns)\b/i, actionable: true },
]

/* ------------------------------------------------------------------ *
 * Non-job gate
 * ------------------------------------------------------------------ */

const NOISE_SUBJECT = [
  /\b(newsletter|digest|weekly (round|recap|update)|this week in)\b/i,
  /\b(job alert|jobs? for you|new jobs?|\d+ (new )?jobs?|recommended (jobs?|for you)|job recommendations?|top (job )?picks|are hiring|hiring now|opportunit[ăa][țt]ile lunii)\b/i,
  /\b(receipt|invoice|order (confirmation|#|no)|your order|payment (received|confirmation|due)|comanda ta|predat[ăa] curierului|shipped|delivery)\b/i,
  /\b(reset (your )?password|verify your (email|account)|log ?in near|new (sign-?in|device)|security alert|two[- ]factor)\b/i,
  /\b(coupon|discount|% off|sale|save up to|black friday|deal of|price (drop|update)|limited time)\b/i,
  /\b(survey|webinar|conference|call for (papers|contribution)|meetup|podcast|blog post|trip with)\b/i,
  /\b(revpoints|reward points|new level unlocked|tiny joy alert|celebrate)\b/i,
]

const NOISE_BODY = [
  /\b(view (all|more) jobs|browse (jobs|openings)|see (all )?\d+ jobs|apply now to|jobs picked for you)\b/i,
  /\b(you (are )?receiv(ed|ing) this because you (subscribed|signed up|follow))\b/i,
  /\b(upvot(e|ed)|comment(ed)? on|replied to your post|joined the (bowl|community|discussion)|trending (in|post))\b/i,
]

/** Phrases that prove the message concerns *this* person's own application. */
const PERSONAL_APPLICATION_CONTEXT =
  /\b(your application|you applied|thank you for applying|thanks for applying|we received your|your candidacy|your interview|your assessment|your profile (for|was)|application (id|reference|number))\b/i

/**
 * "Application" without a job behind it. Conference and academic submissions
 * reuse the whole vocabulary, including "your application".
 */
const NON_JOB_APPLICATION =
  /\b(poster|abstract|paper|talk|workshop|panel|grant|scholarship|bursary|fellowship|membership|course) application\b|\bapplication (form )?(for|to) (a |the |an )?(poster|abstract|paper|talk|workshop|grant|scholarship|bursary|fellowship|membership|course)\b/i

/**
 * A concrete job title in the subject. Weaker evidence than the phrases above,
 * but enough to show the thread is about a role — which is what separates a
 * recruiter's reply ("Message replied: Senior Fullstack Engineer- Hyperfy")
 * from a bank's fraud notice that merely says "unfortunately".
 */
const JOB_ROLE_SUBJECT = new RegExp(
  [
    "\\b(engineer|developer|programmer|architect|designer|analyst|scientist)\\b",
    "\\b(manager|consultant|specialist|administrator|technician|researcher)\\b",
    "\\b(intern(ship)?|full[- ]?stack|back[- ]?end|front[- ]?end|devops|sre|qa)\\b",
    "\\b(position|vacancy|role at|opening at)\\b",
  ].join("|"),
  "i"
)

/* ------------------------------------------------------------------ *
 * Scoring
 * ------------------------------------------------------------------ */

const BOUNDARIES = [". ", "? ", "! ", "; ", "¶", "\n"]

/** The sentence containing `index`, used as the context window for a signal. */
function sentenceFor(body: string, index: number): string {
  let from = 0
  for (const term of BOUNDARIES) {
    const at = body.lastIndexOf(term, index)
    if (at !== -1 && at + term.length > from) from = at + term.length
  }

  let to = body.length
  for (const term of BOUNDARIES) {
    const at = body.indexOf(term, index)
    if (at !== -1 && at < to) to = at
  }

  return body.slice(from, Math.min(to + 1, body.length))
}

const PRIORITY: EmailClassification[] = [
  "offer",
  "rejection",
  "interview",
  "assessment",
  "question",
  "confirmation",
  "unrelated",
]

export function classifyEmailDetailed(input: ClassifyInput): ClassificationResult {
  const sender = parseSender(input.sender || "")
  const norm = normalizeEmail(input.subject, input.body)
  const reasons: string[] = []
  const signals: ClassificationSignal[] = []

  const scores: Record<EmailClassification, number> = {
    confirmation: 0,
    interview: 0,
    assessment: 0,
    question: 0,
    rejection: 0,
    offer: 0,
    unrelated: 0,
  }

  const hasPersonalContext = PERSONAL_APPLICATION_CONTEXT.test(norm.text)

  // LinkedIn states the outcome only in its tracking URLs, which normalisation
  // strips out of the body. Read it off the extracted links instead.
  const linkedInRejected = norm.links.some((l) => /jobs_application_rejected/i.test(l))
  if (linkedInRejected) {
    scores.rejection += 12
    signals.push({ category: "rejection", label: "linkedin-rejection-tag", weight: 12, evidence: "jobs_application_rejected" })
    reasons.push("rejection:linkedin-rejection-tag (+12) tracking URL marks this as a rejection")
  }

  // --- Gate 1: senders that never send personal application updates.
  if (sender.isNoiseSender && !hasPersonalContext && !linkedInRejected) {
    return {
      classification: "unrelated",
      confidence: 0.95,
      signals: [],
      reasons: [`sender ${sender.domain || sender.raw} only sends digests/marketing`],
      scores,
    }
  }

  // --- Gate 2: digest / marketing / transactional shape.
  const noiseSubjectHit = NOISE_SUBJECT.find((re) => re.test(norm.subject))
  const noiseBodyHit = NOISE_BODY.find((re) => re.test(norm.body))
  if ((noiseSubjectHit || noiseBodyHit) && !hasPersonalContext && !linkedInRejected) {
    return {
      classification: "unrelated",
      confidence: 0.9,
      signals: [],
      reasons: [
        noiseSubjectHit ? `subject matches bulk-mail pattern ${noiseSubjectHit}` : `body matches bulk-mail pattern ${noiseBodyHit}`,
      ],
      scores,
    }
  }

  // --- Gate 3: "application" that is not a job application.
  //
  // Conference posters, papers and grants are applied for in exactly the same
  // words a job is, down to "your application", so the personal-context check
  // above cannot separate them. Name the other kinds explicitly.
  const nonJobHit = norm.text.match(NON_JOB_APPLICATION)
  if (nonJobHit && !sender.isAts && !linkedInRejected) {
    return {
      classification: "unrelated",
      confidence: 0.85,
      signals: [],
      reasons: [`"${nonJobHit[0]}" is an application for something other than a job`],
      scores,
    }
  }

  // Rejection boilerplate is removed before rejection rules run.
  let rejectionBody = norm.body
  for (const re of REJECTION_CONDITIONALS) rejectionBody = rejectionBody.replace(re, " ")
  const rejectionText = `${norm.subject}\n${rejectionBody}`

  const linkHosts = norm.links.map((l) => {
    const m = l.match(/^https?:\/\/([^/]+)/i)
    return m ? m[1].toLowerCase() : ""
  })
  // A conferencing link only implies an interview when it is a personal meeting.
  // Webinar and event registrations use the same hosts and mean nothing here.
  const hasSchedulingLink = norm.links.some((url) => {
    const host = (url.match(/^https?:\/\/([^/]+)/i)?.[1] ?? "").toLowerCase()
    if (!SCHEDULING_HOSTS.some((s) => host.includes(s.split("/")[0]))) return false
    return !/\/(webinar|register|registration|events?|recording|share)\b/i.test(url)
  })
  const hasAssessmentLink = linkHosts.some((h) => ASSESSMENT_PLATFORMS.some((s) => h.includes(s)))

  for (const rule of RULES) {
    let haystack: string
    if (rule.scope === "subject") haystack = norm.subject
    else if (rule.scope === "body") haystack = rule.category === "rejection" ? rejectionBody : norm.body
    else haystack = rule.category === "rejection" ? rejectionText : norm.text

    // The bare-link rule only counts when a real scheduling host was linked.
    if (rule.label === "scheduling-link" && !hasSchedulingLink) continue

    const m = haystack.match(rule.re)
    if (!m || m.index === undefined) continue

    let weight = rule.weight
    const context = rule.scope === "subject" ? norm.subject : sentenceFor(haystack, m.index)
    const notes: string[] = []

    if (!rule.immune && rule.scope !== "subject") {
      if (HYPOTHETICAL.test(context)) {
        weight *= 0.15
        notes.push("hypothetical")
      } else if (FUTURE_PROCESS.test(context)) {
        weight *= 0.25
        notes.push("future-process")
      }

      // Signals inside a "what happens next" section describe the process,
      // they do not invite anybody. Real invitations survive via a booking link.
      if (
        (rule.category === "interview" || rule.category === "offer") &&
        norm.processSectionAt >= 0 &&
        m.index >= norm.processSectionAt &&
        !(rule.category === "interview" && hasSchedulingLink && rule.actionable)
      ) {
        weight *= 0.2
        notes.push("process-section")
      }
    }

    if (weight < 0.75) continue

    scores[rule.category] += weight
    signals.push({
      category: rule.category,
      label: rule.label,
      weight: Math.round(weight * 10) / 10,
      evidence: (m[0] || "").slice(0, 120),
    })
    reasons.push(
      `${rule.category}:${rule.label} (+${Math.round(weight * 10) / 10}${notes.length ? ` ${notes.join(",")}` : ""}) "${(m[0] || "").slice(0, 60)}"`
    )
  }

  // --- Structural adjustments -------------------------------------------------

  // An interview needs a concrete hook, not just warm language.
  const interviewActionable = signals.some(
    (s) =>
      s.category === "interview" &&
      s.weight >= 5 &&
      [
        "calendar-invite",
        "appointment-booked",
        "invited-to-interview",
        "schedule-imperative",
        "availability-request",
        "scheduling-link",
        "interview-subject",
        "ro-meeting-set",
        "ro-availability",
      ].includes(s.label)
  )
  if (scores.interview > 0 && !interviewActionable) {
    scores.interview *= 0.45
    reasons.push("interview:no-actionable-hook (x0.45)")
  }

  // An assessment needs a platform, a link or an explicit instruction.
  const assessmentActionable =
    hasAssessmentLink ||
    signals.some((s) => s.category === "assessment" && ["assessment-platform", "complete-imperative", "video-interview-task"].includes(s.label))
  if (scores.assessment > 0 && !assessmentActionable) {
    scores.assessment *= 0.5
    reasons.push("assessment:no-actionable-hook (x0.5)")
  }

  // Some ATS acknowledgements echo the submitted form back to the applicant.
  // The questions in that copy are answered already — they ask nothing.
  const isApplicationCopy = /\b(copy of your application|application data for safekeeping|here'?s what you (submitted|sent)|your submitted answers)\b/i.test(norm.body)
  if (isApplicationCopy && (scores.question > 0 || scores.assessment > 0)) {
    scores.question *= 0.2
    scores.assessment *= 0.2
    reasons.push("question/assessment:echoed-application-form (x0.2)")
  }

  // ATS confirmations are extremely common and reliable; a lone weak rejection
  // hint ("unfortunately") should not beat an explicit acknowledgement.
  const onlyWeakRejection =
    scores.rejection > 0 && !signals.some((s) => s.category === "rejection" && s.weight >= 7)
  if (onlyWeakRejection && scores.confirmation >= 8) {
    scores.rejection *= 0.4
    reasons.push("rejection:weak-hint-vs-strong-confirmation (x0.4)")
  }

  // A rejection outranks the acknowledgement it is bundled with.
  if (scores.rejection >= 8) scores.confirmation *= 0.35

  // Real invitations usually also thank you for applying — don't let that win.
  if (scores.interview >= 8 || scores.assessment >= 8 || scores.offer >= 8) {
    scores.confirmation *= 0.5
  }

  if (sender.isPersonal && !sender.isAts) {
    // A human wrote this; acknowledgement bots dominate the confirmation class.
    scores.confirmation *= 0.85
  }

  // --- Resolve ----------------------------------------------------------------

  const MIN_SCORE = 4
  let best: EmailClassification = "unrelated"
  let bestScore = 0
  let runnerUp = 0

  for (const cat of PRIORITY) {
    if (cat === "unrelated") continue
    const score = scores[cat]
    if (score > bestScore + 0.001) {
      runnerUp = bestScore
      bestScore = score
      best = cat
    } else if (score > runnerUp) {
      runnerUp = score
    }
  }

  if (bestScore < MIN_SCORE) {
    return {
      classification: "unrelated",
      confidence: bestScore === 0 ? 0.9 : 0.5,
      signals,
      reasons: reasons.length ? reasons : ["no job-application signals found"],
      scores,
    }
  }

  // --- Corroboration gate -----------------------------------------------------
  //
  // Nothing so far proves this message is even about the recipient's job search.
  // Ordinary mail borrows this vocabulary constantly: a bank's fraud notice says
  // "unfortunately", a Google Forms receipt echoes "please provide". One weak
  // hint is a coincidence, not a verdict — demand a strong signal or a second
  // independent one before labelling mail from an unknown sender.
  const jobContext =
    sender.isAts || hasPersonalContext || linkedInRejected || JOB_ROLE_SUBJECT.test(norm.subject)
  if (!jobContext) {
    const winning = signals.filter((s) => s.category === best)
    const hasStrong = winning.some((s) => s.weight >= 7)
    if (!hasStrong && winning.length < 2) {
      return {
        classification: "unrelated",
        confidence: 0.6,
        signals,
        reasons: [
          ...reasons,
          `${best}:uncorroborated — single weak signal with no application context`,
        ],
        scores,
      }
    }
  }

  const margin = (bestScore - runnerUp) / bestScore
  const confidence = Math.max(0.35, Math.min(0.99, 0.5 + 0.3 * margin + Math.min(0.2, bestScore / 60)))

  return {
    classification: best,
    confidence: Math.round(confidence * 100) / 100,
    signals,
    reasons,
    scores,
  }
}

/** Backwards-compatible entry point. */
export function classifyEmail(subject: string, body: string, sender = ""): EmailClassification {
  return classifyEmailDetailed({ subject, body, sender }).classification
}
