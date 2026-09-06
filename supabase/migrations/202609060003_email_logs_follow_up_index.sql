-- Partial index for the Follow-ups tab query (src/lib/repositories/email-logs.ts,
-- findAll with needsFollowUp: true): WHERE classification = ANY(assessment/question/
-- interview) AND follow_up_done = false, ORDER BY received_at DESC, created_at DESC.
-- Only ever-eligible, not-yet-dismissed rows go in, so it stays tiny regardless of
-- how large email_logs grows, and its column order matches the ORDER BY exactly so
-- no separate sort step is needed.
create index if not exists idx_email_logs_follow_up
  on email_logs (received_at desc, created_at desc)
  where follow_up_done = false
    and classification in ('assessment', 'question', 'interview');
