# Career

A private job-application tracker with an **Email Radar** that reads Gmail, works
out what each reply actually means, and moves applications through a pipeline
without manual data entry.

Runs locally on port `8098`, backed by Postgres. Single user, no auth — it is not
meant to be exposed publicly.

- [Stack](#stack)
- [Running it](#running-it)
- [Deploying](#deploying)
- [Data model](#data-model)
- [Email Radar](#email-radar)
- [HTTP API](#http-api)
- [Scripts](#scripts)

## Stack

| Piece | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | React 19, Tailwind v4, `lucide-react` |
| Database | Postgres via `pg` |
| Gmail access | the `gog` Google Workspace CLI, shelled out from the scanner |

There is no ORM and no API-client layer: routes call `query()` from
`src/lib/db.ts` directly, and the client fetches its own routes.

## Running it

Postgres connection comes from the standard `PG*` environment variables. Every
one has a local-dev default, so an out-of-the-box local Postgres needs no config:

| Variable | Default |
| --- | --- |
| `PGHOST` | `127.0.0.1` |
| `PGPORT` | `5432` |
| `PGUSER` | `postgres` |
| `PGPASSWORD` | `postgres` |
| `PGDATABASE` | `career` |

Set them in `.env.local` (git-ignored) for anything other than the defaults.

```bash
createdb career
psql career -f src/lib/schema.sql   # idempotent: CREATE TABLE IF NOT EXISTS + ALTER ... IF NOT EXISTS

npm install
npm run dev                         # http://localhost:8098
```

Production-ish, as it runs on the Mac mini:

```bash
npm run build
scripts/start.sh                    # nohup npm start, logs to logs/server.log
scripts/stop.sh
```

Gmail scanning additionally needs `gog` on `PATH` and an authorised account:

```bash
gog auth login          # or: gog auth add <email>
```

The account defaults to the one stored in `email_settings`; when the token
expires the scan does not fail silently — the API returns the re-auth
instruction in `errors[]` and the UI shows it in a banner.

## Deploying

`main` is deployed automatically by `.github/workflows/deploy.yml` — `verify`
(lint, build type-gate, tests) on every PR, then `supabase` (migrations, edge
function, Cloudflare secrets) and `deploy` (Tailscale + SSH redeploy on the Mac
mini) on every push to `main`. Setup, first run, and rollback are in
[`docs/deploy.md`](docs/deploy.md).

## Data model

`src/lib/schema.sql` is the source of truth and is safe to re-run.

- **`applications`** — one row per role. `status` is one of `wishlist`,
  `applied`, `interview_pending`, `interviewing`, `technical_assessment`,
  `offer`, `rejected`, `archived`.
- **`application_events`** — append-only timeline (status changes, detected
  emails, auto-created applications).
- **`email_logs`** — every scanned message with its `classification` and a
  `manual_override` flag.
- **`email_settings`** — single-row config for the Gmail account and IMAP
  fallback fields.

## Email Radar

The scanner (`src/lib/email-scanner.ts`) searches Gmail through `gog`, hydrates
message bodies, classifies each one, matches it to an existing application (or
creates one), and advances that application's status.

Two rules keep it from making a mess of the pipeline:

- **Status never rewinds.** Transitions are ranked, so a confirmation that
  arrives after an interview invitation cannot drag the application back to
  `applied`. `rejected` is exempt — it can arrive at any stage and always wins.
- **Human corrections are permanent.** Changing a classification in the UI sets
  `manual_override`, and rescans skip those rows entirely.

Classification itself is documented separately, including how to evaluate
changes against the stored corpus before shipping them:

**→ [`docs/email-classifier.md`](docs/email-classifier.md)**

## HTTP API

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/applications` | `GET`, `POST` | List and create applications |
| `/api/applications/[id]` | `GET`, `PATCH`, `DELETE` | Read, update, remove one |
| `/api/stats` | `GET` | Counts, funnel and recent events for the overview |
| `/api/email/logs` | `GET`, `PATCH` | Scanned mail; `PATCH` records a manual classification |
| `/api/email/scan` | `GET` | Run a Gmail scan; `POST` logs a single message |
| `/api/email/settings` | `GET`, `PATCH` | Gmail/IMAP settings |
| `/api/webhook/application` | `GET`, `POST` | Ingest an application from an external source |

`/api/email/scan` returns `scannedCount`, `matchedCount`, `skippedCount` and
`newEmails[]`, plus a non-fatal `errors[]` — an empty result with a populated
`errors[]` means the scan was blocked, not that there was no mail.

## Scripts

| Script | What it does |
| --- | --- |
| `scripts/eval-classifier.ts` | Re-classifies every stored email and diffs against what is saved. Run before and after any classifier change. |
| `scripts/debug-classify.ts` | Prints the full rule trace for one stored email. |
| `scripts/backfill-html-bodies.ts` | One-off: flattens `email_logs.snippet` rows that were stored as raw HTML. |
| `scripts/seed-pipeline.cjs` | Seeds sample applications. |
| `scripts/notify-career-app.py` | Webhook notifier used by cron. |

These are standalone Node scripts run directly (`node scripts/eval-classifier.ts`)
and are excluded from the Next build's `tsconfig.json`.
