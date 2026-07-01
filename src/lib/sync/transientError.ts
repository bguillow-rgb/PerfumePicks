/**
 * isTransientNetworkFailure — pure classifier, no Sentry/Supabase imports so it
 * stays trivially unit-testable and un-mocked.
 *
 * Discriminates a transient connectivity blip (device briefly lost signal —
 * the write is queued and retried, nothing lost) from a real, actionable error.
 *
 * The key signal is the Postgres/PostgREST error CODE, not the message string.
 * A server that answered always carries a code (e.g. 23514 check violation,
 * 42703 undefined column, 42501 RLS denial, 57014 statement timeout). Those are
 * bugs and must stay loud. A genuine network failure carries no code — only then
 * do we string-match the fetch-layer signatures.
 *
 * Deliberately does NOT match bare "timeout": a Postgres statement timeout
 * (57014) or a PostgREST 504 is a real incident (slow query, missing index,
 * pooler saturation) and must not be swallowed. Those arrive WITH a code and are
 * caught by the code guard above regardless.
 */
export function isTransientNetworkFailure(errLike: unknown): boolean {
  // A server response always carries a code → actionable, keep it loud.
  const code = (errLike as { code?: string | null } | null)?.code;
  if (code) return false;

  const raw =
    errLike instanceof Error
      ? errLike.message
      : (errLike as { message?: string } | null)?.message ?? String(errLike);
  const m = raw.toLowerCase();

  return (
    m.includes('network request failed') ||
    m.includes('failed to fetch') ||
    m.includes('network error') ||
    m.includes('the internet connection appears to be offline') ||
    m.includes('econnreset') ||
    m.includes('etimedout') ||
    m.includes('enotfound') ||
    (m.includes('connection') &&
      (m.includes('reset') || m.includes('refused') || m.includes('aborted')))
  );
}
