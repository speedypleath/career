/**
 * Whether an email log may be reanalyzed.
 *
 * The pipeline's second invariant is that human corrections are permanent: a
 * classification changed in the UI sets manual_override, and every writer is
 * supposed to check it before touching the row. The reanalyze route was the
 * one that did not — it wrote manual_override = FALSE in both of its update
 * paths, so reanalysing an email someone had corrected silently replaced their
 * label and removed the flag protecting it.
 *
 * Kept free of database imports so it can be tested directly.
 */
export function shouldReanalyze(email: { manual_override?: boolean | null }): boolean {
  return !email.manual_override
}
