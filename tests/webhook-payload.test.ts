import assert from "node:assert/strict"
import test from "node:test"
import { normalizeWebhookPayload } from "../src/lib/webhook-payload.ts"

// The webhook is the one endpoint written for callers we do not control — a
// cron job, an agent, whatever someone points at it — so it accepts several
// spellings of each field. Nothing tested that until now.

test("snake_case is taken as written", () => {
  const p = normalizeWebhookPayload({
    title: "DSP Engineer",
    company: "GN Hearing",
    workplace_type: "hybrid",
    application_method: "referral",
    job_description: "audio",
    info_provided: "cv",
    cover_letter: "dear",
    contact_email: "a@b.com",
    contact_name: "Ada",
  })
  assert.equal(p.title, "DSP Engineer")
  assert.equal(p.company, "GN Hearing")
  assert.equal(p.workplace_type, "hybrid")
  assert.equal(p.application_method, "referral")
  assert.equal(p.job_description, "audio")
  assert.equal(p.info_provided, "cv")
  assert.equal(p.cover_letter, "dear")
  assert.equal(p.contact_email, "a@b.com")
  assert.equal(p.contact_name, "Ada")
})

test("camelCase and the looser aliases resolve to the same fields", () => {
  const p = normalizeWebhookPayload({
    jobTitle: "Audio Developer",
    companyName: "Ableton",
    workplaceType: "Remote",
    applicationMethod: "LinkedIn",
    jobUrl: "https://example.com",
    jobDescription: "dsp",
    infoProvided: "resume",
    coverLetter: "hello",
    contactEmail: "x@y.com",
    contactName: "Grace",
    appliedAt: "2026-01-02T03:04:05.000Z",
  })
  assert.equal(p.title, "Audio Developer")
  assert.equal(p.company, "Ableton")
  assert.equal(p.url, "https://example.com")
  assert.equal(p.job_description, "dsp")
  assert.equal(p.info_provided, "resume")
  assert.equal(p.cover_letter, "hello")
  assert.equal(p.contact_email, "x@y.com")
  assert.equal(p.contact_name, "Grace")
  assert.equal(p.applied_at, "2026-01-02T03:04:05.000Z")
})

test("the third-choice aliases work too", () => {
  const p = normalizeWebhookPayload({
    position: "Sound Designer",
    company: "Native Instruments",
    workplace: "on-site",
    method: "email",
    link: "https://ni.com",
    description: "sound",
    providedInfo: "portfolio",
    letter: "regards",
    compensation: "60k",
    email: "jobs@ni.com",
    comment: "via a friend",
    city: "Berlin",
  })
  assert.equal(p.title, "Sound Designer")
  assert.equal(p.workplace_type, "on-site")
  assert.equal(p.application_method, "email")
  assert.equal(p.url, "https://ni.com")
  assert.equal(p.job_description, "sound")
  assert.equal(p.info_provided, "portfolio")
  assert.equal(p.cover_letter, "regards")
  assert.equal(p.salary, "60k")
  assert.equal(p.contact_email, "jobs@ni.com")
  assert.equal(p.notes, "via a friend")
  assert.equal(p.location, "Berlin")
})

test("the earlier alias wins when several are present", () => {
  const p = normalizeWebhookPayload({ title: "first", jobTitle: "second", position: "third" })
  assert.equal(p.title, "first")
})

test("the four enum-ish fields are lowercased, free text is not", () => {
  const p = normalizeWebhookPayload({
    title: "Keep My Case",
    company: "Keep My Case Ltd",
    workplace_type: "HYBRID",
    status: "Interviewing",
    application_method: "Portal",
    priority: "HIGH",
  })
  assert.equal(p.workplace_type, "hybrid")
  assert.equal(p.status, "interviewing")
  assert.equal(p.application_method, "portal")
  assert.equal(p.priority, "high")
  assert.equal(p.title, "Keep My Case")
  assert.equal(p.company, "Keep My Case Ltd")
})

test("defaults fill in everything that was not sent", () => {
  const p = normalizeWebhookPayload({ title: "t", company: "c" })
  assert.equal(p.workplace_type, "remote")
  assert.equal(p.status, "applied")
  assert.equal(p.application_method, "portal")
  assert.equal(p.priority, "medium")
  assert.equal(p.source, "webhook")
  assert.equal(p.location, "")
  assert.equal(p.url, "")
  assert.equal(p.notes, "")
  assert.ok(p.applied_at, "applied_at defaults to now")
})

test("title and company are trimmed, since they are matched on", () => {
  const p = normalizeWebhookPayload({ title: "  Spaced Role  ", company: "  Spaced Co  " })
  assert.equal(p.title, "Spaced Role")
  assert.equal(p.company, "Spaced Co")
})

test("a payload without a title or a company is reported as invalid", () => {
  assert.equal(normalizeWebhookPayload({ company: "c" }).title, "")
  assert.equal(normalizeWebhookPayload({ title: "t" }).company, "")
  assert.equal(normalizeWebhookPayload({ title: "   ", company: "c" }).title, "")
})

// KNOWN BAD — locked, not fixed.
//
// These four fields are defaulted here, before the route decides whether it is
// creating an application or merging into an existing one. The merge statement
// guards every column with COALESCE(NULLIF($n, ''), column), meaning "keep what
// is there if the caller sent nothing" — but that guard can never fire for
// these four, because the normalizer has already replaced the empty value with
// a default.
//
// The consequence, confirmed against a running server: a caller that reports a
// posting a second time mentioning only a url resets status, workplace_type,
// priority and application_method. An application at "interviewing" goes back
// to "applied", which is exactly the rewind the pipeline's first invariant
// forbids everywhere else.
//
// The defaults are correct on create and wrong on merge, so the fix is to
// distinguish the two rather than to drop them. That changes what the endpoint
// does for existing callers, so it is recorded here rather than made silently.
test("KNOWN BAD: defaulting these four defeats the merge guard downstream", () => {
  const p = normalizeWebhookPayload({ title: "t", company: "c", url: "https://example.com" })
  assert.equal(p.status, "applied")
  assert.equal(p.workplace_type, "remote")
  assert.equal(p.priority, "medium")
  assert.equal(p.application_method, "portal")
})
