import { createClient } from "../lib/db/client.ts"
import { reclassifyStoredEmails } from "../lib/services/classification-maintenance.ts"

const client = createClient("hosted-supabase")
await client.connect()
try {
  const summary = await reclassifyStoredEmails((text, params) => client.query(text, params))
  console.log(JSON.stringify(summary, null, 2))
} finally {
  await client.end()
}
