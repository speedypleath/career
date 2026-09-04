import assert from "node:assert/strict"
import test from "node:test"
import {
  MAX_MODEL_INPUT_TOKENS,
  MAX_MODEL_OUTPUT_TOKENS,
  MODEL_INPUT_LIMITS,
  SYSTEM_PROMPT,
  buildModelPrompt,
  classifyEmailDetailed,
  estimateTokens,
} from "../src/lib/email-classifier.ts"
import { buildClassificationJob } from "../src/lib/email-classification-queue.ts"
import {
  buildCloudflareRequest,
  classifyWithCloudflare,
  parseClassification,
} from "../supabase/functions/_shared/cloudflare-classifier.ts"

test("explicit outcomes exit without model tokens", async () => {
  const verdict = await classifyEmailDetailed({ sender: "jobs@greenhouse-mail.io", subject: "Your application", body: "We have decided not to proceed with your application." })
  assert.equal(verdict.classification, "rejection")
  assert.equal(verdict.modelUsed, false)
  assert.equal(verdict.estimatedInputTokens, 0)
})

test("noise exits before the model", async () => {
  const verdict = await classifyEmailDetailed({ sender: "digest@glassdoor.com", subject: "Weekly digest", body: "Recommended jobs for you. Unsubscribe here." })
  assert.equal(verdict.classification, "unrelated")
  assert.equal(verdict.source, "gate")
})

test("ambiguous mail returns immediately for queueing", async () => {
  const started = Date.now()
  const verdict = await classifyEmailDetailed({
    sender: "talent@acme.example",
    subject: "Update on the role",
    body: "We reviewed your candidacy and reached a decision.",
  })
  assert.equal(verdict.source, "fallback")
  assert.ok(Date.now() - started < 100)
})

test("model prompt has a hard size ceiling", () => {
  const prompt = buildModelPrompt({ sender: "x".repeat(500), subject: "y".repeat(500), body: "z".repeat(20_000) })
  assert.ok(prompt.length <= MODEL_INPUT_LIMITS.sender + MODEL_INPUT_LIMITS.subject + MODEL_INPUT_LIMITS.body + 16)
  assert.ok(estimateTokens(`${SYSTEM_PROMPT}\n${prompt}`) <= MAX_MODEL_INPUT_TOKENS)
  assert.equal(MAX_MODEL_OUTPUT_TOKENS, 3)
})

test("queue payload contains only the bounded prompt and operational metadata", () => {
  const job = buildClassificationJob(
    { sender: "talent@example.com", subject: "Update on the role", body: "a".repeat(20_000) },
    {
      emailLogId: "log-id",
      messageId: "message-id",
      applicationId: null,
      sender: "talent@example.com",
      subject: "Update on the role",
      company: "Example",
      role: "Engineer",
      snippet: "short snippet",
    },
  )
  assert.equal(job.version, 1)
  assert.ok(job.estimatedInputTokens <= MAX_MODEL_INPUT_TOKENS)
  assert.equal(job.promptHash.length, 64)
  assert.equal("body" in job, false)
})

test("Cloudflare adapter enforces one-digit output and three-token generation", async () => {
  let requestedUrl = ""
  let requestedBody = ""
  const fetcher: typeof fetch = async (input, init) => {
    requestedUrl = String(input)
    requestedBody = String(init?.body || "")
    return Response.json({
      success: true,
      result: { response: "5", usage: { prompt_tokens: 212, completion_tokens: 1 } },
    })
  }

  const result = await classifyWithCloudflare(
    "F:talent@example.com\nS:Update\nB:We reached a decision.",
    { accountId: "account", apiToken: "token" },
    fetcher,
  )

  assert.equal(result.classification, "rejection")
  assert.match(requestedUrl, /llama-3\.2-1b-instruct$/)
  const sent = JSON.parse(requestedBody)
  assert.equal(sent.max_tokens, 3)
  assert.equal(sent.temperature, 0)
  assert.equal(sent.messages[1].role, "user")
  assert.equal(parseClassification("F:0"), "unrelated")
  assert.equal(parseClassification("2"), "interview")
  assert.equal(parseClassification("garbage"), null)
  assert.deepEqual(buildCloudflareRequest("x").max_tokens, 3)
})
