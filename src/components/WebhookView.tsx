"use client"

import { useState } from "react"
import {
  Webhook,
  Send,
  Check,
  Copy,
  Terminal,
  Code,
  Sparkles,
  Zap,
  Globe,
  CheckCircle2,
  AlertCircle
} from "lucide-react"
import { StatusDot } from "./StatusDot"
import { cx } from "./format"
import { postWebhookApplication } from "@/lib/api-client"

export function WebhookView() {
  const [copied, setCopied] = useState<string | null>(null)
  const [testResponse, setTestResponse] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  // Test form state
  const [testTitle, setTestTitle] = useState("DSP / Audio Software Engineer")
  const [testCompany, setTestCompany] = useState("Sennheiser Romania")
  const [testWorkplace, setTestWorkplace] = useState("hybrid")
  const [testMethod, setTestMethod] = useState("portal")
  const [testUrl, setTestUrl] = useState("https://jobs.sennheiser.com/dsp-engineer")
  const [testSalary, setTestSalary] = useState("€75,000 - €90,000")
  const [testPriority, setTestPriority] = useState("high")
  const [testLetter, setTestLetter] = useState("Applied via automated Bucharest sweep script. Included Owner Name Audio CV.")

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  async function handleSendTest() {
    setSending(true)
    setTestResponse(null)
    try {
      const payload = {
        title: testTitle,
        company: testCompany,
        workplace_type: testWorkplace,
        application_method: testMethod,
        status: "applied",
        url: testUrl,
        salary: testSalary,
        priority: testPriority,
        cover_letter: testLetter,
        info_provided: "CV: example-cv.pdf, Notice: immediate, Location: Bucharest",
        source: "audio-job-hunter-cron",
      }

      const data = await postWebhookApplication(payload)
      setTestResponse(JSON.stringify(data, null, 2))
    } catch (err) {
      setTestResponse(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }, null, 2))
    } finally {
      setSending(false)
    }
  }

  const pythonSnippet = `# Add this snippet to audio-job-hunter cron or sweep script whenever an application is submitted:
import requests

def notify_career_app(job_info):
    webhook_url = "http://127.0.0.1:8098/api/webhook/application"
    payload = {
        "title": job_info.get("title"),
        "company": job_info.get("company"),
        "workplace_type": job_info.get("workplace_type", "remote"), # "remote" | "hybrid" | "on-site"
        "status": "applied",
        "application_method": job_info.get("method", "portal"), # "portal" | "email"
        "url": job_info.get("url", ""),
        "job_description": job_info.get("description", ""),
        "info_provided": job_info.get("info_provided", "CV: example-cv.pdf"),
        "cover_letter": job_info.get("cover_letter", ""),
        "salary": job_info.get("salary", ""),
        "contact_email": job_info.get("contact_email", ""),
        "priority": job_info.get("priority", "high"),
        "source": "audio-job-hunter-cron"
    }
    try:
        r = requests.post(webhook_url, json=payload, timeout=5)
        print(f"Logged to Career Ops: {r.status_code}")
    except Exception as e:
        print(f"Failed to push to Career Ops webhook: {e}")`

  const curlSnippet = `curl -X POST http://127.0.0.1:8098/api/webhook/application \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Senior Backend Engineer",
    "company": "Bitdefender",
    "workplace_type": "hybrid",
    "status": "applied",
    "application_method": "portal",
    "url": "https://boards.greenhouse.io/bitdefender/jobs/123",
    "info_provided": "CV: example-cv.pdf, Notice: immediate",
    "cover_letter": "Dear Hiring Manager at Bitdefender...",
    "source": "audio-job-hunter-cron"
  }'`

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-[var(--color-fg)]">
            Webhook & Cron Automation Bridge
          </h1>
          <p className="text-xs text-[var(--color-muted)]">
            Ingest real-time job applications submitted by the audio-job-hunter background sweep or automated agents
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-[var(--radius-panel)] border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-3 py-1.5 text-xs text-[var(--color-accent)] font-semibold">
          <StatusDot status="online" pulse />
          Endpoint Active
        </div>
      </div>

      {/* Endpoint Info Banner */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 space-y-2">
          <span className="label">Local Ingestion Endpoint</span>
          <div className="flex items-center justify-between rounded bg-[var(--color-bg)] p-2 font-mono text-xs text-[var(--color-fg)] border border-[var(--color-line-soft)]">
            <span>POST http://127.0.0.1:8098/api/webhook/application</span>
            <button
              onClick={() => copyToClipboard("http://127.0.0.1:8098/api/webhook/application", "local-url")}
              className="text-[var(--color-faint)] hover:text-[var(--color-accent)]"
            >
              {copied === "local-url" ? <Check className="h-3.5 w-3.5 text-[var(--color-accent)]" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 space-y-2">
          <span className="label">Tailscale Secure Ingestion Endpoint</span>
          <div className="flex items-center justify-between rounded bg-[var(--color-bg)] p-2 font-mono text-xs text-[var(--color-fg)] border border-[var(--color-line-soft)]">
            <span>POST https://your-mini.your-tailnet.ts.net/api/webhook/application</span>
            <button
              onClick={() => copyToClipboard("https://your-mini.your-tailnet.ts.net/api/webhook/application", "ts-url")}
              className="text-[var(--color-faint)] hover:text-[var(--color-accent)]"
            >
              {copied === "ts-url" ? <Check className="h-3.5 w-3.5 text-[var(--color-accent)]" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Webhook Test Runner */}
      <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-[var(--color-fg)]">Interactive Test Runner</h2>
            <p className="text-[11px] text-[var(--color-faint)]">Send a live payload directly to verify ingestion</p>
          </div>
          <button
            onClick={handleSendTest}
            disabled={sending}
            className="flex items-center gap-1.5 rounded bg-[var(--color-accent)] px-3.5 py-1.5 text-xs font-semibold text-[#0b0c0f] shadow-sm hover:bg-[var(--color-accent)]/90 disabled:opacity-50 transition-all"
          >
            <Zap className="h-3.5 w-3.5" />
            {sending ? "Sending..." : "Dispatch Test Webhook"}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="label block mb-1">Company</label>
            <input
              type="text"
              value={testCompany}
              onChange={(e) => setTestCompany(e.target.value)}
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-2 text-xs text-[var(--color-fg)] focus:outline-none"
            />
          </div>
          <div>
            <label className="label block mb-1">Job Title</label>
            <input
              type="text"
              value={testTitle}
              onChange={(e) => setTestTitle(e.target.value)}
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-2 text-xs text-[var(--color-fg)] focus:outline-none"
            />
          </div>
          <div>
            <label className="label block mb-1">Workplace Type</label>
            <select
              value={testWorkplace}
              onChange={(e) => setTestWorkplace(e.target.value)}
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-2 text-xs text-[var(--color-fg)] focus:outline-none"
            >
              <option value="remote">remote</option>
              <option value="hybrid">hybrid</option>
              <option value="on-site">on-site</option>
            </select>
          </div>
        </div>

        {testResponse && (
          <div className="rounded border border-[var(--color-accent)]/30 bg-[var(--color-bg)] p-3 space-y-1">
            <span className="label text-[9px] text-[var(--color-accent)]">Response Result</span>
            <pre className="text-[11px] font-mono text-[var(--color-fg)] max-h-40 overflow-y-auto">
              {testResponse}
            </pre>
          </div>
        )}
      </div>

      {/* Code Snippets for Cron Integration */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Python Snippet */}
        <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Code className="h-4 w-4 text-[var(--color-accent)]" />
              <span className="text-xs font-bold text-[var(--color-fg)]">Python Integration Script</span>
            </div>
            <button
              onClick={() => copyToClipboard(pythonSnippet, "py")}
              className="flex items-center gap-1 text-[11px] text-[var(--color-faint)] hover:text-[var(--color-accent)]"
            >
              {copied === "py" ? <Check className="h-3 w-3 text-[var(--color-accent)]" /> : <Copy className="h-3 w-3" />}
              {copied === "py" ? "Copied" : "Copy Code"}
            </button>
          </div>

          <pre className="rounded bg-[var(--color-bg)] p-3 text-[11px] font-mono text-[var(--color-muted)] overflow-x-auto border border-[var(--color-line-soft)] leading-relaxed">
            {pythonSnippet}
          </pre>
        </div>

        {/* cURL Snippet */}
        <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-[var(--color-accent)]" />
              <span className="text-xs font-bold text-[var(--color-fg)]">cURL Command Line Example</span>
            </div>
            <button
              onClick={() => copyToClipboard(curlSnippet, "curl")}
              className="flex items-center gap-1 text-[11px] text-[var(--color-faint)] hover:text-[var(--color-accent)]"
            >
              {copied === "curl" ? <Check className="h-3 w-3 text-[var(--color-accent)]" /> : <Copy className="h-3 w-3" />}
              {copied === "curl" ? "Copied" : "Copy cURL"}
            </button>
          </div>

          <pre className="rounded bg-[var(--color-bg)] p-3 text-[11px] font-mono text-[var(--color-muted)] overflow-x-auto border border-[var(--color-line-soft)] leading-relaxed">
            {curlSnippet}
          </pre>
        </div>
      </div>
    </div>
  )
}
