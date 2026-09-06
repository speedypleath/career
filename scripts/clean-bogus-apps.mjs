import { createPool } from './lib/db-config.ts'
import { OWNER_EMAIL } from '../src/lib/owner.ts'

const pool = createPool('supabase')

async function run() {
  const client = await pool.connect();
  try {
    const bogusAppIds = [
      '0fcb0458-8f64-4263-a2a4-52509ad34afe',
      '370b287a-0651-4147-9721-f1c0b856c20e',
      '6d1cacf8-59a6-4264-8e93-c1fd2c5b8d66',
      'cb3e722f-b624-4280-9592-0dbe3c82c1af',
      'efd06263-37b5-4750-af22-297a3d83d0b0',
      'ca8c5978-f35c-4b87-bae0-6719c8d0b582',
      'f1efbb7d-d114-4ade-96b0-ee2ece288e2e'
    ];

    for (const appId of bogusAppIds) {
      await client.query('UPDATE email_logs SET application_id = NULL WHERE application_id = $1', [appId]);
      await client.query('DELETE FROM application_events WHERE application_id = $1', [appId]);
      await client.query('DELETE FROM applications WHERE id = $1', [appId]);
    }
    console.log('Bogus applications deleted.');

    await client.query('DELETE FROM email_classification_cache');
    console.log('Cache cleared.');

    // 1. Joburi Hipo -> unrelated
    await client.query(`
      UPDATE email_logs 
      SET classification = 'unrelated', application_id = NULL, classification_state = 'resolved', classification_source = 'gate'
      WHERE sender ILIKE '%hipo.ro%' OR subject ILIKE '%hipo.ro%'
    `);

    // 2. LinkedIn marketing/trends -> unrelated
    await client.query(`
      UPDATE email_logs 
      SET classification = 'unrelated', application_id = NULL, classification_state = 'resolved', classification_source = 'gate'
      WHERE sender ILIKE '%messages-noreply@linkedin.com%' 
         OR subject ILIKE '%are hiring%' 
         OR subject ILIKE '%just hired%'
    `);

    // 3. Passcodes / OTPs -> unrelated
    await client.query(`
      UPDATE email_logs 
      SET classification = 'unrelated', application_id = NULL, classification_state = 'resolved', classification_source = 'gate'
      WHERE subject ILIKE '%one-time-passcode%' OR snippet ILIKE '%one-time-passcode%'
    `);

    // 4. Ground News & NIV News -> unrelated
    await client.query(`
      UPDATE email_logs 
      SET classification = 'unrelated', application_id = NULL, classification_state = 'resolved', classification_source = 'gate'
      WHERE sender ILIKE '%groundnews%' OR sender ILIKE '%harpercollins%'
    `);

    // 5. Conferences (ADCx, ISMIR) -> conference
    await client.query(`
      UPDATE email_logs 
      SET classification = 'conference', application_id = NULL, classification_state = 'resolved', classification_source = 'rule'
      WHERE subject ILIKE '%ADC%' OR subject ILIKE '%ISMIR%'
    `);

    // 6. User sent emails -> unrelated
    await client.query(`
      UPDATE email_logs 
      SET classification = 'unrelated', application_id = NULL, classification_state = 'resolved', classification_source = 'gate'
      WHERE sender ILIKE $1
    `, [`%${OWNER_EMAIL}%`]);

    console.log('Email logs successfully updated.');

    const remainingApps = await client.query('SELECT id, title, company, status, source FROM applications ORDER BY created_at DESC');
    console.log('Remaining clean applications (' + remainingApps.rows.length + '):', remainingApps.rows);

    const counts = await client.query('SELECT classification, COUNT(*) FROM email_logs GROUP BY classification ORDER BY count DESC');
    console.log('Updated classification counts:', counts.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
