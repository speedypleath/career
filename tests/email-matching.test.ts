import assert from "node:assert/strict"
import test from "node:test"
import { findBestMatchingApplication } from "../src/lib/email/matching.ts"
import type { Application } from "../src/types.ts"

const app = (partial: Partial<Application>): Application =>
  ({ id: "x", company: "", title: "", contact_email: "", status: "applied", ...partial }) as Application

const probe = (partial: Partial<Parameters<typeof findBestMatchingApplication>[1]>) => ({
  company: "",
  role: "",
  sender: "",
  subject: "",
  body: "",
  snippet: "",
  ...partial,
})

test("no candidate means no match", () => {
  const apps = [app({ id: "a1", company: "Ableton", title: "Audio Developer" })]
  const found = findBestMatchingApplication(apps, probe({ company: "Spotify", subject: "hello" }))
  assert.equal(found, null)
})

test("an empty application list matches nothing", () => {
  assert.equal(findBestMatchingApplication([], probe({ company: "Ableton" })), null)
})

test("a single company match is returned", () => {
  const apps = [
    app({ id: "a1", company: "Ableton", title: "Audio Developer" }),
    app({ id: "a2", company: "Spotify", title: "Backend Engineer" }),
  ]
  const found = findBestMatchingApplication(apps, probe({ company: "Ableton" }))
  assert.equal(found?.id, "a1")
})

test("company matching ignores punctuation and case", () => {
  const apps = [app({ id: "a1", company: "Native Instruments" })]
  assert.equal(findBestMatchingApplication(apps, probe({ company: "native-instruments" }))?.id, "a1")
  assert.equal(findBestMatchingApplication(apps, probe({ company: "NATIVE INSTRUMENTS" }))?.id, "a1")
})

test("a company named only in the body still matches", () => {
  const apps = [app({ id: "a1", company: "Ableton", title: "Audio Developer" })]
  const found = findBestMatchingApplication(
    apps,
    probe({ company: "Unknown Company", body: "regarding your application at Ableton" }),
  )
  assert.equal(found?.id, "a1")
})

test("a direct sender domain matches, an ATS sender does not", () => {
  const apps = [app({ id: "a1", company: "Acme", contact_email: "careers@acme.io" })]

  // direct company address on both sides -> matched
  assert.equal(
    findBestMatchingApplication(apps, probe({ company: "", sender: "careers@acme.io" }))?.id,
    "a1",
  )

  // an ATS relay must not be treated as the company's own domain, otherwise
  // every Greenhouse email would match every Greenhouse application
  assert.equal(
    findBestMatchingApplication(apps, probe({ company: "", sender: "no-reply@greenhouse-mail.io" })),
    null,
  )
})

test("applications with a one-character company name are never candidates", () => {
  const apps = [app({ id: "a1", company: "X", title: "Engineer" })]
  assert.equal(findBestMatchingApplication(apps, probe({ company: "X" })), null)
})

test("with several roles at one company, title keywords pick the right one", () => {
  const apps = [
    app({ id: "a1", company: "Acme", title: "Frontend Engineer" }),
    app({ id: "a2", company: "Acme", title: "Backend Engineer" }),
  ]
  const found = findBestMatchingApplication(
    apps,
    probe({ company: "Acme", role: "Backend Engineer", subject: "Your backend application" }),
  )
  assert.equal(found?.id, "a2")
})

test("a tie falls back to the first company match rather than returning null", () => {
  const apps = [
    app({ id: "a1", company: "Acme", title: "Engineer" }),
    app({ id: "a2", company: "Acme", title: "Engineer" }),
  ]
  const found = findBestMatchingApplication(apps, probe({ company: "Acme", role: "Engineer" }))
  assert.equal(found?.id, "a1")
})
