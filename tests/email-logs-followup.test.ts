import assert from "node:assert/strict"
import test from "node:test"
import { buildCustomFollowUp } from "../src/lib/repositories/email-logs-followup.ts"

const RECIPIENT = "owner@example.com"

test("builds a row from a minimal input", () => {
  const row = buildCustomFollowUp({ title: "Backend Engineer", link: "https://boards.greenhouse.io/x/1" }, RECIPIENT)
  assert.ok(typeof row !== "string")
  assert.equal(row.subject, "Backend Engineer")
  assert.equal(row.body, "https://boards.greenhouse.io/x/1")
  assert.equal(row.sender, "boards.greenhouse.io")
  assert.equal(row.recipient, RECIPIENT)
  assert.equal(row.classification, "question")
  assert.equal(row.classification_state, "resolved")
  assert.equal(row.classification_source, "manual")
})

test("sets manual_override so reanalyze and rescans leave it alone", () => {
  const row = buildCustomFollowUp({ title: "x", link: "https://example.com" }, RECIPIENT)
  assert.ok(typeof row !== "string")
  assert.equal(row.manual_override, true)
})

test("folds company into the subject and notes into the body", () => {
  const row = buildCustomFollowUp(
    { title: "Backend Engineer", link: "https://example.com/apply", company: "Acme", notes: "Needs a cover letter" },
    RECIPIENT,
  )
  assert.ok(typeof row !== "string")
  assert.equal(row.subject, "Backend Engineer — Acme")
  assert.equal(row.body, "https://example.com/apply\n\nNeeds a cover letter")
})

test("an application_id carries through, and an absent one is null rather than undefined", () => {
  const linked = buildCustomFollowUp(
    { title: "x", link: "https://example.com", application_id: "0a3c1b7e-0000-0000-0000-000000000000" },
    RECIPIENT,
  )
  assert.ok(typeof linked !== "string")
  assert.equal(linked.application_id, "0a3c1b7e-0000-0000-0000-000000000000")

  const unlinked = buildCustomFollowUp({ title: "x", link: "https://example.com" }, RECIPIENT)
  assert.ok(typeof unlinked !== "string")
  assert.equal(unlinked.application_id, null)
})

test("a link that isn't a URL falls back to a 'manual' sender instead of throwing", () => {
  const row = buildCustomFollowUp({ title: "x", link: "not-a-url" }, RECIPIENT)
  assert.ok(typeof row !== "string")
  assert.equal(row.sender, "manual")
})

test("rejects a classification outside the three the Follow-ups tab actually filters on", () => {
  const row = buildCustomFollowUp(
    { title: "x", link: "https://example.com", classification: "rejection" },
    RECIPIENT,
  )
  assert.equal(typeof row, "string")
})

test("requires a title", () => {
  const row = buildCustomFollowUp({ title: "  ", link: "https://example.com" }, RECIPIENT)
  assert.equal(typeof row, "string")
})

test("requires a link", () => {
  const row = buildCustomFollowUp({ title: "x", link: "" }, RECIPIENT)
  assert.equal(typeof row, "string")
})
