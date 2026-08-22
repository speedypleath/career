import { NextResponse } from "next/server"
import { query } from "@/lib/db"
import type { EmailSettings } from "@/types"

export async function GET() {
  try {
    const res = await query<EmailSettings>(
      `SELECT id, imap_host, imap_port, imap_user, imap_tls, gmail_account, auto_sync, sync_interval_mins, last_synced_at, updated_at 
       FROM email_settings WHERE id = 'default'`
    )
    if (res.rows.length === 0) {
      return NextResponse.json({
        settings: {
          id: "default",
          imap_host: "",
          imap_port: 993,
          imap_user: "",
          imap_tls: true,
          gmail_account: "owner@example.com",
          auto_sync: true,
          sync_interval_mins: 60,
          last_synced_at: null,
          updated_at: new Date().toISOString(),
        },
      })
    }
    return NextResponse.json({ settings: res.rows[0] })
  } catch (error) {
    console.error("Failed to get email settings:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const {
      imap_host,
      imap_port,
      imap_user,
      imap_password,
      imap_tls,
      gmail_account,
      auto_sync,
      sync_interval_mins,
    } = body

    const fields: string[] = []
    const values: unknown[] = []
    let pIdx = 1

    if (imap_host !== undefined) { fields.push(`imap_host = $${pIdx++}`); values.push(imap_host); }
    if (imap_port !== undefined) { fields.push(`imap_port = $${pIdx++}`); values.push(Number(imap_port)); }
    if (imap_user !== undefined) { fields.push(`imap_user = $${pIdx++}`); values.push(imap_user); }
    if (imap_password !== undefined && imap_password !== "") { fields.push(`imap_password = $${pIdx++}`); values.push(imap_password); }
    if (imap_tls !== undefined) { fields.push(`imap_tls = $${pIdx++}`); values.push(Boolean(imap_tls)); }
    if (gmail_account !== undefined) { fields.push(`gmail_account = $${pIdx++}`); values.push(gmail_account); }
    if (auto_sync !== undefined) { fields.push(`auto_sync = $${pIdx++}`); values.push(Boolean(auto_sync)); }
    if (sync_interval_mins !== undefined) { fields.push(`sync_interval_mins = $${pIdx++}`); values.push(Number(sync_interval_mins)); }

    fields.push(`updated_at = NOW()`)
    values.push("default")

    const sql = `
      INSERT INTO email_settings (id, imap_host, imap_port, imap_user, imap_password, imap_tls, gmail_account, auto_sync, sync_interval_mins, updated_at)
      VALUES ('default', $1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (id) DO UPDATE SET
        ${fields.slice(0, -1).join(", ")}, updated_at = NOW()
      RETURNING id, imap_host, imap_port, imap_user, imap_tls, gmail_account, auto_sync, sync_interval_mins, last_synced_at, updated_at
    `

    const res = await query<EmailSettings>(
      `UPDATE email_settings SET ${fields.join(", ")} WHERE id = $${pIdx} 
       RETURNING id, imap_host, imap_port, imap_user, imap_tls, gmail_account, auto_sync, sync_interval_mins, last_synced_at, updated_at`,
      values
    )

    return NextResponse.json({ settings: res.rows[0] })
  } catch (error) {
    console.error("Failed to update email settings:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    )
  }
}
