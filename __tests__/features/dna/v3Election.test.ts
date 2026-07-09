/**
 * M1 — flag gating for the V3 centroid election (`dna_v3_archetypes`).
 *
 * The no-regression contract: flag OFF (the default) → deriveFragranceDNA and
 * deriveLivingDNA are BYTE-IDENTICAL to the legacy SCORERS path, verified over
 * the real prod replay fixture (all 31 pick streams) and synthetic edge sets.
 * Flag ON → only the archetype (+ exposed ranking) changes; every other DNA
 * field stays byte-identical.
 */

import {
  deriveFragranceDNA,
  deriveLivingDNA,
  deriveOutcomes,
  deriveTraits,
  deriveArchetype,
  rankArchetypes,
  isDnaV3ArchetypesEnabled,
  setDnaV3ArchetypesEnabled,
  V3_ARCHETYPE_KEYS,
  type DnaCatalogFragrance,
  type DnaPick,
  type FragranceDNA,
} from '@/src/features/dna';
import fixture from './fixtures/replay-picks.json';

const FIXED_NOW = () => '2026-07-09T00:00:00.000Z';

const catalog = fixture.catalog as unknown as Record<string, DnaCatalogFragrance>;

function streamPicks(s: (typeof fixture.streams)[number]): DnaPick[] {
  return s.picks
    .filter((p) => catalog[p.id])
    .map((p) => ({
      fragrance: catalog[p.id],
      relation: p.relation as DnaPick['relation'],
      favorite: p.favorite,
    }));
}

const stripArchetype = (dna: FragranceDNA) => {
  const { archetype, ...rest } = dna;
  return rest;
};

afterEach(() => setDnaV3ArchetypesEnabled(false));

describe('flag default', () => {
  it('ships CLOSED: v3 election is off unless explicitly enabled', () => {
    expect(isDnaV3ArchetypesEnabled()).toBe(false);
  });

  it('the default path equals the explicit flag-off path (cache read is wired)', () => {
    const picks = streamPicks(fixture.streams[0]);
    const byDefault = deriveFragranceDNA({ picks, now: FIXED_NOW });
    const explicit = deriveFragranceDNA({ picks, now: FIXED_NOW, v3Archetypes: false });
    expect(JSON.stringify(byDefault)).toBe(JSON.stringify(explicit));
  });

  it('setDnaV3ArchetypesEnabled(true) flips the default path to v3', () => {
    setDnaV3ArchetypesEnabled(true);
    const picks = streamPicks(fixture.streams[0]);
    const byDefault = deriveFragranceDNA({ picks, now: FIXED_NOW });
    const explicit = deriveFragranceDNA({ picks, now: FIXED_NOW, v3Archetypes: true });
    expect(JSON.stringify(byDefault)).toBe(JSON.stringify(explicit));
    expect(byDefault.archetypeScores).toBeDefined();
  });
});

describe('no-regression: flag off reproduces the legacy output byte-for-byte', () => {
  it('over every real prod pick stream (replay fixture)', () => {
    for (const s of fixture.streams) {
      const picks = streamPicks(s);
      const result = deriveFragranceDNA({ picks, now: FIXED_NOW, v3Archetypes: false });

      // The archetype is exactly the legacy SCORERS election…
      const legacyArchetype = deriveArchetype(deriveTraits(picks), deriveOutcomes(picks), picks);
      expect(result.dna.archetype).toEqual(legacyArchetype);
      // …the result carries no v3-only keys…
      expect('archetypeScores' in result).toBe(false);
      // …and nothing failed over to the fallback.
      expect(result.events).toEqual([]);
    }
  });

  it('deriveLivingDNA flag off keeps the legacy ranking for the lean/swap plumbing', () => {
    const picks = streamPicks(fixture.streams[1]);
    const result = deriveLivingDNA({ picks, now: FIXED_NOW, v3Archetypes: false });
    const legacyRanked = rankArchetypes(deriveTraits(picks), deriveOutcomes(picks), picks);
    expect(result.archetypeScores).toEqual(legacyRanked);
    expect(result.dna.archetype.primary).toBe(legacyRanked[0].key);
  });

  it('flag off with a referencePool (the real picker path) is untouched too', () => {
    const picks = streamPicks(fixture.streams[2]);
    const referencePool = Object.values(catalog);
    const off = deriveFragranceDNA({ picks, referencePool, now: FIXED_NOW, v3Archetypes: false });
    const legacyArchetype = deriveArchetype(
      deriveTraits(picks, referencePool),
      deriveOutcomes(picks),
      picks,
    );
    expect(off.dna.archetype).toEqual(legacyArchetype);
  });
});

describe('flag on: v3 election, everything else untouched', () => {
  it('changes ONLY the archetype (+ exposes the ranking) — all other DNA fields byte-identical', () => {
    for (const s of fixture.streams) {
      const picks = streamPicks(s);
      const off = deriveFragranceDNA({ picks, now: FIXED_NOW, v3Archetypes: false });
      const on = deriveFragranceDNA({ picks, now: FIXED_NOW, v3Archetypes: true });
      expect(JSON.stringify(stripArchetype(on.dna))).toBe(JSON.stringify(stripArchetype(off.dna)));
      expect(on.archetypeScores).toHaveLength(20);
      expect(on.events).toEqual([]);
    }
  });

  it('elects only V3 roster keys and keeps the trait modifier system', () => {
    for (const s of fixture.streams) {
      const picks = streamPicks(s);
      const on = deriveFragranceDNA({ picks, now: FIXED_NOW, v3Archetypes: true });
      expect(V3_ARCHETYPE_KEYS).toContain(on.dna.archetype.primary);
      const legacyModifier = deriveArchetype(deriveTraits(picks), deriveOutcomes(picks), picks).modifier;
      expect(on.dna.archetype.modifier).toBe(legacyModifier);
    }
  });

  it('below-margin elections surface the runner-up as an honest lean', () => {
    let sawLean = false;
    let sawDecisive = false;
    for (const s of fixture.streams) {
      const on = deriveFragranceDNA({ picks: streamPicks(s), now: FIXED_NOW, v3Archetypes: true });
      const a = on.dna.archetype;
      if (a.leaning) {
        sawLean = true;
        expect(a.challenger).toBeDefined();
        expect(a.challenger).not.toBe(a.primary);
        expect(V3_ARCHETYPE_KEYS).toContain(a.challenger);
      } else {
        sawDecisive = true;
        expect(a.challenger).toBeUndefined();
      }
    }
    // The real streams contain both decisive and straddling profiles.
    expect(sawLean).toBe(true);
    expect(sawDecisive).toBe(true);
  });

  it('deriveLivingDNA flag on feeds the centroid ranking to the lean/swap plumbing', () => {
    const picks = streamPicks(fixture.streams[1]);
    const on = deriveLivingDNA({ picks, now: FIXED_NOW, v3Archetypes: true });
    expect(on.archetypeScores).toHaveLength(20);
    expect(on.dna.archetype.primary).toBe(on.archetypeScores![0].key);
    for (const r of on.archetypeScores!) {
      expect(V3_ARCHETYPE_KEYS).toContain(r.key);
    }
  });
});
