import { query } from "../src/lib/db"
import { classifyEmailDetailed } from "../src/lib/email-classifier"

async function fix() {
  const emails = await query(
    "SELECT id, sender, subject, body, snippet, application_id, manual_override FROM email_logs"
  )
  console.log("Classifying", emails.rows.length, "emails...")
  let unlinked = 0
  let nonJobCount = 0

  for (const e of emails.rows) {
    if (e.manual_override) continue
    const content = e.body || e.snippet || ""
    const verdict = await classifyEmailDetailed({ sender: e.sender, subject: e.subject, body: content })
    const isNonJob = verdict.classification === "unrelated" || verdict.classification === "conference"

    if (isNonJob) {
      nonJobCount++
      await query(
        "UPDATE email_logs SET classification = $1, application_id = NULL, classification_state = 'resolved', classification_source = $2 WHERE id = $3",
        [verdict.classification, verdict.source, e.id]
      )
      if (e.application_id) unlinked++
    } else {
      await query(
        "UPDATE email_logs SET classification = $1, classification_state = 'resolved', classification_source = $2 WHERE id = $3",
        [verdict.classification, verdict.source, e.id]
      )
    }
  }

  console.log("Classified: " + nonJobCount + " non-job. Unlinked " + unlinked + " falsely linked emails.")

  // Delete bogus applications (e.g. Unknown Company, Mailer, ADCx, etc.)
  const bogus = await query(
    "SELECT id, company, title FROM applications WHERE lower(coalesce(company,'')) IN ('unknown company','unknown role','unknown','mailer','adcx','ground news','niv news','linkedin','hipo','hipo.ro') OR lower(coalesce(title,'')) IN ('unknown role','unknown company')"
  )
  console.log("Found bogus applications:", bogus.rows.length)
  for (const b of bogus.rows) {
    await query("UPDATE email_logs SET application_id = NULL WHERE application_id = $1", [b.id])
    await query("DELETE FROM application_events WHERE application_id = $1", [b.id])
    await query("DELETE FROM applications WHERE id = $1", [b.id])
  }
  console.log("Deleted bogus applications successfully.")
}

fix().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
