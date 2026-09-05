"use client"

import { useState } from "react"
import { Check, Code, Copy, Terminal, Zap } from "lucide-react"
import { ErrorBanner } from "./ErrorBanner"
import { Skeleton } from "./Skeleton"
import { StatusDot } from "./StatusDot"
import { postWebhookApplication } from "@/lib/api-client"
import { useWebhookInfo } from "@/hooks/useWebhookInfo"

const COPIED_MS = 2_000

/** The Tailscale name of the machine the launchd job runs on. */
const TAILSCALE_HOST = "https://your-mini.your-tailnet.ts.net"
const LOCAL_HOST = "http://127.0.0.1:8098"

/**
 * The parts of the test payload with no control on screen. They were eight
 * useState calls whose setters were never called.
 */
const TEST_DEFAULTS = {
  application_method: "portal",
  status: "applied",
  url: "https://jobs.sennheiser.com/dsp-engineer",
  salary: "€75,000 - €90,000",
  priority: "high",
  cover_letter: "Applied via automated Bucharest sweep script. Included Owner Name Audio CV.",
  info_provided: "CV: example-cv.pdf, Notice: immediate, Location: Bucharest",
  source: "audio-job-hunter-cron",
}

const PYTHON_SNIPPET = `# Add this to the audio-job-hunter sweep whenever an application is submitted:
import requests

def notify_career_app(job_info):
    webhook_url = "${LOCAL_HOST}/api/webhook/application"
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

const inputClass =
  "w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-2 text-xs text-[var(--color-fg)] focus:border-[var(--color-accent)] focus:outline-none"

function CopyButton({ copied, onCopy, label }: { copied: boolean; onCopy: () => void; label?: string }) {
  return (
    <button
      onClick={onCopy}
      className="flex items-center gap-1 text-2xs text-[var(--color-faint)] hover:text-[var(--color-accent)] transition-colors"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-[var(--color-accent)]" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      {label && (copied ? "Copied" : label)}
    </button>
  )
}

function EndpointCard({
  title,
  url,
  copied,
  onCopy,
}: {
  title: string
  url: string | null
  copied: boolean
  onCopy: () => void
}) {
  return (
    <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 space-y-2">
      <span className="text-xs font-semibold text-[var(--color-fg)]">{title}</span>
      <div className="flex items-center justify-between gap-2 rounded bg-[var(--color-bg)] p-2 font-mono text-xs text-[var(--color-fg)] border border-[var(--color-line-soft)]">
        {url ? <span className="truncate">POST {url}</span> : <Skeleton className="h-4 w-full" />}
        {url && <CopyButton copied={copied} onCopy={onCopy} />}
      </div>
    </div>
  )
}

export function WebhookView() {
  // The route describes itself — its path, a curl line and the full payload —
  // so none of that is duplicated here any more.
  const { data: info, loading, error, reload } = useWebhookInfo()

  const [copied, setCopied] = useState<string | null>(null)
  const [testResponse, setTestResponse] = useState<string | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const [company, setCompany] = useState("Sennheiser Romania")
  const [title, setTitle] = useState("DSP / Audio Software Engineer")
  const [workplace, setWorkplace] = useState("hybrid")

  // "POST /api/webhook/application" -> "/api/webhook/application"
  const path = info ? info.endpoint.replace(/^\S+\s+/, "") : null

  function copy(text: string, id: string) {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), COPIED_MS)
  }

  async function handleSendTest() {
    setSending(true)
    setTestResponse(null)
    setTestError(null)
    try {
      const data = await postWebhookApplication({
        ...TEST_DEFAULTS,
        title,
        company,
        workplace_type: workplace,
      })
      setTestResponse(JSON.stringify(data, null, 2))
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "The test request failed")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-[var(--color-fg)]">Webhook</h1>
          <p className="text-xs text-[var(--color-muted)]">
            {info?.description ||
              "Record applications posted by the audio-job-hunter sweep or any other agent."}
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-muted)] shrink-0">
          <StatusDot status={error ? "error" : loading ? "offline" : "online"} pulse={!error && !loading} />
          {loading ? "Checking" : error ? "Not responding" : "Accepting posts"}
        </div>
      </div>

      {error && <ErrorBanner message={error} retry={() => void reload()} />}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <EndpointCard
          title="On this machine"
          url={path && `${LOCAL_HOST}${path}`}
          copied={copied === "local-url"}
          onCopy={() => copy(`${LOCAL_HOST}${path}`, "local-url")}
        />
        <EndpointCard
          title="Over Tailscale"
          url={path && `${TAILSCALE_HOST}${path}`}
          copied={copied === "ts-url"}
          onCopy={() => copy(`${TAILSCALE_HOST}${path}`, "ts-url")}
        />
      </div>

      <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-[var(--color-fg)]">Send a test application</h2>
            <p className="text-2xs text-[var(--color-faint)]">
              This writes a real application, so use a company you can recognise and delete.
            </p>
          </div>
          <button
            onClick={handleSendTest}
            disabled={sending}
            className="flex items-center gap-1.5 rounded bg-[var(--color-accent)] px-3.5 py-1.5 text-xs font-semibold text-[#0b0c0f] shadow-sm hover:bg-[var(--color-accent)]/90 disabled:opacity-50 transition-colors shrink-0"
          >
            <Zap className="h-3.5 w-3.5" />
            {sending ? "Sending" : "Send test"}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="block">
            <span className="mb-1 block text-2xs text-[var(--color-faint)]">Company</span>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-2xs text-[var(--color-faint)]">Job title</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-2xs text-[var(--color-faint)]">Workplace</span>
            <select
              value={workplace}
              onChange={(e) => setWorkplace(e.target.value)}
              className={inputClass}
            >
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
              <option value="on-site">On-site</option>
            </select>
          </label>
        </div>

        {testError && <ErrorBanner message={testError} />}

        {testResponse && (
          <div className="rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-3 space-y-1">
            <span className="text-2xs text-[var(--color-faint)]">What came back</span>
            <pre className="text-2xs font-mono text-[var(--color-fg)] max-h-40 overflow-y-auto">
              {testResponse}
            </pre>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Code className="h-4 w-4 text-[var(--color-muted)]" />
              <span className="text-xs font-bold text-[var(--color-fg)]">Post from Python</span>
            </div>
            <CopyButton
              copied={copied === "py"}
              onCopy={() => copy(PYTHON_SNIPPET, "py")}
              label="Copy"
            />
          </div>
          <pre className="rounded bg-[var(--color-bg)] p-3 text-2xs font-mono text-[var(--color-muted)] overflow-x-auto border border-[var(--color-line-soft)] leading-relaxed">
            {PYTHON_SNIPPET}
          </pre>
        </div>

        <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-[var(--color-muted)]" />
              <span className="text-xs font-bold text-[var(--color-fg)]">Post from the shell</span>
            </div>
            {info && (
              <CopyButton
                copied={copied === "curl"}
                onCopy={() => copy(info.curl_example, "curl")}
                label="Copy"
              />
            )}
          </div>
          <pre className="rounded bg-[var(--color-bg)] p-3 text-2xs font-mono text-[var(--color-muted)] overflow-x-auto border border-[var(--color-line-soft)] leading-relaxed whitespace-pre-wrap">
            {info ? info.curl_example : <Skeleton className="h-16 w-full" />}
          </pre>
        </div>
      </div>

      {info && (
        <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-[var(--color-fg)]">Every field it accepts</span>
            <CopyButton
              copied={copied === "payload"}
              onCopy={() => copy(JSON.stringify(info.sample_payload, null, 2), "payload")}
              label="Copy"
            />
          </div>
          <pre className="rounded bg-[var(--color-bg)] p-3 text-2xs font-mono text-[var(--color-muted)] overflow-x-auto border border-[var(--color-line-soft)] leading-relaxed max-h-72 overflow-y-auto">
            {JSON.stringify(info.sample_payload, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}
