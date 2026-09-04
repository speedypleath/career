# Email response classifier

`src/lib/email-classifier.ts` decides what a piece of mail means for a job
application. It replaced an ordered chain of `includes()` checks that got a lot
of mail wrong in three predictable ways:

1. A keyword anywhere in the message won, including inside boilerplate —
   *"all official communication comes from @goodtime.io"* was read as an
   **interview**.
2. Descriptions of a *future* process read as invitations —
   *"Next steps: Recruitment Screening Call — a Zoom call…"* was read as an
   **interview** rather than an acknowledgement.
3. Newsletters and job-board digests matched job vocabulary — *"I accepted the
   job offer"* inside a Glassdoor community digest was read as an **offer**.

The replacement scores evidence rather than taking the first match.

## Categories

| Category | Meaning | Application status it sets |
| --- | --- | --- |
| `offer` | An offer was extended | `offer` |
| `rejection` | Explicitly not moving forward | `rejected` |
| `interview` | A concrete invitation or booking | `interviewing` |
| `assessment` | A test, take-home or one-way video to complete | `technical_assessment` |
| `question` | Recruiter is asking the candidate something | *(no change)* |
| `confirmation` | Application received / acknowledged | `applied` |
| `unrelated` | Not about this job search | *(no change)* |

That order is also the resolution priority: on a tie, the more consequential
category wins.

## Pipeline

```
normalise → sender/shape gates → score rules → suppress by context
          → structural adjustments → resolve → corroboration gate
```

### 1. Normalise

Strips HTML, decodes entities, removes quoted replies and signature footers,
collapses whitespace, and pulls every URL out into a `links[]` array — replacing
each with a `LINK` sentinel so link *position* still counts as a
signal while the URL text cannot pollute keyword matching.

Links are kept because some senders only state the outcome in a tracking URL.
LinkedIn, for instance, says nothing in the body but links
`jobs_application_rejected`.

### 2. Gates (early `unrelated` returns)

| Gate | Rejects |
| --- | --- |
| Noise sender | Domains that only ever send digests or marketing |
| Bulk-mail shape | Digest/newsletter/transactional subject and body patterns |
| Non-job application | Conference posters, papers, grants — they use *"your application"* in exactly the same words a job does |

All three are overridden by explicit personal application context or a LinkedIn
rejection tag, so a real reply is never silently dropped.

### 3. Rules and context suppression

Each rule is a weighted regex with a scope (`subject`, `body` or both). A match
is scored against **its own sentence**, not the whole message, and then damped
when that sentence is not asserting anything:

| Context | Multiplier |
| --- | --- |
| Hypothetical (*"if you are selected…"*) | ×0.15 |
| Future process (*"the next stage will be…"*) | ×0.25 |
| Inside a "what happens next" section | ×0.2 |

A genuine invitation survives the process-section damping because it carries a
booking link.

Rejection boilerplate is removed before rejection rules run, which is what stops
*"we will keep your CV on file should another role…"* from reading as a
rejection on its own.

### 4. Structural adjustments

- **Interviews need a hook.** Warm language alone is ×0.45; a real one has a
  calendar invite, a booking link, an availability request or an explicit
  invitation.
- **Assessments need a hook.** A known assessment platform, a link, or an
  explicit instruction to complete something — otherwise ×0.5.
- **Echoed application forms don't ask questions.** ATS acknowledgements that
  quote the submitted form back get `question` and `assessment` ×0.2.
- **A weak "unfortunately" doesn't beat a clear acknowledgement** (×0.4), and a
  real rejection outranks the acknowledgement it is bundled with (×0.35 on
  `confirmation`).

### 5. Resolve and corroborate

The winner must clear `MIN_SCORE = 4`. Then, if nothing has established that
this message is even about the recipient's job search — no ATS sender, no
personal application context, no job title in the subject — it must be backed by
a **strong signal or two independent ones**. Otherwise it falls back to
`unrelated`.

This gate exists because ordinary mail borrows the vocabulary constantly. A bank
fraud notice says *"unfortunately"*; a Google Forms receipt echoes *"please
provide"*. One weak hint is a coincidence, not a verdict.

Confidence is derived from the margin over the runner-up plus the absolute
score, clamped to `[0.35, 0.99]`.

## Manual overrides

Correcting a classification in the UI sets `email_logs.manual_override = true`.
Both the scanner and the eval harness skip those rows, so a correction survives
every future rescan.

## Changing the rules

`scripts/eval-classifier.ts` re-runs the current engine over every stored email
and diffs against what is saved, so a change is measured against a real corpus
instead of a hand-picked example.

```bash
node scripts/eval-classifier.ts                 # transition matrix + every change
node scripts/eval-classifier.ts --only interview
node scripts/eval-classifier.ts --reasons       # which rules fired, and at what weight
node scripts/eval-classifier.ts --write         # persist, skipping manual_override rows
```

The workflow that works:

1. Run it before the change and confirm it reports **0 changed** — that is the
   baseline.
2. Make the change and run it again.
3. Read *every* flip. The totals lie: a change can fix five emails and break
   three and still look like a net win. `scripts/debug-classify.ts` prints the
   full rule trace for one message when a flip is not obvious.
4. Only then `--write`.

Rules are cheap to add and hard to remove — prefer narrowing an existing rule or
adding a context suppressor over introducing a new keyword.
