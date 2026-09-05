import { prisma } from "../prisma"
import { OWNER_EMAIL } from "../owner"
import type { EmailSettings } from "@/types"

/**
 * imap_password is never selected. It is the one column in this table the
 * client must not receive, and leaving it out of the projection is what keeps
 * that true regardless of how a caller serializes the result.
 */
const PUBLIC_COLUMNS = {
  id: true,
  imap_host: true,
  imap_port: true,
  imap_user: true,
  imap_tls: true,
  gmail_account: true,
  auto_sync: true,
  sync_interval_mins: true,
  last_synced_at: true,
  updated_at: true,
} as const

const SETTINGS_ID = "default"

/**
 * Postgres timestamps arrive as Date objects, but EmailSettings declares them
 * as strings — true of the JSON the route sends, not of the row. The old
 * `query<EmailSettings>` generic was an unchecked assertion, so nothing caught
 * the mismatch; Prisma types the columns honestly, so the conversion belongs
 * here. Serializing to ISO is exactly what NextResponse.json already did.
 *
 * Every column but `id` is nullable at the DB level (see the `email_settings`
 * model in prisma/schema.prisma, introspected from the real table) even
 * though each has a DB-side default — Prisma's generated type reflects
 * nullability honestly, not defaultedness. So every field here is optional,
 * and toWire() below falls back to the same values `defaults()` uses.
 */
type SettingsRow = {
  id: string
  imap_host: string | null
  imap_port: number | null
  imap_user: string | null
  imap_tls: boolean | null
  gmail_account: string | null
  auto_sync: boolean | null
  sync_interval_mins: number | null
  last_synced_at: Date | null
  updated_at: Date | null
}

function toWire(row: SettingsRow): EmailSettings {
  return {
    id: row.id,
    imap_host: row.imap_host ?? "",
    imap_port: row.imap_port ?? 993,
    imap_user: row.imap_user ?? "",
    imap_tls: row.imap_tls ?? true,
    gmail_account: row.gmail_account ?? OWNER_EMAIL,
    auto_sync: row.auto_sync ?? true,
    sync_interval_mins: row.sync_interval_mins ?? 60,
    last_synced_at: row.last_synced_at ? row.last_synced_at.toISOString() : null,
    updated_at: (row.updated_at ?? new Date()).toISOString(),
  }
}

/** What GET returns when the row has never been created. Not persisted. */
function defaults(): EmailSettings {
  return {
    id: SETTINGS_ID,
    imap_host: "",
    imap_port: 993,
    imap_user: "",
    imap_tls: true,
    gmail_account: OWNER_EMAIL,
    auto_sync: true,
    sync_interval_mins: 60,
    last_synced_at: null,
    updated_at: new Date().toISOString(),
  }
}

export async function get(): Promise<EmailSettings> {
  const row = await prisma.email_settings.findUnique({
    where: { id: SETTINGS_ID },
    select: PUBLIC_COLUMNS,
  })
  return row ? toWire(row) : defaults()
}

export interface SettingsPatch {
  imap_host?: string
  imap_port?: number | string
  imap_user?: string
  imap_password?: string
  imap_tls?: boolean
  gmail_account?: string
  auto_sync?: boolean
  sync_interval_mins?: number | string
}

/**
 * Only the keys present in the patch are written.
 *
 * An empty imap_password means "leave the stored one alone" rather than "clear
 * it", which is how the settings form signals an untouched password field.
 */
function toUpdateData(patch: SettingsPatch) {
  const data: Record<string, unknown> = {}
  if (patch.imap_host !== undefined) data.imap_host = patch.imap_host
  if (patch.imap_port !== undefined) data.imap_port = Number(patch.imap_port)
  if (patch.imap_user !== undefined) data.imap_user = patch.imap_user
  if (patch.imap_password !== undefined && patch.imap_password !== "") {
    data.imap_password = patch.imap_password
  }
  if (patch.imap_tls !== undefined) data.imap_tls = Boolean(patch.imap_tls)
  if (patch.gmail_account !== undefined) data.gmail_account = patch.gmail_account
  if (patch.auto_sync !== undefined) data.auto_sync = Boolean(patch.auto_sync)
  if (patch.sync_interval_mins !== undefined) {
    data.sync_interval_mins = Number(patch.sync_interval_mins)
  }
  data.updated_at = new Date()
  return data
}

/**
 * Upsert, not update.
 *
 * The route this replaced built an `INSERT ... ON CONFLICT DO UPDATE` into a
 * local variable and then never ran it, issuing a bare UPDATE instead — so on
 * a database where the 'default' row had not been seeded, PATCH matched zero
 * rows and answered `{ settings: undefined }` with a 200. The dead statement
 * shows what was meant; this is it, wired up. Every column has a default, so
 * creating the row needs nothing beyond the patch itself.
 */
export async function update(patch: SettingsPatch): Promise<EmailSettings> {
  const data = toUpdateData(patch)
  const row = await prisma.email_settings.upsert({
    where: { id: SETTINGS_ID },
    update: data,
    create: { id: SETTINGS_ID, ...data },
    select: PUBLIC_COLUMNS,
  })
  return toWire(row)
}
