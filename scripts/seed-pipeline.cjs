const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  database: process.env.PGDATABASE || 'career',
});

const applications = [
  {
    title: "Senior Full Stack Engineer (React + Node)",
    company: "ByteX Engineering",
    workplace_type: "remote",
    location: "Romania (Remote-first)",
    status: "applied",
    application_method: "email",
    url: "https://bytex.ro/careers",
    job_description: "Node/TypeScript/PostgreSQL/Docker/AWS architecture and full-stack development.",
    info_provided: "CV: example-cv.pdf, Notice: Immediate",
    cover_letter: "Dear Hiring Team at ByteX Engineering,\n\nI am writing to express my strong interest in the Senior Full Stack Engineer role...",
    salary: "€65,000 - €80,000",
    contact_email: "careers@bytex.ro",
    notes: "Applied via direct email sweep. Message ID: 1a01cd597c6b6583",
    priority: "high",
    source: "audio-job-hunter-cron",
    applied_at: "2026-08-20T04:42:00Z"
  },
  {
    title: "Full Stack Developer (m/f/d) Webshop Team",
    company: "Tchibo",
    workplace_type: "hybrid",
    location: "Bucharest, Romania",
    status: "applied",
    application_method: "email",
    url: "https://www.tchibo-karriere.de/en/jobs/54959",
    job_description: "JS/TS primary, microservices, SQL, CI/CD, GCP/K8s.",
    info_provided: "CV: example-cv.pdf",
    cover_letter: "Dear Tchibo Recruiting Team,\n\nI am thrilled to submit my application for the Full Stack Developer position...",
    salary: "€55,000 - €70,000",
    contact_email: "recruiting.tech@tchibo.ro",
    notes: "Applied via recruiting.tech@tchibo.ro (msg 1a01c2311897a93f)",
    priority: "medium",
    source: "audio-job-hunter-cron",
    applied_at: "2026-08-20T03:30:00Z"
  },
  {
    title: "Full Stack Software Developer",
    company: "Aegis Core Tech",
    workplace_type: "hybrid",
    location: "Bucharest, Romania",
    status: "applied",
    application_method: "email",
    url: "https://aegiscoretech.com",
    job_description: "JS/TS/React/Node, microservices, Docker/CI-CD.",
    info_provided: "CV: example-cv.pdf",
    cover_letter: "Dear Aegis Core Tech Team,\n\nI am writing to apply for the Full Stack Software Developer role...",
    contact_email: "contact@aegiscoretech.com",
    notes: "Applied via contact@aegiscoretech.com (msg 1a01c2430ee38ac3)",
    priority: "medium",
    source: "audio-job-hunter-cron",
    applied_at: "2026-08-20T03:35:00Z"
  },
  {
    title: "Full Stack Developer – Node",
    company: "TradeVille",
    workplace_type: "on-site",
    location: "Bucharest, Romania",
    status: "applied",
    application_method: "email",
    url: "https://tradeville.ro/cariere",
    job_description: "Node/Express/React/Redux/Redis/WebSocket/MSSQL/PostgreSQL, microservices, high-frequency trading platform.",
    info_provided: "CV: example-cv.pdf",
    cover_letter: "Dear TradeVille Team,\n\nI am excited to apply for the Full Stack Node position...",
    contact_email: "jobs@tradeville.ro",
    notes: "Applied via jobs@tradeville.ro (msg 1a01b723de07d426)",
    priority: "high",
    source: "audio-job-hunter-cron",
    applied_at: "2026-08-20T01:15:00Z"
  },
  {
    title: "Senior Backend Developer (Python/Java)",
    company: "RASIROM",
    workplace_type: "on-site",
    location: "Bucharest, Romania",
    status: "applied",
    application_method: "email",
    url: "https://rasirom.ro/cariere",
    job_description: "National security and infrastructure tech systems backend.",
    info_provided: "CV: example-cv.pdf",
    cover_letter: "Stimate Echipe RASIROM,\n\nVa adresez candidatura mea pentru pozitia de Senior Backend Developer...",
    contact_email: "cariere@rasirom.ro",
    notes: "Applied via cariere@rasirom.ro (msg 1a01cd5ad955ec6b)",
    priority: "medium",
    source: "audio-job-hunter-cron",
    applied_at: "2026-08-20T04:42:00Z"
  },
  {
    title: "Full-Stack Dev (Mid/Senior)",
    company: "Magic Romania",
    workplace_type: "on-site",
    location: "Bucharest (Panduri 71)",
    status: "applied",
    application_method: "portal",
    url: "https://magicsalon.fillout.com/t/smRSGc8h9wus",
    job_description: "React / React Native / Node.js + Python e-commerce application.",
    info_provided: "CV uploaded, DOB 07/03/2001, Notice immediate",
    notes: "Applied via Fillout portal on 2026-08-20 ~04:10 EEST",
    priority: "medium",
    source: "audio-job-hunter-cron",
    applied_at: "2026-08-20T04:10:00Z"
  },
  {
    title: "Senior Full-Stack Developer / Technical Lead",
    company: "Veeam",
    workplace_type: "remote",
    location: "Bucharest / Remote-Romania",
    status: "interview_pending",
    application_method: "portal",
    url: "https://job-boards.eu.greenhouse.io/veeamsoftware/jobs/4930825101",
    job_description: "Greenfield AI platform, async Python + PostgreSQL + Docker + CI/CD + OIDC/OAuth2/JWT/RBAC + LLM APIs/RAG/MCP.",
    info_provided: "CV: example-cv.pdf, Notice: Immediate, 5+ yrs fullstack exp",
    cover_letter: "Dear Hiring Team at Veeam,\n\nI am writing to express my enthusiasm for the Senior Full-Stack Developer / Technical Lead position on the greenfield AI team...",
    salary: "€80,000 - €95,000",
    notes: "Greenhouse portal prepped with email security code flow.",
    priority: "top",
    source: "audio-job-hunter-cron",
    applied_at: "2026-08-21T01:00:00Z"
  },
  {
    title: "DSP Software Developer",
    company: "GN Hearing",
    workplace_type: "hybrid",
    location: "Eindhoven, Netherlands",
    status: "applied",
    application_method: "portal",
    url: "https://www.linkedin.com/jobs/view/4454799256",
    job_description: "Audio signal processing algorithms for hearing aids on ultra-low-power DSP platform; fixed-point & floating-point DSP.",
    info_provided: "CV: Owner_Name_Audio_DSP_CV.pdf",
    salary: "€65,000 - €80,000",
    notes: "Center of Excellence for Intelligent Audio Solutions. TU/e campus.",
    priority: "top",
    source: "audio-job-hunter-cron",
    applied_at: "2026-08-22T07:44:00Z"
  },
  {
    title: "Senior Fullstack Engineer",
    company: "Reaktor",
    workplace_type: "hybrid",
    location: "Amsterdam / Remote-EU",
    status: "applied",
    application_method: "portal",
    url: "https://www.reaktor.com/careers",
    job_description: "Autonomous product teams, modern TypeScript/Node, React, cloud infrastructure.",
    info_provided: "CV: example-cv.pdf, Cover Letter PDF",
    cover_letter: "Dear Reaktor team,\n\nI am applying for the Senior Fullstack Engineer position...",
    salary: "€75,000 - €90,000",
    notes: "Applied with tailored Reaktor cover letter PDF.",
    priority: "high",
    source: "manual",
    applied_at: "2026-08-14T16:33:00Z"
  },
  {
    title: "Senior SW Engineer, Cloud & Integrations",
    company: "NedGraphics",
    workplace_type: "remote",
    location: "Remote Romania",
    status: "rejected",
    application_method: "portal",
    url: "https://nedgraphics.com/careers",
    job_description: "AWS serverless, cloud integration architecture.",
    info_provided: "CV: example-cv.pdf",
    notes: "Received rejection notification: 'proceeding with other candidates'",
    priority: "medium",
    source: "audio-job-hunter-cron",
    applied_at: "2026-08-19T22:00:00Z"
  },
  {
    title: "Senior Backend Engineer",
    company: "Bitdefender",
    workplace_type: "hybrid",
    location: "Bucharest, Romania",
    status: "applied",
    application_method: "portal",
    url: "https://boards.greenhouse.io/bitdefender",
    job_description: "Cybersecurity backend, distributed threat analysis pipelines.",
    info_provided: "CV: example-cv.pdf",
    priority: "high",
    source: "audio-job-hunter-cron",
    applied_at: "2026-08-18T10:00:00Z"
  },
  {
    title: "Software Engineer Backend",
    company: "Bolt",
    workplace_type: "hybrid",
    location: "Bucharest, Romania",
    status: "applied",
    application_method: "portal",
    url: "https://bolt.eu/careers",
    job_description: "High concurrency dispatching systems, Node/Go microservices.",
    info_provided: "CV: example-cv.pdf",
    priority: "high",
    source: "audio-job-hunter-cron",
    applied_at: "2026-08-18T14:00:00Z"
  },
  {
    title: "Senior Software Engineer",
    company: "Onapsis",
    workplace_type: "remote",
    location: "Bucharest / Remote",
    status: "applied",
    application_method: "portal",
    url: "https://onapsis.com/careers",
    job_description: "ERP cybersecurity vulnerability intelligence platform.",
    info_provided: "CV: example-cv.pdf",
    notes: "Applied via web automation form.",
    priority: "high",
    source: "audio-job-hunter-cron",
    applied_at: "2026-08-19T14:47:00Z"
  },
  {
    title: "Backend Software Engineer",
    company: "PDQ",
    workplace_type: "remote",
    location: "Remote EMEA",
    status: "applied",
    application_method: "portal",
    url: "https://pdq.com/careers",
    job_description: "Device management and systems administration tooling backend.",
    info_provided: "CV: example-cv.pdf",
    priority: "medium",
    source: "audio-job-hunter-cron",
    applied_at: "2026-08-19T15:54:00Z"
  }
];

async function seed() {
  console.log("Seeding initial applications...");
  for (const app of applications) {
    const existing = await pool.query("SELECT id FROM applications WHERE company = $1 AND title = $2", [app.company, app.title]);
    if (existing.rows.length === 0) {
      const res = await pool.query(
        `INSERT INTO applications (
          title, company, workplace_type, location, status,
          application_method, url, job_description, info_provided,
          cover_letter, salary, contact_email, notes, priority, source, applied_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW())
        RETURNING id`,
        [
          app.title,
          app.company,
          app.workplace_type,
          app.location || "",
          app.status,
          app.application_method,
          app.url || "",
          app.job_description || "",
          app.info_provided || "",
          app.cover_letter || "",
          app.salary || "",
          app.contact_email || "",
          app.notes || "",
          app.priority,
          app.source,
          app.applied_at
        ]
      );

      const appId = res.rows[0].id;
      await pool.query(
        `INSERT INTO application_events (application_id, event_type, title, description, created_at)
         VALUES ($1, 'created', $2, $3, $4)`,
        [
          appId,
          `Applied to ${app.company}`,
          `Application for ${app.title} via ${app.application_method}`,
          app.applied_at
        ]
      );
    }
  }

  // Seed sample email log for NedGraphics rejection
  const nedRes = await pool.query("SELECT id FROM applications WHERE company = 'NedGraphics' LIMIT 1");
  if (nedRes.rows.length > 0) {
    const existingMail = await pool.query("SELECT id FROM email_logs WHERE message_id = 'nedgraphics-rej-01'");
    if (existingMail.rows.length === 0) {
      await pool.query(
        `INSERT INTO email_logs (application_id, message_id, sender, recipient, subject, snippet, body, classification, received_at)
         VALUES ($1, 'nedgraphics-rej-01', 'recruiting@nedgraphics.com', 'owner@example.com', 'Update on your application with NedGraphics', 'Thank you for your interest in the Senior Cloud Engineer position. Unfortunately, we have decided to proceed with other candidates at this time.', 'Thank you for your interest in the Senior Cloud Engineer position. Unfortunately, we have decided to proceed with other candidates at this time. We wish you the best in your job search.', 'rejection', '2026-08-20T10:00:00Z')`,
        [nedRes.rows[0].id]
      );
    }
  }

  console.log("Seeding completed successfully!");
  await pool.end();
}

seed().catch(err => {
  console.error("Seed failed:", err);
  process.exit(1);
});
