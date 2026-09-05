# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev                  # Next.js dev server on port 8098 (Turbopack)
npm run build                # production build — also the type-check gate (tsconfig has noEmit)
npm run lint                 # eslint (flat config comes from eslint-config-next)
npm test                     # jest (all 9 suites); needs --experimental-vm-modules, which the script sets
npm run test:node            # the same suites under node --test, no dependencies
npm run test:classifier      # node --test, classifier suite only

# one test: npm test -- -t "noise exits"
# or:       node --test --experimental-strip-types --test-name-pattern "noise exits" tests/email-classifier.test.ts

scripts/start.sh             # nohup npm start -> logs/server.log; refuses if 8098 is busy
scripts/stop.sh
```

`npm run test:classifier` + `npm run build` is the verification pair for any
classifier change. Additionally, `node scripts/eval-classifier.ts` re-classifies
every stored email and diffs against what is saved — run it before and after
touching classification rules; `node scripts/debug-classify.ts "<subject fragment>"`
prints the rule trace for up to 3 matching stored emails.

## Deployment shape

The app runs on a Mac mini as launchd job `com.openclaw.career`, pointed at a
hosted Supabase Postgres (`scripts/repoint-career-supabase.sh` rewrites the
plist's `PG*` env). So there are two Postgres targets: a plain local `career`
database, and Supabase. Scripts differ in which they default to — `eval-classifier`,
`debug-classify`, `backfill-html-bodies`, `postgres-migration-inventory` default to
localhost; `reclassify-all`, `requeue-failed-emails` and `clean-bogus-apps` default
to the Supabase pooler (`aws-1-eu-west-1.pooler.supabase.com`). Check the top of a
script before running it. Connecting to Supabase also needs `PGSSLMODE=require` —
`src/lib/db.ts` only enables TLS when that is set.

Supabase-side deploy:

```bash
npx supabase@latest db push
npx supabase@latest functions deploy email-classifier-worker
```

## Architecture

Next.js 16 App Router, React 19, Tailwind v4, Postgres via `pg`. No ORM, no
API-client layer, no auth — single user, not meant to be exposed. Route handlers
call `query()` from `src/lib/db.ts` with raw SQL; the client (`src/app/page.tsx`,
one `"use client"` shell owning all state) fetches its own `/api/*` routes.

### The classification cascade

This is the part that spans files. An email flows:

1. **`src/lib/email-scanner.ts`** (`scanEmails`) shells out to the `gog` Google
   Workspace CLI twice per message: one `gog gmail search` (hardcoded
   `newer_than:90d` OR-query, `--max 200`) then a `gog gmail get --format full`
   per hit to hydrate the body (concurrency 6, body truncated to 8000 chars).
   `gog` failures surface as strings in `ScanResult.errors[]` — a scan with 0
   results and a populated `errors[]` means *blocked*, not *no mail*.
2. **`src/lib/email-classifier.ts`** (`classifyEmailDetailed`) normalizes and
   applies deterministic gates and strong regex rules. Most mail exits here with
   `modelUsed: false` and zero tokens. `source` records which layer decided:
   `gate` | `rule` | `fallback` | `queue` | `cloudflare` | `cache`.
3. Ambiguous mail (`source: "fallback"`) is written as `classification_state = 'pending'`
   and enqueued via **`src/lib/email-classification-queue.ts`** into the Supabase
   `pgmq` queue `email_classification_jobs`. The payload carries only the bounded
   prompt + metadata — **never the full body**. `buildClassificationJob` throws if
   the prompt exceeds `MAX_MODEL_INPUT_TOKENS`. Per-scan ceiling is
   `EMAIL_CLASSIFIER_MAX_CALLS_PER_SCAN` (default `MAX_QUEUED_CLASSIFICATIONS_PER_SCAN`
   = 12; `0` disables model jobs while keeping deterministic classification —
   this is the rollback lever). If the enqueue fails the pending row is deleted
   again so the message falls through to the conservative fallback.
4. **`supabase/functions/email-classifier-worker/index.ts`** (Deno Edge Function)
   reads 5 jobs at a time, checks the 30-day `email_classification_cache`
   prompt-hash cache, and on a miss calls Cloudflare Workers AI
   (`@cf/meta/llama-3.2-1b-instruct`). After 3 failed reads a job is marked
   `failed` and archived.
5. The worker calls the `finalize_email_classification` RPC, which does all the
   writes in one transaction: resolve `email_logs`, link or create the
   application, advance status. **Business rules live in that SQL function**, not
   only in TS — see migration `202609040003`.

`supabase/functions/_shared/cloudflare-classifier.ts` is imported by *both* the
Deno function and the Node-side classifier/tests. It owns `SYSTEM_PROMPT`, the
digit↔label mapping, `MAX_MODEL_OUTPUT_TOKENS`, and `parseClassification`
(the 1B model is chatty, so parsing tolerates prose around the digit).

Adding or renaming a classification label means editing, in lockstep:
`CLASSIFICATION_LABELS` + `SYSTEM_PROMPT` in `_shared/cloudflare-classifier.ts`,
`EmailClassification` and `LABELS` in `src/lib/email-classifier.ts`,
`EmailLog["classification"]` in `src/types.ts`, and the check constraint plus the
validation list and `case` arms inside `finalize_email_classification`.

### Logic duplicated between TypeScript and SQL

The scanner path (TS) and the queued worker path (SQL RPC) each classify, link
and advance an application independently, so several rules exist twice and must
be edited together:

- `STATUS_RANK` / `shouldAdvanceStatus` in `email-scanner.ts` ↔ the
  `current_rank` / `next_rank` `case` expressions in the RPC.
- `statusForClassification` (including the "question while `applied` →
  `interview_pending`" special case) ↔ the RPC's `next_status` `case`.
- `BLACKLISTED_COMPANY_NAMES` in `email-scanner.ts` ↔ the inline
  `lower(extracted_company) not in (...)` list in the RPC.

### Two invariants the pipeline depends on

- **Status never rewinds.** A late confirmation cannot drag an interviewing
  application back to `applied`. `rejected` is the exception: it wins from any
  stage; `rejected` and `archived` are terminal for everything else.
- **Human corrections are permanent.** A UI classification change sets
  `email_logs.manual_override`; rescans, the reanalyze route, and the worker all
  bail out on that flag before writing.

### Schema and migrations

`src/lib/schema.sql` is the source of truth for the app tables and is safe to
re-run (`CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`).
`supabase/migrations/*.sql` layer the queue, RPCs, cron and guardrails on top —
they are Supabase-only and additive. New app columns go in *both* schema.sql and
a migration.

`finalize_email_classification` is `create or replace`d by **all three**
migrations, so the last one applied wins and the whole body is copy-pasted each
time. Changing it means writing a new migration containing the complete function,
not a patch — and diffing against `202609040003` first, because
`202609040002`'s version wrote `public.email_summaries` and `202609040003`
dropped that write when it replaced the function.

### Known drift

- `docs/email-classifier.md` describes the cascade but its numbers are stale:
  it says 1,100 input tokens (actual `MAX_MODEL_INPUT_TOKENS` = 1,500), 3 output
  tokens (actual `MAX_MODEL_OUTPUT_TOKENS` = 16) and digits `0`–`6` (actual
  `0`–`7`, since `conference` was added). Trust the constants.
- The single user's Gmail address is hardcoded as a fallback in ~8 places
  (a classifier gate for outbound mail, the scanner's account default, the scan
  route's default recipient, `SettingsView`, `schema.sql`, migration seeds).
  There is no config knob for it; grep before assuming one edit is enough.

## Conventions

- No semicolons, double quotes, 2-space indent — match the surrounding file.
- `@/*` maps to `src/*`. `scripts/` and `supabase/functions/email-classifier-worker`
  are excluded from the Next `tsconfig`, so they run standalone
  (`node scripts/x.ts`, type-stripped) and can use Deno/`npm:` imports.
  `supabase/functions/_shared/` is **not** excluded — it is type-checked by
  `npm run build`, so it must stay free of Deno globals and `npm:` specifiers.
- Cross-directory imports into `supabase/functions/_shared/` use explicit `.ts`
  extensions (`allowImportingTsExtensions`), which is what lets the same file
  load under Deno and under `node --experimental-strip-types`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
