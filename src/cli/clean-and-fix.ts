import { query } from "../lib/db.ts"
import { reclassifyStoredEmails } from "../lib/services/classification-maintenance.ts"

console.log(JSON.stringify(await reclassifyStoredEmails(query), null, 2))
