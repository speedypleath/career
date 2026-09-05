import assert from "node:assert/strict"
import test from "node:test"
import {
  extractCompanyName,
  extractJobTitle,
  isAtsSender,
  sanitizeCompany,
} from "../src/lib/email/extract.ts"

// These are CHARACTERIZATION tests: every expectation below was captured by
// running the pre-refactor implementation, not by deciding what it ought to
// return. They exist so the extraction logic can be moved out of
// email-scanner.ts without silently changing what lands in the database.
//
// Several of them lock in behavior that is plainly wrong. Those are marked
// KNOWN BAD. Do not "fix" a KNOWN BAD test by editing its expectation — fix
// the heuristic and update the test in the same commit, so the change to
// extracted data is visible in the diff.

test("company extraction — current behavior", () => {
  assert.equal(
    extractCompanyName(
      "Your application to Native Instruments",
      "careers@native-instruments.de",
      "Thank you for applying to the DSP Engineer role.",
    ),
    "Native Instruments",
  )
  assert.equal(
    extractCompanyName(
      "Re: Software Engineer, Audio @ Spotify",
      "recruiting@spotify.com",
      "Hi, following up on your application for Software Engineer, Audio.",
    ),
    "Spotify",
  )
  assert.equal(
    extractCompanyName(
      "Thanks for your interest in Bandcamp",
      "jobs@bandcamp.com",
      "Unfortunately we will not be moving forward.",
    ),
    "Bandcamp",
  )
})

test("sanitizeCompany trims and rejects junk", () => {
  assert.equal(sanitizeCompany("  spotify  "), "spotify")
  assert.equal(sanitizeCompany("ACME Inc."), "ACME Inc.")
  assert.equal(sanitizeCompany("The Team"), "The Team")
  assert.equal(sanitizeCompany("no-reply"), "Unknown Company")
})

test("job title extraction — current behavior", () => {
  assert.equal(
    extractJobTitle(
      "Re: Software Engineer, Audio @ Spotify",
      "Hi, following up on your application for Software Engineer, Audio.",
    ),
    "Software Engineer, Audio",
  )
})

test("ATS senders are recognised", () => {
  assert.equal(isAtsSender("no-reply@greenhouse-mail.io"), true)
  assert.equal(isAtsSender("x@ashbyhq.com"), true)
  assert.equal(isAtsSender("recruiter@linkedin.com"), true)
  assert.equal(isAtsSender("careers@native-instruments.de"), false)
})

test("KNOWN BAD: the company name leaks into the job title", () => {
  assert.equal(
    extractJobTitle(
      "Your application to Native Instruments",
      "Thank you for applying to the DSP Engineer role.",
    ),
    "Native Instruments",
  )
})

test("KNOWN BAD: the job title is taken as the company", () => {
  // The body names Ableton; the subject names the role. It picks the role.
  assert.equal(
    extractCompanyName(
      "Interview invitation - Audio Developer",
      "no-reply@greenhouse-mail.io",
      "We would like to invite you to interview for the Audio Developer position at Ableton.",
    ),
    "Audio Developer",
  )
})

test("KNOWN BAD: a subject-less email invents both a company and a role", () => {
  // This is the path that fabricates applications from nothing, and is why
  // BLACKLISTED_COMPANY_NAMES and scripts/clean-bogus-apps.mjs exist.
  assert.equal(extractCompanyName("", "hr@example.com", "no subject at all"), "Example")
  assert.equal(extractJobTitle("", "no subject at all"), "Software Engineer")
})

test("KNOWN BAD: a courtesy phrase becomes the job title", () => {
  assert.equal(
    extractJobTitle(
      "Thanks for your interest in Bandcamp",
      "Unfortunately we will not be moving forward.",
    ),
    "your interest in Bandcamp",
  )
})
