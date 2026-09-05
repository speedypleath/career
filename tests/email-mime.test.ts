import assert from "node:assert/strict"
import test from "node:test"
import {
  extractBodyFromGmailPayload,
  htmlToText,
  looksLikeHtmlBody,
  normalizeBodyString,
} from "../src/lib/email/mime.ts"

const b64 = (s: string) => Buffer.from(s, "utf-8").toString("base64")

test("htmlToText drops markup, script and style", () => {
  const html = "<style>p{color:red}</style><script>alert(1)</script><p>Hello <b>there</b></p>"
  const text = htmlToText(html)
  assert.equal(text.includes("color:red"), false)
  assert.equal(text.includes("alert"), false)
  assert.match(text, /Hello/)
  assert.match(text, /there/)
})

test("htmlToText decodes the entities the scanner cares about", () => {
  assert.match(htmlToText("<p>a &amp; b</p>"), /a & b/)
  assert.match(htmlToText("<p>&lt;tag&gt;</p>"), /<tag>/)
  assert.match(htmlToText("<p>it&#39;s</p>"), /it's/)
  assert.match(htmlToText("<p>&quot;quoted&quot;</p>"), /"quoted"/)
})

test("looksLikeHtmlBody spots real markup, not prose about it", () => {
  assert.equal(looksLikeHtmlBody("<!DOCTYPE html><html><body>hi</body></html>"), true)
  assert.equal(looksLikeHtmlBody("<div>hi</div>"), true)
  assert.equal(looksLikeHtmlBody("Plain text with no markup at all"), false)
})

test("normalizeBodyString flattens HTML but leaves plain text alone", () => {
  assert.equal(normalizeBodyString("just text"), "just text")
  assert.equal(normalizeBodyString("line one\r\nline two"), "line one\nline two")
  assert.match(normalizeBodyString("<div>wrapped</div>"), /wrapped/)
  assert.equal(normalizeBodyString("<div>wrapped</div>").includes("<div>"), false)
})

test("an empty or missing payload yields an empty string", () => {
  assert.equal(extractBodyFromGmailPayload(null), "")
  assert.equal(extractBodyFromGmailPayload(undefined), "")
  assert.equal(extractBodyFromGmailPayload({}), "")
})

test("a pre-joined body string is used directly", () => {
  assert.equal(extractBodyFromGmailPayload({ body: "already text" }), "already text")
})

test("a pre-joined body that is still raw HTML gets flattened", () => {
  // This is the case the helper exists for: gog sometimes returns raw HTML in
  // `body`, which would otherwise leak <!DOCTYPE ...> into the snippet column.
  const out = extractBodyFromGmailPayload({ body: "<!DOCTYPE html><html><body>Hi there</body></html>" })
  assert.equal(out.includes("<!DOCTYPE"), false)
  assert.match(out, /Hi there/)
})

test("a multipart payload yields the text/plain part", () => {
  const out = extractBodyFromGmailPayload({
    payload: {
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/plain", body: { data: b64("the plain part") } },
        { mimeType: "text/html", body: { data: b64("<p>the html part</p>") } },
      ],
    },
  })
  assert.equal(out, "the plain part")
})

test("text/plain is found through nested multipart levels", () => {
  const out = extractBodyFromGmailPayload({
    payload: {
      mimeType: "multipart/mixed",
      parts: [
        { mimeType: "application/pdf", body: { attachmentId: "x" } },
        {
          mimeType: "multipart/alternative",
          parts: [{ mimeType: "text/plain", body: { data: b64("buried deep") } }],
        },
      ],
    },
  })
  assert.equal(out, "buried deep")
})

test("html is used when there is no plain part", () => {
  const out = extractBodyFromGmailPayload({
    payload: {
      mimeType: "multipart/alternative",
      parts: [{ mimeType: "text/html", body: { data: b64("<p>only html <b>here</b></p>") } }],
    },
  })
  assert.match(out, /only html/)
  assert.equal(out.includes("<p>"), false)
})

test("the snippet is the last resort", () => {
  assert.equal(extractBodyFromGmailPayload({ snippet: "fallback snippet" }), "fallback snippet")
  assert.equal(
    extractBodyFromGmailPayload({ payload: { mimeType: "text/plain" }, snippet: "no data anywhere" }),
    "no data anywhere",
  )
})

test("undecodable part data does not throw", () => {
  const out = extractBodyFromGmailPayload({
    payload: { mimeType: "text/plain", body: { data: "!!!not base64!!!" } },
    snippet: "survived",
  })
  assert.equal(typeof out, "string")
})
