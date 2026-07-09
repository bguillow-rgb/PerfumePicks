/**
 * DNA V3 KPI source — pure rollup logic (M5).
 *
 * The fetchers hit prod read-only and are exercised by running the dashboard;
 * these tests pin the pure rollups the panel is built on: archetype
 * distribution (owner exclusion, shares, modifier + lean counts), roster
 * classification, and search-pick adoption (docked|promoted vs total picks,
 * the awaiting-rollout degradation).
 */

/* eslint-disable @typescript-eslint/no-var-requires */
const {
  classifyLabel,
  rollupArchetypes,
  rollupSearch,
  V3_KEPT,
  V3_NEW,
  OWNER_USER_ID,
} = require('../../scripts/kpi/sources/dna-v3');

describe('classifyLabel', () => {
  it('covers the 20-key V3 roster', () => {
    expect(V3_KEPT).toHaveLength(10);
    expect(V3_NEW).toHaveLength(10);
    for (const k of V3_KEPT) expect(classifyLabel(k)).toBe('kept');
    for (const k of V3_NEW) expect(classifyLabel(k)).toBe('v3-new');
  });

  it('marks retired/legacy keys as legacy-only', () => {
    expect(classifyLabel('the_rebel')).toBe('legacy-only');
    expect(classifyLabel('the_crowd_pleaser')).toBe('legacy-only');
  });
});

describe('rollupArchetypes', () => {
  const row = (userId: string, archetype: Record<string, unknown>) => ({
    user_id: userId,
    archetype,
  });

  it('counts primaries, modifiers, and persisted leans; owner excluded', () => {
    const rows = [
      row('u1', { primary: 'the_seducer', modifier: 'luxury' }),
      row('u2', { primary: 'the_seducer', modifier: 'expressive', challenger: 'the_gourmand', leaning: true }),
      row('u3', { primary: 'the_gourmand', modifier: null }),
      // challenger without leaning=true is NOT a surfaced lean
      row('u4', { primary: 'the_romantic', modifier: 'luxury', challenger: 'the_purist', leaning: false }),
      row(OWNER_USER_ID, { primary: 'the_night_owl', modifier: 'collector' }),
    ];
    const r = rollupArchetypes(rows);
    expect(r.total).toBe(4); // owner dropped
    expect(r.distinct).toBe(3);
    expect(r.maxShare).toEqual(
      expect.objectContaining({ key: 'the_seducer', count: 2, share: 0.5, roster: 'kept' }),
    );
    expect(r.modifiers).toEqual([
      { key: 'luxury', count: 2 },
      { key: 'expressive', count: 1 },
    ]);
    expect(r.leans).toEqual({ count: 1, byChallenger: [{ key: 'the_gourmand', count: 1 }] });
  });

  it('skips rows with no archetype envelope and degrades to empty', () => {
    expect(rollupArchetypes([row('u1', undefined as never), { user_id: 'u2' } as never])).toEqual(
      expect.objectContaining({ total: 0, labels: [], distinct: 0, maxShare: null }),
    );
    expect(rollupArchetypes([])).toEqual(
      expect.objectContaining({ total: 0, leans: { count: 0, byChallenger: [] } }),
    );
  });

  it('shares sum to 1 over real labels', () => {
    const rows = ['a', 'b', 'c'].map((u, i) =>
      row(u, { primary: i === 0 ? 'the_purist' : 'the_explorer', modifier: null }),
    );
    const r = rollupArchetypes(rows);
    const sum = r.labels.reduce((s: number, l: { share: number }) => s + l.share, 0);
    expect(sum).toBeCloseTo(1);
  });
});

describe('rollupSearch', () => {
  // PostHog rows: [event, outcome, events, users, events7d]
  const rows = [
    ['search_opened', '', 12, 5, 4],
    ['search_result_picked', 'docked', 6, 4, 2],
    ['search_result_picked', 'promoted', 2, 2, 1],
    ['search_no_results', '', 3, 2, 0],
    ['search_enrich_requested', '', 1, 1, 1],
  ];

  it('splits picked by outcome and computes search share of all picks', () => {
    const r = rollupSearch(rows, 100);
    expect(r.opened).toEqual({ events: 12, users: 5, events7d: 4 });
    expect(r.docked.events).toBe(6);
    expect(r.promoted.events).toBe(2);
    expect(r.picked.events).toBe(8); // both outcomes
    expect(r.searchPicks).toBe(8);
    expect(r.searchShare).toBeCloseTo(0.08);
    expect(r.awaitingRollout).toBe(false);
  });

  it('degrades to awaiting-rollout on zero events (pre-1.0.5 prod)', () => {
    const r = rollupSearch([], 214);
    expect(r.awaitingRollout).toBe(true);
    expect(r.searchPicks).toBe(0);
    expect(r.totalPicks).toBe(214);
    expect(r.searchShare).toBe(0);
  });

  it('handles zero total picks without dividing by zero', () => {
    const r = rollupSearch([], 0);
    expect(r.searchShare).toBeNull();
    expect(r.awaitingRollout).toBe(true);
  });
});

describe('formatter degradation (dna-v3-render)', () => {
  const { markdownLines } = require('../../scripts/kpi/formatters/dna-v3-render');

  it('renders awaiting-rollout rows, not errors, pre-rollout', () => {
    const out = markdownLines({
      flag: { present: false, raw: null, enabled: false },
      archetypes: rollupArchetypes([
        { user_id: 'u1', archetype: { primary: 'the_seducer', modifier: 'luxury' } },
      ]),
      search: { configured: true, ...rollupSearch([], 214) },
      enrichQueue: { total: 0, requesters: 0, top: [] },
    }).join('\n');
    expect(out).toContain('LEGACY scorers');
    expect(out).toContain('legacy (pre-V3)');
    expect(out).toContain('awaiting rollout');
    expect(out).toContain('0 of 214 picker picks');
    expect(out).not.toContain('undefined');
    expect(out).not.toContain('NaN');
  });

  it('never throws on a completely empty payload', () => {
    expect(() => markdownLines(undefined)).not.toThrow();
    expect(() => markdownLines({})).not.toThrow();
    expect(markdownLines({}).join('\n')).not.toContain('undefined');
  });
});
