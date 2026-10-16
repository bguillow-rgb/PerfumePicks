// dna-v3-render.js — shared rendering of the DNA V3 archetype panel so the
// CEO formatter stays thin (same pattern as dr-ad-spend-render.js).
//   markdownLines(dnaV3) — for ceo.js
//
// Design rule (M5): every V3-only metric degrades to an "awaiting rollout"
// row while the dna_v3_archetypes flag is off — never an error, never a blank.

'use strict';

// Prod mirror of the M2 replay balance gate: max label share ceiling.
const REPLAY_MAX_SHARE = 0.20;

function pct(x) {
  return `${(x * 100).toFixed(1)}%`;
}

function markdownLines(dnaV3) {
  const lines = [];
  lines.push('## 🧬 DNA V3 — ARCHETYPES & PICKER SEARCH');
  lines.push('');

  if (!dnaV3) {
    lines.push('- _No V3 read: source unavailable._');
    lines.push('');
    return lines;
  }

  // ── Engine / flag state ─────────────────────────────────────────────
  const flag = dnaV3.flag || {};
  if (flag.enabled) {
    lines.push(`- **Engine:** V3 centroid election LIVE (app_settings.dna_v3_archetypes = ${JSON.stringify(flag.raw)}). Existing users re-elect on their next recompute — kept-roster labels below may still be legacy-elected until then.`);
  } else {
    lines.push(`- **Engine:** LEGACY scorers (app_settings.dna_v3_archetypes ${flag.present ? `= ${JSON.stringify(flag.raw)}` : 'row absent — flag fails closed'}). Every profile below is **legacy-elected**; V3 elections appear as users recompute after the flag flips.`);
  }

  // ── Archetype distribution — prod mirror of the CI balance gates ────
  const a = dnaV3.archetypes || {};
  if (a.error) {
    lines.push(`- ⚠ Archetype distribution read failed: ${a.error}`);
  } else if (!a.total) {
    lines.push('- No profiles with a committed DNA yet.');
  } else {
    const max = a.maxShare;
    const gateNote = flag.enabled
      ? (max.share <= REPLAY_MAX_SHARE
          ? '✅ within the 20% replay-gate ceiling'
          : `⚠ above the ${pct(REPLAY_MAX_SHARE)} gate — this is the STORED distribution (still dominated by the pre-rebalance cohort). Seducer centroid rebalance shipped 2026-07-23; users re-elect down on their next recompute.`)
      : `(legacy baseline — the concentration V3 exists to fix; V3 gate ceiling is ${pct(REPLAY_MAX_SHARE)})`;
    lines.push(`- **Profiles with DNA:** ${a.total} (owner excluded) · **distinct archetypes:** ${a.distinct}/20 · **max share:** ${max.key} ${pct(max.share)} ${gateNote}`);
    lines.push('');
    lines.push('| Archetype | Elected by | Users | Share |');
    lines.push('|---|---|---|---|');
    for (const l of a.labels) {
      // Roster → provenance: v3-new keys can only come from the centroid
      // engine; with the flag off, kept + legacy-only keys are legacy-elected.
      const electedBy = l.roster === 'v3-new'
        ? 'V3 centroid'
        : (flag.enabled ? 'legacy or V3 (kept key)' : 'legacy (pre-V3)');
      lines.push(`| ${l.key} | ${electedBy} | ${l.count} | ${pct(l.share)} |`);
    }
    lines.push('');
    if (a.modifiers && a.modifiers.length > 0) {
      lines.push(`- **Modifiers:** ${a.modifiers.map((m) => `${m.key} ${m.count}`).join(' · ')}`);
    }
    const leans = a.leans || { count: 0, byChallenger: [] };
    const leanDetail = leans.count > 0
      ? ` — toward ${leans.byChallenger.map((c) => `${c.key} ${c.count}`).join(' · ')}`
      : '';
    lines.push(`- **Leans (persisted challenger, leaning=true):** ${leans.count}${leanDetail}`);
    lines.push('- _Election margin is not persisted (raw centroid distances stay in the engine) — distribution + lean flags are the prod-visible signal; the margin histogram lives in the M2 simulation gate._');
  }
  lines.push('');

  // ── Picker search adoption (V3 M4 — shipped in 1.0.5) ──────────────
  const s = dnaV3.search || {};
  lines.push('**Picker search — "bring your own bottle":**');
  lines.push('');
  if (s.error) {
    lines.push(`- ⚠ Search adoption read failed: ${s.error}`);
  } else if (!s.configured) {
    lines.push('- — (PostHog unavailable — search adoption unreadable)');
  } else if (s.awaitingRollout) {
    lines.push('| Metric | Since launch | Last 7d |');
    lines.push('|---|---|---|');
    lines.push('| Search opened | awaiting rollout | — |');
    lines.push('| Search pick (docked / promoted) | awaiting rollout | — |');
    lines.push('| No results | awaiting rollout | — |');
    lines.push('| Enrich requested | awaiting rollout | — |');
    lines.push('');
    lines.push(`- **Search-pick share of picks:** awaiting rollout (0 of ${s.totalPicks} picker picks since launch are search picks — expected while 1.0.5 isn't live)`);
  } else {
    lines.push('| Metric | Since launch | Last 7d |');
    lines.push('|---|---|---|');
    lines.push(`| Search opened | ${s.opened.events} (${s.opened.users} users) | ${s.opened.events7d} |`);
    lines.push(`| Search pick — docked | ${s.docked.events} | ${s.docked.events7d} |`);
    lines.push(`| Search pick — promoted (already on wall) | ${s.promoted.events} | ${s.promoted.events7d} |`);
    lines.push(`| No results | ${s.noResults.events} | ${s.noResults.events7d} |`);
    lines.push(`| Enrich requested | ${s.enrichRequested.events} | ${s.enrichRequested.events7d} |`);
    lines.push('');
    lines.push(`- **Search-pick share of picks:** ${s.searchPicks} of ${s.totalPicks} picker picks (${s.searchShare != null ? pct(s.searchShare) : '—'})`);
  }
  lines.push('');

  // ── Enrich-on-demand queue (demand signal for the pipeline) ─────────
  const q = dnaV3.enrichQueue || {};
  if (q.error) {
    lines.push(`- **Enrich queue:** ⚠ read failed: ${q.error}`);
  } else if (!q.total) {
    // Search shipped in 1.0.5, so "awaiting rollout" is stale. If enrich EVENTS
    // are firing in PostHog while the enrich_requests table stays empty, that's
    // a real DB-write gap worth surfacing, not hiding.
    const phEnrich = dnaV3.search?.enrichRequested?.events ?? 0;
    lines.push(phEnrich > 0
      ? `- **Enrich queue:** 0 rows in \`enrich_requests\` — but ${phEnrich} enrich event(s) fired in PostHog. DB-write path may not be wired; investigate.`
      : '- **Enrich queue:** empty (0 requests).');
  } else {
    lines.push(`- **Enrich queue:** ${q.total} requests from ${q.requesters} users · top: ${q.top.map((t) => `${t.label} (${t.requests})`).join(' · ')}`);
  }
  lines.push('');

  return lines;
}

module.exports = { markdownLines, REPLAY_MAX_SHARE };
