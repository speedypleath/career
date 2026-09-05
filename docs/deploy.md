# Deploying

`main` is deployed automatically by `.github/workflows/deploy.yml`. This document
is the runbook: what the pipeline does, the one-time setup it depends on, how to
run it the first time, how to roll back, and what to check when a job fails.

## Overview

One workflow, `.github/workflows/deploy.yml`, with three jobs:

| Job | Runs on | What it does |
|---|---|---|
| `verify` | every PR, every `main` push, `workflow_dispatch` | `npm ci` → `npm run lint` → `npm run build` (the only type-check gate — `tsconfig` has `noEmit`) → `npm test`. |
| `supabase` | `main` push / dispatch only, after `verify` | `supabase link` → `supabase db push` → `supabase functions deploy email-classifier-worker` → `supabase secrets set` for the two Cloudflare vars. |
| `deploy` | `main` push / dispatch only, after `verify` **and** `supabase` | Joins the tailnet with `tailscale/github-action`, SSHes to the mini, pipes `scripts/deploy-on-mini.sh` to `bash -s`. That script resets to `origin/main`, sources `.env`, `npm ci`, `npm run build`, restarts the launchd job, and blocks on a local HTTP health probe. |

**Ordering rationale:** `supabase` runs before `deploy` so the database schema and
the edge function are always at or ahead of the app code that expects them. PRs
run `verify` only — `supabase` and `deploy` are *skipped* (not failed) because of
their `if:` guard on `github.ref == 'refs/heads/main'`.

Concurrency: `deploy` uses group `deploy-mini` with `cancel-in-progress: false`,
so two `main` pushes back-to-back queue on the mini instead of racing.

## What "Cloudflare settings" means here

There is **no Cloudflare Worker or Pages project** in this repo. The only
Cloudflare state the pipeline manages is two Supabase Edge Function secrets —
`CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` — that
`supabase/functions/email-classifier-worker/index.ts` reads via `Deno.env` to
call Workers AI (`@cf/meta/llama-3.2-1b-instruct`). The `supabase` job's
"Sync edge-function secrets" step writes them with `supabase secrets set
--env-file` (a temp file, so the values never appear on a command line).

## Not managed by the pipeline

- **Supabase Vault entries `project_url` / `anon_key`** — required for the pgmq
  wake-up and the `email-classifier-recovery` cron. If they are missing, queued
  classification silently no-ops. Add them in the dashboard: Project Settings →
  Vault. Verify with `select name from vault.secrets order by name;`.
- **The `gog` Google Workspace CLI auth on the mini** — the email scanner shells
  out to it. Re-authenticate on the mini directly when it lapses.
- **The launchd plist's `PG*` env** (`~/Library/LaunchAgents/com.openclaw.career.plist`)
  — owned by `scripts/repoint-career-supabase.sh`, not this pipeline. The plist,
  not `.env`, is what the running service reads for its database connection.
  `scripts/deploy-on-mini.sh` sources `.env` only for *build-time* env
  (`prisma generate`, `next build`).

## One-time setup

### 1. Rotate credentials

The secrets below were previously plaintext in a git-ignored `.env` and were
exposed in a planning session transcript. Rotate before wiring up CI:

- Supabase → Account → Access Tokens → revoke the old `sbp_…` token, create a new one.
- Supabase → Project `openclaw` → Project Settings → Database → reset the database password.
- Cloudflare → My Profile → API Tokens → roll the token; the replacement needs only **Workers AI → Read**.
- Update the mini's `~/Projects/career/.env` with the new values. Keep the
  `export` / `${VAR}` style — it is consumed as `set -a; . ./.env; set +a`.

### 2. Tailscale auth key

Tailscale admin console → Settings → Keys → Generate auth key:

- **Reusable**: on. **Ephemeral**: on (the CI node auto-removes after each run).
  **Pre-approved**: on if the tailnet has device approval enabled.
- **Tag**: leave unset. The node then registers under your user identity, which
  the tailnet's allow-all access rule (`{ "src": ["*"], "dst": ["*"], "ip": ["*"] }`)
  already covers. No `tagOwners` / policy edit is needed for this route.
- Expiry is **≤90 days**. Set a calendar reminder to regenerate and update the
  `TS_AUTHKEY` secret before it lapses — a stale key fails the `deploy` job at
  "Connect to Tailscale".

*Alternative (non-expiring):* add `"tagOwners": { "tag:ci": ["autogroup:admin"] }`
to the policy file (this does not change access — the allow-all rule stays),
create an OAuth client with the `auth_keys` scope and the now-selectable
`tag:ci` tag, and swap the workflow's `authkey` line for
`oauth-client-id` / `oauth-secret` + `tags: tag:ci`.

### 3. SSH on the mini

- Mini: System Settings → General → Sharing → Remote Login → On, limited to user `speedypleath`.
- On a trusted machine: `ssh-keygen -t ed25519 -f career-ci -N "" -C "career-ci"`.
- Append `career-ci.pub` to the mini's `~/.ssh/authorized_keys`.
- Verify from another tailnet device:
  `ssh -i career-ci speedypleath@andreis-mac-mini.taile5b997.ts.net 'echo ok'`.
- Capture the host key for pinning:
  `ssh-keyscan -t ed25519 andreis-mac-mini.taile5b997.ts.net`.

### 4. GitHub `production` Environment

Repo → Settings → Environments → New environment → `production`. No required
reviewers (deploy is automatic). Optionally restrict to the `main` branch.

### 5. GitHub repo secrets

Settings → Secrets and variables → Actions → **Secrets**. Multiline values (the
SSH key) paste verbatim — GitHub accepts them as-is, no escaping or base64.

| Secret | Value |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | new `sbp_…` token |
| `SUPABASE_DB_PASSWORD` | new database password |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account id |
| `CLOUDFLARE_API_TOKEN` | new Workers-AI-Read token |
| `TS_AUTHKEY` | `tskey-auth-…` reusable ephemeral key (OAuth route instead: `TS_OAUTH_CLIENT_ID` + `TS_OAUTH_SECRET`) |
| `MINI_SSH_KEY` | full contents of the `career-ci` private key file (all lines, incl. `BEGIN`/`END`, trailing newline) |
| `MINI_SSH_HOSTKEY` | one line from `ssh-keyscan -t ed25519 …` (host key pinning) |

### 6. GitHub repo variables

Same page → **Variables**.

| Variable | Value |
|---|---|
| `SUPABASE_PROJECT_REF` | `mvmteuwwvahkicsybxsl` |
| `MINI_SSH_HOST` | `andreis-mac-mini.taile5b997.ts.net` |
| `MINI_SSH_USER` | `speedypleath` |

### 7. Reconcile Supabase migration history

So the first automated `db push` is a no-op:

```bash
set -a; . ./.env; set +a
npx supabase@latest link --project-ref mvmteuwwvahkicsybxsl
npx supabase@latest migration list --linked
```

All four `202609040001…202609040004` migrations should show as applied both
locally and remotely. If remote is behind, run `npx supabase@latest db push`
once by hand and re-check before enabling the pipeline. If history has drifted,
reconcile with `npx supabase@latest migration repair`.

## First-run checklist

1. `npx supabase@latest migration list --linked` is clean.
2. `select name from vault.secrets order by name;` returns `anon_key`, `project_url`.
3. All secrets and variables from the tables above are set; the `production`
   Environment exists.
4. Actions → `deploy` → **Run workflow** on `main` (`workflow_dispatch`). Watch
   each job:
   - `verify`: `npm ci` → lint → build → test, all green.
   - `supabase`: `db push` reports "Remote database is up to date"; `functions
     deploy` reports a new `email-classifier-worker` version; `secrets set`
     reports two names set.
   - `deploy`: "Connect to Tailscale" acquires an IP; "Redeploy on the Mac mini"
     streams `==> Resetting to origin/main` … `==> Healthy` and exits 0.
5. On the mini:
   ```bash
   launchctl print "gui/$(id -u)/com.openclaw.career" | grep -E 'state =|pid ='
   git -C ~/Projects/career log --oneline -1        # matches the deployed commit
   curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8098/        # 200
   ```
6. Unauthenticated `GET` of
   `https://mvmteuwwvahkicsybxsl.supabase.co/functions/v1/email-classifier-worker`
   returns `401` (deployed, env present) — not `404` (not deployed) or `503`
   with `has*: false` (Cloudflare secrets did not take).

## Rollback

**App** — redeploy a known-good commit on the mini:

```bash
ssh speedypleath@andreis-mac-mini.taile5b997.ts.net \
  'cd ~/Projects/career && git fetch origin && git checkout -f -B main <good-sha> && \
   set -a; . ./.env; set +a && npm ci && npm run build && \
   launchctl kickstart -k gui/$(id -u)/com.openclaw.career'
```

**Supabase migrations** are forward-only. A bad migration needs a *new*
corrective migration containing the complete object (same pattern as the three
`create or replace`s of `finalize_email_classification` — diff against
`202609040003` first). Never `prisma migrate`; never hand-edit migration history.

**Classifier kill switch** (useful during an incident, unrelated to deploy): set
`EMAIL_CLASSIFIER_MAX_CALLS_PER_SCAN=0` — deterministic classification keeps
working, model jobs stop.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `db push` wants to re-apply migrations | History drift. Reconcile with `supabase migration repair`, then re-run. |
| Edge function returns `503` with `has*: false` | The "Sync edge-function secrets" step did not run, or the Cloudflare secret values are wrong. Re-check `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN`. |
| `deploy` step: "Host key verification failed" | The mini's host key changed. Re-capture with `ssh-keyscan -t ed25519 …` and update `MINI_SSH_HOSTKEY`. |
| `deploy` step: "Connect to Tailscale" fails | `TS_AUTHKEY` expired (≤90-day lifetime) or was revoked. Generate a new reusable ephemeral key and update the secret. |
| `kickstart`: "Could not find service" | No active GUI session on the mini. The script already falls back to `bootout` → `bootstrap` → `kickstart`; if that also fails, log in to the mini's desktop session once. |
| Health probe times out after 60s | The app started but is not answering on `:8098`. Check `~/Projects/career/logs/server.log` and `launchctl print gui/$(id -u)/com.openclaw.career`. |
| `config.toml` warning about `schemas/*.sql` | Harmless — `[db.migrations] schema_paths` points at a directory that does not exist. Optional cleanup in a separate change. |
