// dr-ad-spend.js — DR AD SPEND's read on the Perfume Picks Apple Search Ads
// account.
//
// Pure analysis. Takes the ASA source object (snapshot or live) and returns
// a structured verdict the formatters render. No I/O, no network. If the
// founder argues with a finding, we point at this file.
//
// DR AD SPEND's job is spend protection. Every finding is one of:
//   PAUSE / MOVE-TO-EXACT / ADD-NEGATIVE / DEFEND-BRAND / SET-GUARDRAIL /
//   SPLIT / SCALE. Findings carry a severity so the formatter can sort.

'use strict';

// Search terms that are obviously off-category for a fragrance app. Used to
// sanity-check the junk detector — any term matching these with spend and
// zero installs is a guaranteed negative.
const OFF_CATEGORY_HINTS = [
  'job', 'jobs', 'career', 'salary', 'wholesale', 'repair', 'course', 'class',
  'making', 'diy', 'recipe', 'near me', 'movie', 'lyrics', 'song', 'coupon',
  'discount code', 'wikipedia', 'meaning',
];

function pct(n) {
  return Math.round(n * 100);
}

function build(asa) {
  if (!asa || asa.error) {
    return {
      ok: false,
      reason: asa?.error || 'no ASA data',
      mode: asa?.mode || 'unknown',
    };
  }

  const findings = [];
  const account = asa.account || {};
  const campaigns = Array.isArray(asa.campaigns) ? asa.campaigns : [];
  const adGroups = campaigns.flatMap((c) =>
    (c.adGroups || []).map((g) => ({ ...g, campaign: c.name }))
  );
  const searchTerms = Array.isArray(asa.searchTerms) ? asa.searchTerms : [];
  const negatives = Array.isArray(asa.negativeKeywords) ? asa.negativeKeywords : [];

  const totalSpend = account.spend ?? campaigns.reduce((s, c) => s + (c.spend || 0), 0);
  const totalInstalls = account.installs ?? campaigns.reduce((s, c) => s + (c.installs || 0), 0);
  const accountCpa = account.cpa ?? (totalInstalls > 0 ? totalSpend / totalInstalls : null);

  // ── 1. No Target CPA guardrail ──────────────────────────────────────
  if (account.targetCpa == null) {
    findings.push({
      severity: 'high',
      action: 'SET-GUARDRAIL',
      title: 'No Target CPA set',
      detail:
        'The account is bidding without a cost-per-acquisition ceiling. ' +
        'You are trusting Apple to spend responsibly. It will not. Set a ' +
        'Target CPA at or below your blended ' +
        (accountCpa != null ? `$${accountCpa.toFixed(2)}` : 'current CPA') + '.',
    });
  }

  // ── 2. Best-CPA ad group is paused ──────────────────────────────────
  const pausedWinners = adGroups.filter(
    (g) => g.status === 'PAUSED' && (g.installs || 0) > 0
  );
  for (const g of pausedWinners) {
    const cheaperThanAccount =
      accountCpa != null && g.cpa != null && g.cpa < accountCpa;
    findings.push({
      severity: cheaperThanAccount ? 'critical' : 'high',
      action: 'UNPAUSE',
      title: `Paused ad group "${g.campaign} › ${g.name}" has your best economics`,
      detail:
        `"${g.name}" converted ${g.installs} installs at ` +
        `$${(g.cpa ?? 0).toFixed(2)} CPA` +
        (cheaperThanAccount
          ? ` — cheaper than the account blended $${accountCpa.toFixed(2)} — and it is turned OFF. `
          : ' and it is turned OFF. ') +
        'You paused your winner and let the loose group spend instead. Turn it back on.',
    });
  }

  // ── 3. Search Match group eating the budget ─────────────────────────
  const searchMatchGroups = adGroups.filter(
    (g) => g.matchType === 'SEARCH_MATCH' && g.status !== 'PAUSED'
  );
  for (const g of searchMatchGroups) {
    const share = totalSpend > 0 ? (g.spend || 0) / totalSpend : 0;
    if (share >= 0.4) {
      findings.push({
        severity: 'critical',
        action: 'CAP-DISCOVERY',
        title: `Search Match group "${g.name}" is eating ${pct(share)}% of spend`,
        detail:
          `Search Match is a discovery tool, not a scaling engine. "${g.name}" ` +
          `burned $${(g.spend || 0).toFixed(2)} (${pct(share)}% of the account) at ` +
          `$${(g.cpa ?? 0).toFixed(2)} CPA. Cap it, mine the winners into exact ` +
          'match, and negate the junk. Discovery should never be your biggest line item.',
      });
    }
  }

  // ── 4. Junk search terms with spend and no installs ─────────────────
  // Skip terms already negated — no point telling the founder to block what
  // they already blocked.
  const negatedSet = new Set(negatives.map((n) => (n.text || '').toLowerCase()));
  const junk = searchTerms.filter((t) => {
    const text = (t.text || '').toLowerCase();
    if (negatedSet.has(text)) return false;
    const spent = (t.spend || 0) > 0;
    const noInstalls = (t.installs || 0) === 0;
    const offCategory = OFF_CATEGORY_HINTS.some((h) => text.includes(h));
    return spent && (noInstalls || offCategory);
  });
  if (junk.length > 0) {
    const wasted = junk.reduce((s, t) => s + (t.spend || 0), 0);
    findings.push({
      severity: 'high',
      action: 'ADD-NEGATIVE',
      title: `${junk.length} junk search terms burned $${wasted.toFixed(2)} with nothing to show`,
      detail:
        'Add these as exact-match negatives now: ' +
        junk.map((t) => `"${t.text}" ($${(t.spend || 0).toFixed(2)})`).join(', ') +
        '. These are not your customers. Stop paying for them.',
      negativesToAdd: junk.map((t) => t.text),
    });
  }

  // ── 5. Brand term undefended ────────────────────────────────────────
  // Two flavors: brand keywords exist but sit in a paused group (dark in
  // practice), or no brand keywords at all. Both leave the name open.
  const brand = asa.brandTerm;
  const brandUndefended = brand ? !(brand.present && brand.enabled) : asa.brandTermDefended === false;
  if (brandUndefended) {
    const brandList = brand?.terms?.length
      ? brand.terms.map((t) => `"${t}"`).join(', ')
      : '"perfume picks" and close variants';
    const detail = brand?.present
      ? `Your brand terms (${brandList}) only live in a PAUSED group, so brand ` +
        'search is undefended right now. Whoever bids on your name wins it for ' +
        'pennies. Brand defense is the cheapest, highest-converting traffic you ' +
        'will ever buy — keep it live even when you pause experiments.'
      : `There is no exact-match group owning ${brandList}. Brand defense is the ` +
        'cheapest, highest-converting traffic you will ever buy. Lock it down ' +
        'before a competitor bids on your name.';
    findings.push({
      severity: 'medium',
      action: 'DEFEND-BRAND',
      title: brand?.present ? 'Brand terms are live nowhere (paused group)' : 'Brand term is undefended',
      detail,
    });
  }

  // ── 6. Reactive / thin negative list ────────────────────────────────
  if (negatives.length > 0 && negatives.length < 15) {
    findings.push({
      severity: 'low',
      action: 'BUILD-NEGATIVES',
      title: `Only ${negatives.length} negative keywords — this is whack-a-mole`,
      detail:
        'A handful of reactive negatives means you are cleaning up after the ' +
        'spend, not preventing it. Build a proper negative list: jobs, career, ' +
        'wholesale, repair, course, class, making, free, near me, plus every ' +
        'off-category brand the search-term report keeps surfacing.',
    });
  }

  // ── 7. Empty enabled ad groups (clutter) ────────────────────────────
  const emptyEnabled = adGroups.filter(
    (g) => g.status !== 'PAUSED' && (g.spend || 0) === 0 && (g.installs || 0) === 0
  );
  for (const g of emptyEnabled) {
    findings.push({
      severity: 'low',
      action: 'CLEAN-UP',
      title: `Ad group "${g.campaign} › ${g.name}" is enabled but empty`,
      detail: `"${g.name}" has no keywords doing work. Fill it or kill it.`,
    });
  }

  // ── Severity ordering + headline verdict ────────────────────────────
  const rank = { critical: 0, high: 1, medium: 2, low: 3 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity]);

  const critical = findings.filter((f) => f.severity === 'critical').length;
  const high = findings.filter((f) => f.severity === 'high').length;

  let verdict;
  if (totalSpend === 0) {
    verdict = 'No spend in window. Nothing to grade yet.';
  } else if (critical > 0) {
    verdict =
      'This account is leaking money. The structure is backwards: your best ' +
      'group is paused while a loose discovery group spends the budget. Fix ' +
      'structure first, more budget never.';
  } else if (high > 0) {
    verdict =
      'Spendable but sloppy. The bones are okay, the discipline is not. ' +
      'Tighten guardrails and negatives before scaling a dollar.';
  } else if (findings.length > 0) {
    verdict = 'Mostly clean. A few housekeeping items, no fires.';
  } else {
    verdict = 'Tight account. Keep mining search terms and protect the winners.';
  }

  // ── "What I would do first" — top 5 concrete actions ────────────────
  const firstMoves = findings.slice(0, 5).map((f) => {
    switch (f.action) {
      case 'UNPAUSE':
        return `Turn the paused winner back on (${f.title.match(/"([^"]+)"/)?.[1] || 'best group'}).`;
      case 'CAP-DISCOVERY':
        return 'Cap the Search Match group and stop it from owning the budget.';
      case 'ADD-NEGATIVE':
        return `Add ${(f.negativesToAdd || []).length} exact-match negatives for the junk terms.`;
      case 'SET-GUARDRAIL':
        return 'Set a Target CPA ceiling so Apple cannot overspend.';
      case 'DEFEND-BRAND':
        return asa.brandTerm?.present
          ? 'Get brand keywords live (move them out of the paused group).'
          : 'Stand up a protected exact-match brand group.';
      case 'BUILD-NEGATIVES':
        return 'Build out the negative keyword list beyond reactive cleanup.';
      case 'CLEAN-UP':
        return 'Fill or kill the empty enabled ad groups.';
      default:
        return f.title;
    }
  });

  return {
    ok: true,
    mode: asa.mode || 'snapshot',
    liveError: asa.liveError || null,
    capturedAt: asa.capturedAt || null,
    currency: asa.currency || 'USD',
    dateRange: asa.dateRange || null,
    totals: { spend: totalSpend, installs: totalInstalls, cpa: accountCpa },
    verdict,
    findings,
    firstMoves,
    counts: { critical, high, total: findings.length },
  };
}

module.exports = { build };
