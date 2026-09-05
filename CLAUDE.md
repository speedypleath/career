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
classifier change. `npm run build` is also the only type-check gate — `tsconfig`
sets `noEmit`, so nothing else runs `tsc`. Additionally, `node scripts/eval-classifier.ts` re-classifies
every stored email and diffs against what is saved — run it before and after
touching classification rules; `node scripts/debug-classify.ts "<subject fragment>"`
prints the rule trace for up to 3 matching stored emails.

Scripts read `PG*` / `DATABASE_URL` straight off the environment, and `.env`
uses `export` prefixes plus `${VAR}` interpolation that dotenv does not expand.
So the shell has to source it first — this is also why every `.vscode/launch.json`
config is `node-terminal` rather than using `envFile`:

```bash
set -a; . ./.env; set +a; node scripts/eval-classifier.ts
```

**What that gate does not cover:** it re-runs `classifyEmailDetailed` over stored
rows. It never enters `scanEmails`, so an empty diff says nothing about the four
write branches, the queue, or status advancement. For changes there, diff the
SQL templates before and after as well.

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

Next.js 16 App Router, React 19, Tailwind v4, Postgres via `pg` **and** Prisma.
No auth — single user, not meant to be exposed.

The layers, front to back:

- **Components** are presentational. `src/app/page.tsx` still owns the tab and
  the selected id, but each view now takes its data from a hook.
- **`src/hooks/*`** wrap `src/lib/api-client.ts` in `useAsync`, which owns the
  loading / refreshing / error / reload cycle every view used to hand-roll.
  `useDashboard` also owns the 15-second poll and the window-focus refetch.
- **`src/lib/api-client.ts`** is one typed function per endpoint. Components do
  not call `fetch`. Every route answers `{ error }` on failure, so a rejection
  carries the server's own message — surface it, don't replace it.
- **Route handlers** under `src/app/api/**` parse, delegate and return
  `ok()` / `fail()` from `src/lib/api-response.ts`. They hold no SQL.
- **`src/lib/repositories/*`** hold the queries. Prisma for ordinary CRUD on the
  app tables, and `query()` from `src/lib/db.ts` for everything Prisma models
  badly — the `finalize_email_classification` RPC, pgmq, aggregate stats.
  `db.ts` is not going away.

### The Prisma boundary

Prisma is a **client only**. `prisma/schema.prisma` is introspected, never
authored:

- **Never run `prisma migrate`.** `supabase/migrations/*.sql` owns the schema,
  the RPCs, pgmq and cron. Regenerate with `npm run db:pull`
  (`prisma db pull && prisma generate`) after a migration lands.
- The schema models the five app tables only. `email_classification_cache`,
  `sync_mapping`, `sync_events` and every pgmq table are deliberately absent.
- **Never import Prisma, `pg`, or anything from `src/lib/db.ts` into
  `supabase/functions/_shared/`** — that directory is type-checked by
  `npm run build` and also loaded by Deno.

### Pure email logic

`src/lib/email/` holds the logic that used to be unreachable from the test
runner because `email-scanner.ts` imported `./db`:

| Module | Owns |
|---|---|
| `extract.ts` | `extractCompanyName`, `extractJobTitle`, `sanitizeCompany`, `isAtsSender` |
| `mime.ts` | `htmlToText`, `looksLikeHtmlBody`, `normalizeBodyString`, `extractBodyFromGmailPayload` |
| `matching.ts` | `findBestMatchingApplication` |
| `status.ts` | `STATUS_RANK`, `shouldAdvanceStatus`, `statusForClassification`, `BLACKLISTED_COMPANY_NAMES` |
| `gog.ts` | `searchMessages`, `hydrateBodies` — the only module that shells out |

None of these import `db.ts`, and imports between them use explicit `.ts`
extensions so `node --test` can resolve them. **The extraction heuristics in
`extract.ts` are known to be wrong** in the cases `tests/email-extract.test.ts`
marks `KNOWN BAD` — those assertions encode current behaviour on purpose. Fix
the heuristic and the test together, never the expectation alone.

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

RLS is enabled on `applications`, `application_events` and `email_logs` with
**no policies** (migration `202609040004`), which locks out the anon and
authenticated roles. The app is unaffected: it connects as the table owner over
direct Postgres, and owners bypass RLS unless `FORCE ROW LEVEL SECURITY` is set.
Adding a policy there would grant access, not restrict it.

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

- The single user's Gmail address has a TypeScript home now — `OWNER_EMAIL` in
  `src/lib/owner.ts` — but the SQL half does not. `src/lib/schema.sql` and two
  migration seeds still carry the literal, and so does the local-part entry in
  `BLACKLISTED_COMPANY_NAMES` (`src/lib/email/status.ts`), which has to keep
  mirroring the RPC's inline list character for character. Changing the address
  means editing `owner.ts` *and* writing a migration. It is a fallback either
  way: `email_settings.gmail_account` wins whenever a row exists.

## Conventions

- No semicolons, double quotes, 2-space indent — match the surrounding file.
- **Never copy props into state from an effect** — `react-hooks/set-state-in-effect`
  is an error, not a warning. Seed `useState` from props at mount and let the
  parent `key` the child on the record id so a new record remounts it
  (`EditForm`, `SettingsForm`).
- `buildApplicationUpdate` drops `undefined` keys, so a field omitted from a
  PATCH is left unwritten. A form with no control for a column should omit it,
  not round-trip a stale copy.
- Design tokens: the accent has one job — the thing to act on. Nav, healthy
  services, focus rings and selection are monochrome; only warn/danger carry
  other colour. No arbitrary `text-[Npx]`: use `--text-3xs` / `--text-2xs`
  below Tailwind's `xs`. The `.label` eyebrow utility is gone; don't reinstate it.
- zsh does not word-split unquoted `$(...)`, and macOS `sed -i` needs an empty
  backup arg. Bulk edits:
  `grep -rl PAT src --include='*.tsx' | tr '\n' '\0' | xargs -0 sed -i '' -e 's/…/…/g'`
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
