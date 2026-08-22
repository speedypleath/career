"use client"

import { useState, useEffect } from "react"
import {
  Settings,
  Mail,
  Database,
  Check,
  Save,
  Globe,
  Radio,
  Clock,
  ShieldCheck,
  RefreshCw,
  Sparkles
} from "lucide-react"
import { StatusDot } from "./StatusDot"
import type { EmailSettings } from "@/types"

export function SettingsView() {
  const [settings, setSettings] = useState<EmailSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const [gmailAccount, setGmailAccount] = useState("owner@example.com")
  const [imapHost, setImapHost] = useState("imap.gmail.com")
  const [imapPort, setImapPort] = useState(993)
  const [imapUser, setImapUser] = useState("owner@example.com")
  const [imapPassword, setImapPassword] = useState("")
  const [autoSync, setAutoSync] = useState(true)
  const [syncInterval, setSyncInterval] = useState(60)

  async function loadSettings() {
    setLoading(true)
    try {
      const res = await fetch("/api/email/settings")
      const data = await res.json()
      if (data.settings) {
        setSettings(data.settings)
        setGmailAccount(data.settings.gmail_account || "owner@example.com")
        setImapHost(data.settings.imap_host || "imap.gmail.com")
        setImapPort(data.settings.imap_port || 993)
        setImapUser(data.settings.imap_user || "owner@example.com")
        setAutoSync(data.settings.auto_sync ?? true)
        setSyncInterval(data.settings.sync_interval_mins || 60)
      }
    } catch (err) {
      console.error("Failed to load settings:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSettings()
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveSuccess(false)
    try {
      const res = await fetch("/api/email/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gmail_account: gmailAccount,
          imap_host: imapHost,
          imap_port: imapPort,
          imap_user: imapUser,
          imap_password: imapPassword || undefined,
          auto_sync: autoSync,
          sync_interval_mins: syncInterval,
        }),
      })
      if (res.ok) {
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
        loadSettings()
      }
    } catch (err) {
      console.error("Failed to save settings:", err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-[var(--color-fg)]">
            System & Radar Settings
          </h1>
          <p className="text-xs text-[var(--color-muted)]">
            Configure Gmail monitoring, IMAP credentials, and automated ingestion intervals
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Email Scanner Config */}
        <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-[var(--color-line-soft)] pb-3">
            <Mail className="h-4 w-4 text-[var(--color-accent)]" />
            <h2 className="text-sm font-bold text-[var(--color-fg)]">Email Ingestion & Scanning</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label block mb-1">Primary Gmail Account</label>
              <input
                type="email"
                value={gmailAccount}
                onChange={(e) => setGmailAccount(e.target.value)}
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-2 text-xs text-[var(--color-fg)] focus:border-[var(--color-accent)] focus:outline-none"
              />
              <p className="text-[10px] text-[var(--color-faint)] mt-1">Used by gog CLI and classification engine</p>
            </div>

            <div>
              <label className="label block mb-1">Sync Interval (Minutes)</label>
              <input
                type="number"
                min="5"
                max="1440"
                value={syncInterval}
                onChange={(e) => setSyncInterval(Number(e.target.value))}
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-2 text-xs text-[var(--color-fg)] focus:border-[var(--color-accent)] focus:outline-none font-mono"
              />
            </div>
          </div>

          <div className="border-t border-[var(--color-line-soft)] pt-3 space-y-3">
            <span className="label">IMAP Fallback Configuration (Optional)</span>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] text-[var(--color-muted)] block mb-1">IMAP Host</label>
                <input
                  type="text"
                  value={imapHost}
                  onChange={(e) => setImapHost(e.target.value)}
                  placeholder="imap.gmail.com"
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-2 text-xs text-[var(--color-fg)] focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-[var(--color-muted)] block mb-1">IMAP Port</label>
                <input
                  type="number"
                  value={imapPort}
                  onChange={(e) => setImapPort(Number(e.target.value))}
                  placeholder="993"
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-2 text-xs text-[var(--color-fg)] focus:outline-none font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] text-[var(--color-muted)] block mb-1">App Password</label>
                <input
                  type="password"
                  value={imapPassword}
                  onChange={(e) => setImapPassword(e.target.value)}
                  placeholder="••••••••••••••••"
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-2 text-xs text-[var(--color-fg)] focus:outline-none font-mono"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Tailscale & Infrastructure Info */}
        <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5 space-y-3">
          <div className="flex items-center gap-2 border-b border-[var(--color-line-soft)] pb-3">
            <Radio className="h-4 w-4 text-[var(--color-accent)]" />
            <h2 className="text-sm font-bold text-[var(--color-fg)]">Tailscale & Network Exposure</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="rounded border border-[var(--color-line-soft)] bg-[var(--color-bg)] p-3 space-y-1">
              <span className="label text-[9px]">Tailscale Domain</span>
              <div className="font-mono text-[var(--color-fg)]">your-app.your-tailnet.ts.net</div>
              <div className="text-[10px] text-emerald-400">Serving on Tailnet via Reverse Proxy</div>
            </div>

            <div className="rounded border border-[var(--color-line-soft)] bg-[var(--color-bg)] p-3 space-y-1">
              <span className="label text-[9px]">Database Storage</span>
              <div className="font-mono text-[var(--color-fg)]">PostgreSQL: career (port 5432)</div>
              <div className="text-[10px] text-[var(--color-faint)]">Local persistent volume</div>
            </div>
          </div>
        </div>

        {/* Save Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          {saveSuccess && (
            <span className="flex items-center gap-1 text-xs text-emerald-400 font-semibold">
              <Check className="h-4 w-4" /> Settings updated successfully
            </span>
          )}
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded bg-[var(--color-accent)] px-4 py-2 text-xs font-semibold text-[#0b0c0f] shadow-sm hover:bg-[var(--color-accent)]/90 disabled:opacity-50 transition-all"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </form>
    </div>
  )
}
