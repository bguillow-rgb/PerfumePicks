// Preflight check for the content pipeline's Anthropic API key.
//
// Why this exists: on 2026-08-17 the Daily SEO content workflow burned all three
// generateArticle retries against
//   Anthropic API 400: Your credit balance is too low to access the Anthropic API
// a hard 400 that retrying cannot fix. Credit is billed per ACCOUNT, not per key,
// so every content pipeline in the portfolio died the same morning: one billing
// event became 17 red runs across seven repos in two days, and the day's article
// was lost on every one of them.
//
// This makes that failure mode loud and immediate: one ~1-token request before
// any real work, with a distinct exit code and an unmistakable message.
//
// Usage:  ANTHROPIC_API_KEY=... node scripts/preflight-api.mjs
// Exit 0  = key is valid and funded (or the check was inconclusive — see below).
// Exit 2  = BILLING: credit balance too low.
// Exit 3  = AUTH: key invalid, revoked, or lacking permission.
//
// Transient failures (429, 5xx, network) do NOT block the run. They exit 0 with
// a warning: the real generateArticle call has its own retries, and a flaky
// preflight must never be the reason an article doesn't ship.

const API_KEY = process.env.ANTHROPIC_API_KEY;
// Deliberately the cheapest model available — this call is a liveness probe,
// not generation work. It must not track DAILY_POST_MODEL.
const PROBE_MODEL = process.env.PREFLIGHT_MODEL || 'claude-haiku-4-5-20251001';

if (!API_KEY) {
  console.error('::error title=Pipeline preflight::ANTHROPIC_API_KEY is not set.');
  process.exit(3);
}

async function probe() {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: PROBE_MODEL,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }],
    }),
  });
  return { status: res.status, body: res.ok ? '' : await res.text() };
}

let result;
for (let i = 1; i <= 3; i++) {
  try {
    result = await probe();
  } catch (e) {
    console.error(`preflight: attempt ${i}/3 network error: ${e.message}`);
    result = { status: 0, body: e.message };
  }
  // 429 / 5xx are transient — back off and retry. Everything else is decisive.
  if (result.status && result.status !== 429 && result.status < 500) break;
  if (i < 3) await new Promise((r) => setTimeout(r, 2000 * i));
}

const { status, body } = result;
const lower = (body || '').toLowerCase();

if (status >= 200 && status < 300) {
  console.log('preflight: Anthropic API reachable and funded ✓');
  process.exit(0);
}

if (lower.includes('credit balance is too low')) {
  console.error(
    '::error title=CONTENT PIPELINE DOWN — Anthropic credit balance too low::' +
      "The Anthropic account that funds article generation is out of credit. Today's " +
      'article will NOT publish. Credit is billed per account, not per key, so every ' +
      'content pipeline in the portfolio is down right now — not just this repo. ' +
      'Fix: top up at console.anthropic.com -> Plans & Billing, then re-run the ' +
      'Daily SEO content workflow manually in each affected repo to recover the ' +
      'missed slot.'
  );
  process.exit(2);
}

if (status === 401 || status === 403) {
  console.error(
    `::error title=CONTENT PIPELINE DOWN — Anthropic auth failed (${status})::` +
      'The ANTHROPIC_API_KEY secret is invalid, revoked, or lacks permission. ' +
      `Response: ${body.slice(0, 300)}`
  );
  process.exit(3);
}

// Inconclusive: transient error that survived three attempts, or an unexpected
// shape. Warn, but let the run proceed — generateArticle retries on its own.
console.error(
  `::warning title=Pipeline preflight inconclusive::Anthropic probe returned ` +
    `${status || 'network error'}; continuing anyway. ${body.slice(0, 200)}`
);
process.exit(0);
