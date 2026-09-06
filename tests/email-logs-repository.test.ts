import assert from "node:assert/strict"
import test from "node:test"
import { MANUAL_CLASSIFICATION_FIELDS, buildLogUpdate } from "../src/lib/repositories/email-logs-update.ts"

// These lock the second of the pipeline's two invariants: a human's
// classification is permanent. The flag set here is what every other writer
// checks before it is allowed to touch the row, so if these assertions ever
// change, rescans and the queue worker can start overwriting people's
// corrections.

test("classifying an email marks it as a manual override", () => {
  const data = buildLogUpdate({ classification: "rejection" })
  assert.ok(data)
  assert.equal(data.classification, "rejection")
  assert.equal(data.manual_override, true)
  assert.equal(data.classification_state, "resolved")
  assert.equal(data.classification_source, "manual")
  assert.equal(data.classification_error, null)
  assert.ok(data.classified_at instanceof Date)
})

test("the override flag is never set to anything but true", () => {
  assert.equal(MANUAL_CLASSIFICATION_FIELDS.manual_override, true)
})

test("relinking an application alone does not claim a manual classification", () => {
  const data = buildLogUpdate({ application_id: "0a3c1b7e-0000-0000-0000-000000000000" })
  assert.ok(data)
  assert.equal(data.application_id, "0a3c1b7e-0000-0000-0000-000000000000")
  assert.equal("manual_override" in data, false)
  assert.equal("classification" in data, false)
})

test("an empty application_id clears the link rather than writing an empty string", () => {
  const data = buildLogUpdate({ application_id: "" })
  assert.ok(data)
  assert.equal(data.application_id, null)
})

test("an empty patch produces no write at all", () => {
  assert.equal(buildLogUpdate({}), null)
})

test("both fields together set the link and the override", () => {
  const data = buildLogUpdate({ application_id: null, classification: "offer" })
  assert.ok(data)
  assert.equal(data.application_id, null)
  assert.equal(data.classification, "offer")
  assert.equal(data.manual_override, true)
})

test("marking a follow-up done does not touch classification or the override flag", () => {
  const data = buildLogUpdate({ follow_up_done: true })
  assert.ok(data)
  assert.equal(data.follow_up_done, true)
  assert.equal("manual_override" in data, false)
  assert.equal("classification" in data, false)
})
