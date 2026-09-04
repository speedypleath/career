# Email classifier architecture

The classifier uses a minimal-token asynchronous cascade:

1. The Next.js scanner normalizes each email and applies deterministic noise and explicit-outcome rules.
2. Obvious decisions complete immediately with zero model tokens.
3. Only ambiguous messages are saved as `pending` and sent to the private Supabase `pgmq` queue.
4. The `email-classifier-worker` Edge Function consumes five jobs at a time and checks the 30-day prompt-hash cache.
5. Cache misses call Cloudflare Workers AI using `@cf/meta/llama-3.2-1b-instruct`.
6. The worker finalizes `email_logs`, links or creates the application, advances its status when appropriate, and deletes the queue message.
7. Failed messages become visible after 60 seconds. After three failed deliveries they are marked `failed` and archived.

The queue insert wakes the Edge Function through `pg_net`. Supabase Cron also invokes it once per minute so a missed wake-up cannot strand work.

## Token and request budgets

- Maximum estimated input: 1,100 tokens, including the system prompt.
- Maximum output: 3 tokens; only a single digit from `0` through `6` is accepted.
- Maximum queued classifications per Gmail scan: 12 by default.
- The queue payload contains the bounded prompt and operational metadata, never the full email body.
- Repeated bounded prompts use the database cache and consume no Cloudflare tokens.

`EMAIL_CLASSIFIER_MAX_CALLS_PER_SCAN` can lower or raise the per-scan queue ceiling. Set it to `0` to keep deterministic classification while disabling new model jobs.

## Required Supabase configuration

Apply `supabase/migrations/202609040001_email_classification_queue.sql`, then configure:

### Edge Function secrets

- `CLOUDFLARE_API_TOKEN` — Cloudflare API token restricted to Workers AI Read.
- `CLOUDFLARE_ACCOUNT_ID` — account used in the Workers AI endpoint.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are supplied automatically by the hosted Edge Function runtime.

### Vault entries

The immediate wake-up and Cron recovery function read these Supabase Vault entries:

- `project_url` — the project URL, such as `https://<project-ref>.supabase.co`.
- `anon_key` — the project publishable/anonymous key used by the database to invoke the JWT-protected Edge Function.

No credential belongs in source, migrations, logs, or client bundles.

## Deployment

Use a pinned Supabase CLI version:

```bash
npx supabase@latest link --project-ref <project-ref>
npx supabase@latest db push
npx supabase@latest functions deploy email-classifier-worker
```

Set Edge Function secrets through the Supabase Dashboard or a protected credential-injection workflow. Do not pass credentials as command-line arguments.

## Verification

```bash
npm run test:classifier
npm run build
```

The automated tests prove deterministic zero-token exits, the 1,100-token prompt ceiling, queue payload minimization, strict one-digit parsing, and the Cloudflare three-token output cap.

For a live smoke test, enqueue one synthetic ambiguous message, invoke the function, and verify that:

- the queue message disappears;
- `email_logs.classification_state` becomes `resolved`;
- `classification_source` is `cloudflare` or `cache`;
- token usage columns are populated when Cloudflare returns usage data.

## Rollback

Set `EMAIL_CLASSIFIER_MAX_CALLS_PER_SCAN=0` to stop creating model jobs immediately. Deterministic classifications continue working. The migration is additive; existing `email_logs` and application data remain valid if the Edge Function and Cron job are disabled.
