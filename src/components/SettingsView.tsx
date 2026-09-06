"use client"

import { useState } from "react"
import { Check, Mail, Radio, Save } from "lucide-react"
import { ErrorBanner } from "./ErrorBanner"
import { Skeleton } from "./Skeleton"
import { updateEmailSettings } from "@/lib/api-client"
import { useEmailSettings } from "@/hooks/useEmailSettings"
import type { EmailSettings } from "@/types"

const SAVED_MS = 3_000

interface SettingsFormProps {
  settings: EmailSettings
  onSaved: () => void
  onError: (message: string | null) => void
}

/**
 * Seeded from the stored settings once, at mount. The view below renders this
 * only after they arrive and keys it on their id, so a reload remounts the form
 * instead of copying props into state from an effect.
 *
 * The password box always starts empty: an empty box means "leave the stored
 * password alone", never "clear it".
 */
function SettingsForm({ settings, onSaved, onError }: SettingsFormProps) {
  // settings.gmail_account is never actually empty — the repository falls
  // back to OWNER_EMAIL server-side before this prop ever reaches the client
  // (src/lib/repositories/settings.ts). No client-side fallback needed here,
  // which also avoids reading OWNER_EMAIL (a non-NEXT_PUBLIC_ env var) in
  // client-rendered code, where it would silently read as undefined.
  const [gmailAccount, setGmailAccount] = useState(settings.gmail_account)
  const [imapHost, setImapHost] = useState(settings.imap_host || "imap.gmail.com")
  const [imapPort, setImapPort] = useState(settings.imap_port || 993)
  const [imapPassword, setImapPassword] = useState("")
  const [syncInterval, setSyncInterval] = useState(settings.sync_interval_mins || 60)

  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveSuccess(false)
    onError(null)
    try {
      await updateEmailSettings({
        gmail_account: gmailAccount,
        imap_host: imapHost,
        imap_port: imapPort,
        imap_user: settings.imap_user || gmailAccount,
        imap_password: imapPassword || undefined,
        auto_sync: settings.auto_sync ?? true,
        sync_interval_mins: syncInterval,
      })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), SAVED_MS)
      onSaved()
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save your settings")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Email Scanner Config */}
      <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-[var(--color-line-soft)] pb-3">
          <Mail className="h-4 w-4 text-[var(--color-accent)]" />
          <h2 className="text-sm font-bold text-[var(--color-fg)]">Mailbox</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-2xs text-[var(--color-faint)]">Gmail account to watch</label>
            <input
              type="email"
              value={gmailAccount}
              onChange={(e) => setGmailAccount(e.target.value)}
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-2 text-xs text-[var(--color-fg)] focus:border-[var(--color-accent)] focus:outline-none"
            />
            <p className="text-3xs text-[var(--color-faint)] mt-1">The gog CLI reads this mailbox, and the classifier reads what it finds.</p>
          </div>

          <div>
            <label className="mb-1 block text-2xs text-[var(--color-faint)]">Check every (minutes)</label>
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
          <span className="text-xs font-semibold text-[var(--color-fg)]">IMAP fallback, if gog cannot reach the mailbox</span>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-3xs text-[var(--color-muted)] block mb-1">Host</label>
              <input
                type="text"
                value={imapHost}
                onChange={(e) => setImapHost(e.target.value)}
                placeholder="imap.gmail.com"
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-2 text-xs text-[var(--color-fg)] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-3xs text-[var(--color-muted)] block mb-1">Port</label>
              <input
                type="number"
                value={imapPort}
                onChange={(e) => setImapPort(Number(e.target.value))}
                placeholder="993"
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-2 text-xs text-[var(--color-fg)] focus:outline-none font-mono"
              />
            </div>
            <div>
              <label className="text-3xs text-[var(--color-muted)] block mb-1">App password</label>
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
          <h2 className="text-sm font-bold text-[var(--color-fg)]">Where this runs</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="rounded border border-[var(--color-line-soft)] bg-[var(--color-bg)] p-3 space-y-1">
            <span className="text-3xs text-[var(--color-faint)]">Reachable at</span>
            <div className="font-mono text-[var(--color-fg)]">
              {process.env.NEXT_PUBLIC_TAILSCALE_URL?.replace(/^https?:\/\//, "") || "Not configured"}
            </div>
            <div className="text-3xs text-emerald-400">Served over Tailscale</div>
          </div>

          <div className="rounded border border-[var(--color-line-soft)] bg-[var(--color-bg)] p-3 space-y-1">
            <span className="text-3xs text-[var(--color-faint)]">Data lives in</span>
            <div className="font-mono text-[var(--color-fg)]">Supabase Postgres</div>
            <div className="text-3xs text-[var(--color-faint)]">Hosted, over the connection pooler</div>
          </div>
        </div>
      </div>

      {/* Save Actions */}
      <div className="flex items-center justify-end gap-3 pt-2">
        {saveSuccess && (
          <span className="flex items-center gap-1 text-xs text-emerald-400 font-semibold">
            <Check className="h-4 w-4" /> Saved
          </span>
        )}
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 rounded bg-[var(--color-accent)] px-4 py-2 text-xs font-semibold text-[#0b0c0f] shadow-sm hover:bg-[var(--color-accent)]/90 disabled:opacity-50 transition-all"
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? "Saving" : "Save settings"}
        </button>
      </div>
    </form>
  )
}

export function SettingsView() {
  const { data: settings, loading, error, reload, setError } = useEmailSettings()

  return (
    <div className="max-w-4xl space-y-6">
      {error && <ErrorBanner message={error} retry={() => void reload()} />}

      <div>
        <h1 className="text-lg font-bold tracking-tight text-[var(--color-fg)]">Settings</h1>
        <p className="text-xs text-[var(--color-muted)]">
          Which mailbox to watch, how often to check it, and where the app keeps its data.
        </p>
      </div>

      {loading && !settings && <Skeleton className="h-64 w-full" />}

      {settings && (
        <SettingsForm
          key={settings.id}
          settings={settings}
          onSaved={() => void reload(true)}
          onError={setError}
        />
      )}
    </div>
  )
}
