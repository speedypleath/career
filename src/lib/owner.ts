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
 */
export const OWNER_EMAIL = "gheorgheandrei13@gmail.com"
