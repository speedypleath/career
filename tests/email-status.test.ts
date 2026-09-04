import assert from "node:assert/strict"
import test from "node:test"
import {
  BLACKLISTED_COMPANY_NAMES,
  STATUS_RANK,
  shouldAdvanceStatus,
  statusForClassification,
} from "../src/lib/email/status.ts"

// These encode the two invariants the whole pipeline rests on. They are
// duplicated in SQL inside finalize_email_classification (migration
// 202609040003) — if you change anything here, change the RPC in the same
// commit or the scanner and the queue worker will disagree.

test("statusForClassification maps outcomes to stages", () => {
  assert.equal(statusForClassification("offer"), "offer")
  assert.equal(statusForClassification("rejection"), "rejected")
  assert.equal(statusForClassification("interview"), "interviewing")
  assert.equal(statusForClassification("assessment"), "technical_assessment")
  assert.equal(statusForClassification("confirmation"), "applied")
})

test("classifications that say nothing about the stage return null", () => {
  // "question" is deliberately null here — the "asked something while merely
  // applied means somebody is looking at it" rule lives in the caller, not in
  // this mapping, because it needs the application's current status.
  assert.equal(statusForClassification("question"), null)
  assert.equal(statusForClassification("unrelated"), null)
  assert.equal(statusForClassification("conference"), null)
})

test("INVARIANT: status never rewinds", () => {
  assert.equal(shouldAdvanceStatus("interviewing", "applied"), false)
  assert.equal(shouldAdvanceStatus("offer", "interviewing"), false)
  assert.equal(shouldAdvanceStatus("technical_assessment", "applied"), false)
  // forward moves are still allowed
  assert.equal(shouldAdvanceStatus("applied", "interviewing"), true)
  assert.equal(shouldAdvanceStatus("wishlist", "applied"), true)
})

test("INVARIANT: rejection wins from any stage, but only once", () => {
  for (const from of ["wishlist", "applied", "interview_pending", "interviewing", "technical_assessment", "offer"]) {
    assert.equal(shouldAdvanceStatus(from, "rejected"), true, `rejected should win from ${from}`)
  }
  assert.equal(shouldAdvanceStatus("rejected", "rejected"), false)
})

test("INVARIANT: rejected and archived are terminal", () => {
  for (const next of ["applied", "interviewing", "technical_assessment", "offer"] as const) {
    assert.equal(shouldAdvanceStatus("rejected", next), false, `rejected must not move to ${next}`)
    assert.equal(shouldAdvanceStatus("archived", next), false, `archived must not move to ${next}`)
  }
})

test("an application with no status accepts anything", () => {
  assert.equal(shouldAdvanceStatus(undefined, "applied"), true)
  assert.equal(shouldAdvanceStatus(undefined, "rejected"), true)
})

test("STATUS_RANK is strictly ordered", () => {
  const order = [
    "wishlist",
    "applied",
    "interview_pending",
    "interviewing",
    "technical_assessment",
    "offer",
    "rejected",
    "archived",
  ]
  for (let i = 1; i < order.length; i++) {
    assert.ok(
      STATUS_RANK[order[i]] > STATUS_RANK[order[i - 1]],
      `${order[i]} must outrank ${order[i - 1]}`,
    )
  }
})

test("the company blacklist is stored lowercased", () => {
  // extractCompanyName and the RPC both compare against lowercased names, so a
  // capitalised entry here would silently never match.
  for (const name of BLACKLISTED_COMPANY_NAMES) {
    assert.equal(name, name.toLowerCase(), `${name} must be lowercase`)
  }
  assert.ok(BLACKLISTED_COMPANY_NAMES.size > 0)
})
