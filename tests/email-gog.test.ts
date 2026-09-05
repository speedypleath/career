import assert from "node:assert/strict"
import test from "node:test"
import {
  BODY_HYDRATION_CONCURRENCY,
  MAX_BODY_CHARS,
  MAX_SEARCH_RESULTS,
  hydrateBodies,
  searchMessages,
} from "../src/lib/email/gog.ts"
import type { ExecFn } from "../src/lib/email/gog.ts"

const b64 = (s: string) => Buffer.from(s, "utf-8").toString("base64")
const okExec = (stdout: string, stderr = ""): ExecFn => async () => ({ stdout, stderr })
const throwingExec = (message: string, stderr = ""): ExecFn => async () => {
  const err = new Error(message) as Error & { stderr?: string }
  err.stderr = stderr
  throw err
}

// searchMessages and hydrateBodies must NEVER throw. A scan that returns zero
// messages with a populated errors[] means "blocked"; zero messages with an
// empty errors[] means "no mail". The UI relies on telling those apart.

test("a JSON array of messages is parsed", async () => {
  const { messages, errors } = await searchMessages(
    "me@example.com",
    okExec(JSON.stringify([{ id: "1", subject: "Hello" }])),
  )
  assert.equal(messages.length, 1)
  assert.equal(messages[0].id, "1")
  assert.deepEqual(errors, [])
})

test("an object wrapper is unwrapped under any of its three keys", async () => {
  for (const key of ["messages", "results", "threads"]) {
    const { messages, errors } = await searchMessages(
      "me@example.com",
      okExec(JSON.stringify({ [key]: [{ id: "a" }, { id: "b" }] })),
    )
    assert.equal(messages.length, 2, `expected the ${key} key to be unwrapped`)
    assert.deepEqual(errors, [])
  }
})

test("an object with no known key yields no messages and no error", async () => {
  const { messages, errors } = await searchMessages("me@example.com", okExec(JSON.stringify({ nope: 1 })))
  assert.deepEqual(messages, [])
  assert.deepEqual(errors, [])
})

test("unparseable stdout is reported, not thrown", async () => {
  const { messages, errors } = await searchMessages("me@example.com", okExec("command not recognised"))
  assert.deepEqual(messages, [])
  assert.equal(errors.length, 1)
  assert.match(errors[0], /^Gmail scan returned unexpected output: command not recognised/)
})

test("empty stdout with stderr is reported as a scan error", async () => {
  const { messages, errors } = await searchMessages("me@example.com", okExec("", "quota exceeded"))
  assert.deepEqual(messages, [])
  assert.deepEqual(errors, ["Gmail scan: quota exceeded"])
})

test("empty stdout with no stderr is silence, not an error", async () => {
  const { messages, errors } = await searchMessages("me@example.com", okExec("", ""))
  assert.deepEqual(messages, [])
  assert.deepEqual(errors, [])
})

test("an expired token produces an actionable re-authorize message", async () => {
  const { messages, errors } = await searchMessages(
    "me@example.com",
    throwingExec("oauth2: invalid_grant, token expired or revoked"),
  )
  assert.deepEqual(messages, [])
  assert.deepEqual(errors, [
    "Gmail access expired for me@example.com. Re-authorize with: gog auth add me@example.com",
  ])
})

test("a missing gog binary is reported as such", async () => {
  const { errors } = await searchMessages("me@example.com", throwingExec("spawn gog ENOENT"))
  assert.deepEqual(errors, ["The 'gog' CLI is not available on PATH — Gmail scanning is disabled."])
})

test("any other failure is reported verbatim and truncated", async () => {
  const { errors } = await searchMessages("me@example.com", throwingExec("x".repeat(500)))
  assert.equal(errors.length, 1)
  assert.match(errors[0], /^Gmail scan failed: x+$/)
  assert.ok(errors[0].length <= "Gmail scan failed: ".length + 300)
})

test("the search command carries the account, the cap and the 90-day window", async () => {
  let seen = ""
  const spy: ExecFn = async (cmd) => {
    seen = cmd
    return { stdout: "[]", stderr: "" }
  }
  await searchMessages("someone@example.com", spy)
  assert.match(seen, /^gog gmail search /)
  assert.match(seen, /newer_than:90d/)
  assert.match(seen, /--account someone@example\.com/)
  assert.match(seen, new RegExp(`--max ${MAX_SEARCH_RESULTS}`))
})

test("bodies are hydrated per message id", async () => {
  const exec: ExecFn = async (cmd) => {
    const id = /gog gmail get (\S+)/.exec(cmd)?.[1]
    return {
      stdout: JSON.stringify({
        payload: { mimeType: "text/plain", body: { data: b64(`body of ${id}`) } },
      }),
      stderr: "",
    }
  }
  const bodies = await hydrateBodies([{ id: "m1" }, { id: "m2" }], "me@example.com", exec)
  assert.equal(bodies.get("m1"), "body of m1")
  assert.equal(bodies.get("m2"), "body of m2")
})

test("a body is truncated to the storage ceiling", async () => {
  const exec = okExec(
    JSON.stringify({ payload: { mimeType: "text/plain", body: { data: b64("z".repeat(20_000)) } } }),
  )
  const bodies = await hydrateBodies([{ id: "m1" }], "me@example.com", exec)
  assert.equal(bodies.get("m1")?.length, MAX_BODY_CHARS)
})

test("one unreadable message does not abort the rest", async () => {
  const exec: ExecFn = async (cmd) => {
    if (cmd.includes("bad")) throw new Error("boom")
    return {
      stdout: JSON.stringify({ payload: { mimeType: "text/plain", body: { data: b64("fine") } } }),
      stderr: "",
    }
  }
  const bodies = await hydrateBodies([{ id: "bad" }, { id: "good" }], "me@example.com", exec)
  assert.equal(bodies.has("bad"), false)
  assert.equal(bodies.get("good"), "fine")
})

test("non-JSON output for one message is skipped silently", async () => {
  const bodies = await hydrateBodies([{ id: "m1" }], "me@example.com", okExec("not json"))
  assert.equal(bodies.size, 0)
})

test("hydration never exceeds its concurrency ceiling", async () => {
  let inFlight = 0
  let peak = 0
  const exec: ExecFn = async () => {
    inFlight++
    peak = Math.max(peak, inFlight)
    await new Promise((r) => setTimeout(r, 5))
    inFlight--
    return {
      stdout: JSON.stringify({ payload: { mimeType: "text/plain", body: { data: b64("x") } } }),
      stderr: "",
    }
  }
  const messages = Array.from({ length: 20 }, (_, i) => ({ id: `m${i}` }))
  await hydrateBodies(messages, "me@example.com", exec)
  assert.ok(
    peak <= BODY_HYDRATION_CONCURRENCY,
    `peak concurrency ${peak} exceeded the ${BODY_HYDRATION_CONCURRENCY} ceiling`,
  )
})

test("an empty message list does no work", async () => {
  let called = false
  const exec: ExecFn = async () => {
    called = true
    return { stdout: "", stderr: "" }
  }
  const bodies = await hydrateBodies([], "me@example.com", exec)
  assert.equal(bodies.size, 0)
  assert.equal(called, false)
})
