import assert from "node:assert/strict"
import test from "node:test"
import { shouldReanalyze } from "../src/lib/email/reanalyze-guard.ts"

// The pipeline's second invariant, as CLAUDE.md states it: "Human corrections
// are permanent. A UI classification change sets email_logs.manual_override;
// rescans, the reanalyze route and the worker all bail out on that flag before
// writing."
//
// The reanalyze route did not. Both of its UPDATE arms set
// manual_override = FALSE, so reanalysing an email a person had corrected
// overwrote their label and cleared the flag that was protecting it.

test("an email a person corrected is left alone", () => {
  assert.equal(shouldReanalyze({ manual_override: true }), false)
})

test("an ordinary email is reanalyzed", () => {
  assert.equal(shouldReanalyze({ manual_override: false }), true)
})

test("a null or missing flag is not treated as an override", () => {
  assert.equal(shouldReanalyze({ manual_override: null }), true)
  assert.equal(shouldReanalyze({}), true)
})

test("only a literal true counts, so a stray truthy value cannot lock a row", () => {
  assert.equal(shouldReanalyze({ manual_override: "yes" as unknown as boolean }), false)
})
