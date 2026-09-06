/**
 * The single user this app is built for.
 *
 * The address was hardcoded in twelve places — a classifier gate for outbound
 * mail, the scanner's account default, the scan route's default recipient, the
 * settings default, SettingsView, EmailsView, schema.sql and two migration
 * seeds. This constant is the TypeScript half of that; the SQL defaults still
 * carry their own literal, so a change means editing here *and* writing a
 * migration.
 *
 * It is a fallback, not the source of truth: email_settings.gmail_account wins
 * whenever a row exists.
 *
 * Both constants read from the environment (see .env.example) rather than
 * carrying a real address/name in source, since this repo is public — set
 * OWNER_EMAIL / OWNER_NAME in your own .env. OWNER_NAME is optional: it only
 * feeds a couple of company-name-extraction heuristics (see
 * src/lib/email/status.ts, src/lib/email/extract.ts) that skip over the
 * applicant's own name; leaving it unset just skips that guard.
 */
export const OWNER_EMAIL = process.env.OWNER_EMAIL || "owner@example.com"
export const OWNER_NAME = process.env.OWNER_NAME || ""
