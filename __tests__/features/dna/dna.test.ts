/**
 * M1 gate — unit coverage for the entire Fragrance DNA derivation engine
 * (pure logic, ships dark). Covers: aggregation (favorite multiplier, want
 * down-weight, avoided subtraction, modal gender, empty edge), outcomes,
 * traits (6 frozen keys + schema), all-12 archetypes + modifier, the scorer
 * hard rails + rail-relaxation, wardrobe slots + completion, journey matching,
 * confidence calibration, the confidence-weighted blend (no-regression path),
 * and the top-level orchestration + compute-failure fallback.
 */

import {
  aggregateFromFragrances,
  deriveOutcomes,
  deriveTraits,
  deriveArchetype,
  scoreFragranceDNA,
  rankWithRelaxation,
  assignSlots,
  deriveWardrobe,
  matchJourney,
  getLadderById,
  computeConfidence,
  blendProfiles,
  dnaToTasteProfile,
  deriveFragranceDNA,
  fallbackDNA,
  deriveDnaFromAnswers,
  TRAIT_KEYS,
  TRAIT_SCHEMA_VERSION,
  FRAGRANCE_DNA_VERSION,
  MIN_CONFIDENCE,
  type DnaCatalogFragrance,
  type DnaPick,
  type FragranceDNA,
} from '@/src/features/dna';
import {
  deriveTasteProfile,
  EMPTY_TASTE_PROFILE,
  type DerivedTasteProfile,
} from '@/src/features/recommend/tasteProfile';

// ── fixtures ────────────────────────────────────────────────────────────────
let seq = 0;
function frag(over: Partial<DnaCatalogFragrance> = {}): DnaCatalogFragrance {
  return {
    id: `f${seq++}`,
    fragrance_family: 'woody',
    gender: 'masculine',
    top_notes: ['bergamot'],
    heart_notes: ['lavender'],
    base_notes: ['cedar'],
    top_accords: ['woody'],
    accord_intensity: { woody: 4 },
    community_longevity: 4,
    community_sillage: 3,
    community_projection: 3,
    compliment_score: 0.5,
    versatility_score: 0.5,
    office_safe_score: 0.5,
    price_tier: 3,
    retail_msrp_usd_cents: 12000,
    popularity_tier: 4,
    release_year: 2015,
    dupe_of: null,
    ...over,
  };
}
const pick = (
  f: DnaCatalogFragrance,
  relation: 'own' | 'want' = 'own',
  favorite = false,
): DnaPick => ({ fragrance: f, relation, favorite });

const FIXED_NOW = () => '2026-06-18T00:00:00.000Z';

// ── aggregateFromFragrances ──────────────────────────────────────────────────
describe('aggregateFromFragrances', () => {
  it('accumulates accords intensity-weighted (intensity/5)', () => {
    const r = aggregateFromFragrances([pick(frag({ top_accords: ['amber'], accord_intensity: { amber: 5 } }))]);
    expect(r.accords.amber).toBeCloseTo(1.0); // 1 * (5/5)
  });

  it('weights the ⭐favorite ~2.5× over a plain own pick', () => {
    const plain = aggregateFromFragrances([pick(frag({ top_accords: ['amber'], accord_intensity: { amber: 5 } }))]);
    const fav = aggregateFromFragrances([pick(frag({ top_accords: ['amber'], accord_intensity: { amber: 5 } }), 'own', true)]);
    expect(fav.accords.amber / plain.accords.amber).toBeCloseTo(2.5);
  });

  it('down-weights a want pick vs an own pick (no luxe drift)', () => {
    const own = aggregateFromFragrances([pick(frag({ top_accords: ['amber'], accord_intensity: { amber: 5 } }), 'own')]);
    const want = aggregateFromFragrances([pick(frag({ top_accords: ['amber'], accord_intensity: { amber: 5 } }), 'want')]);
    expect(want.accords.amber).toBeLessThan(own.accords.amber);
  });

  it('subtracts avoided accords (floored at 0) and seeds dislikedNotes', () => {
    const liked = frag({ top_accords: ['amber'], accord_intensity: { amber: 5 } });
    const hated = frag({ top_accords: ['amber'], accord_intensity: { amber: 5 }, base_notes: ['oud'] });
    const r = aggregateFromFragrances([pick(liked)], [hated]);
    expect(r.accords.amber ?? 0).toBe(0); // 1.0 - 1.0 → cancelled, key dropped
    expect(r.dislikedNotes.oud).toBe(1);
  });

  it('uses modal (most-weighted) gender for the soft lean, never hard', () => {
    const r = aggregateFromFragrances([
      pick(frag({ gender: 'feminine' })),
      pick(frag({ gender: 'feminine' })),
      pick(frag({ gender: 'masculine' })),
    ]);
    expect(r.gender.lean).toBe('feminine');
    expect(r.gender.hard).toBe(false);
  });

  it('handles empty picks without throwing and still records avoidance', () => {
    const r = aggregateFromFragrances([], [frag({ base_notes: ['patchouli'] })]);
    expect(r.accords).toEqual({});
    expect(r.dislikedNotes.patchouli).toBe(1);
  });

  it('derives a soft price target from mean tier, ceiling stays null', () => {
    const r = aggregateFromFragrances([pick(frag({ price_tier: 4 })), pick(frag({ price_tier: 2 }))]);
    expect(r.price.targetTier).toBe(3);
    expect(r.price.ceilingCents).toBeNull();
  });
});

// ── deriveOutcomes ───────────────────────────────────────────────────────────
describe('deriveOutcomes', () => {
  it('reads compliments/officeSafe/versatile directly from columns', () => {
    const o = deriveOutcomes([pick(frag({ compliment_score: 0.9, office_safe_score: 0.2, versatility_score: 0.7 }))]);
    expect(o.compliments).toBeCloseTo(0.9);
    expect(o.officeSafe).toBeCloseTo(0.2);
    expect(o.versatile).toBeCloseTo(0.7);
  });

  it('all outcomes are within 0..1', () => {
    const o = deriveOutcomes([pick(frag({ price_tier: 5, top_accords: ['amber', 'oud'], accord_intensity: { amber: 5, oud: 5 } }))]);
    for (const v of Object.values(o)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('signature is the inverse of breadth (one tight pick → high signature)', () => {
    const tight = deriveOutcomes([pick(frag({ top_accords: ['woody'] }))]);
    expect(tight.signature).toBeGreaterThan(0.5);
  });

  it('returns all-zero on empty picks', () => {
    expect(deriveOutcomes([])).toEqual({
      compliments: 0, officeSafe: 0, smellsLuxe: 0, versatile: 0, dateNight: 0, signature: 0,
    });
  });
});

// ── deriveTraits ─────────────────────────────────────────────────────────────
describe('deriveTraits', () => {
  it('emits all six frozen keys under the versioned schema', () => {
    const t = deriveTraits([pick(frag())]);
    expect(t.schema).toBe(TRAIT_SCHEMA_VERSION);
    expect(Object.keys(t.values).sort()).toEqual([...TRAIT_KEYS].sort());
  });

  it('every trait value is 0..1', () => {
    const t = deriveTraits([pick(frag({ price_tier: 5, compliment_score: 1, community_projection: 5 }))]);
    for (const v of Object.values(t.values)) {
      expect(v).not.toBeNull();
      expect(v as number).toBeGreaterThanOrEqual(0);
      expect(v as number).toBeLessThanOrEqual(1);
    }
  });

  it('higher price tier reads more luxury', () => {
    const lo = deriveTraits([pick(frag({ price_tier: 1 }))]).values.luxury!;
    const hi = deriveTraits([pick(frag({ price_tier: 5 }))]).values.luxury!;
    expect(hi).toBeGreaterThan(lo);
  });

  it('picking a known dupe lifts valueHunter', () => {
    const orig = deriveTraits([pick(frag({ dupe_of: null }))]).values.valueHunter!;
    const dupe = deriveTraits([pick(frag({ dupe_of: 'grail-id' }))]).values.valueHunter!;
    expect(dupe).toBeGreaterThan(orig);
  });

  it('low projection (skin scent) reads low expressive', () => {
    const skin = deriveTraits([pick(frag({ community_projection: 0 }))]).values.expressive!;
    const loud = deriveTraits([pick(frag({ community_projection: 5 }))]).values.expressive!;
    expect(skin).toBeLessThan(loud);
  });

  it('returns null-valued keys (not missing) on empty picks', () => {
    const t = deriveTraits([]);
    expect(Object.keys(t.values).sort()).toEqual([...TRAIT_KEYS].sort());
    expect(t.values.luxury).toBeNull();
  });
});

// ── deriveArchetype (all 12) ─────────────────────────────────────────────────
describe('deriveArchetype', () => {
  const make = (picks: DnaPick[]) => {
    const o = deriveOutcomes(picks);
    const t = deriveTraits(picks);
    return deriveArchetype(t, o, picks);
  };

  it('always lands every user in exactly one archetype', () => {
    const a = make([pick(frag())]);
    expect(typeof a.primary).toBe('string');
    expect(a.primary.startsWith('the_')).toBe(true);
  });

  it('a clear value-hunter → the_smart_shopper', () => {
    const a = make([pick(frag({ dupe_of: 'g', price_tier: 1, compliment_score: 0.3 }))]);
    expect(a.primary).toBe('the_smart_shopper');
  });

  it('a projecting evening amber → seducer/showstopper family', () => {
    const a = make([
      pick(frag({ fragrance_family: 'amber', top_accords: ['amber'], accord_intensity: { amber: 5 }, community_projection: 5, compliment_score: 0.9 })),
    ]);
    expect(['the_seducer', 'the_showstopper']).toContain(a.primary);
  });

  it('populates a snake_case modifier from the secondary trait', () => {
    const a = make([pick(frag({ price_tier: 5, compliment_score: 0.9 }))]);
    if (a.modifier !== null) expect(a.modifier).toMatch(/^[a-z_]+$/);
  });

  it('is deterministic for identical input', () => {
    const p = [pick(frag({ price_tier: 4 }))];
    expect(make(p).primary).toBe(make(p).primary);
  });
});

// ── scoreFragranceDNA hard rails ─────────────────────────────────────────────
describe('scoreFragranceDNA — hard rails', () => {
  const baseDna = (over: Partial<FragranceDNA> = {}): FragranceDNA => ({
    ...deriveFragranceDNA({
      picks: [pick(frag({ top_accords: ['amber'], accord_intensity: { amber: 5 } }))],
      now: FIXED_NOW,
    }).dna,
    ...over,
  });

  it('excludes on the gender hard rail (non-matching, non-unisex)', () => {
    const dna = baseDna({ gender: { lean: 'feminine', hard: true } });
    expect(scoreFragranceDNA(frag({ gender: 'masculine' }), dna)).toBeNull();
    expect(scoreFragranceDNA(frag({ gender: 'unisex' }), dna)).not.toBeNull();
  });

  it('excludes above the projection cap', () => {
    const dna = baseDna({ projectionCap: 3 });
    expect(scoreFragranceDNA(frag({ community_projection: 5 }), dna)).toBeNull();
    expect(scoreFragranceDNA(frag({ community_projection: 2 }), dna)).not.toBeNull();
  });

  it('excludes above the price ceiling', () => {
    const dna = baseDna({ price: { targetTier: 2, ceilingCents: 5000 } });
    expect(scoreFragranceDNA(frag({ retail_msrp_usd_cents: 9000 }), dna)).toBeNull();
    expect(scoreFragranceDNA(frag({ retail_msrp_usd_cents: 4000 }), dna)).not.toBeNull();
  });

  it('returns {score, reasons} with an accord reason on a match', () => {
    const dna = baseDna();
    const res = scoreFragranceDNA(frag({ top_accords: ['amber'], accord_intensity: { amber: 5 } }), dna);
    expect(res).not.toBeNull();
    expect(res!.score).toBeGreaterThan(0);
    expect(res!.reasons.join(' ').toLowerCase()).toContain('amber');
  });
});

// ── rankWithRelaxation ───────────────────────────────────────────────────────
describe('rankWithRelaxation', () => {
  const dnaWith = (over: Partial<FragranceDNA>): FragranceDNA => ({
    ...deriveFragranceDNA({ picks: [pick(frag())], now: FIXED_NOW }).dna,
    ...over,
  });

  it('returns ranked recs sorted by score descending', () => {
    const dna = dnaWith({ accords: { amber: 5 } });
    const pool = [
      frag({ top_accords: ['amber'], accord_intensity: { amber: 5 } }),
      frag({ top_accords: ['woody'], accord_intensity: { woody: 1 } }),
    ];
    const { recs } = rankWithRelaxation(pool, dna);
    expect(recs[0].fragrance.top_accords).toContain('amber');
    expect(recs[0].score).toBeGreaterThanOrEqual(recs[1].score);
  });

  it('relaxes price ceiling first to avoid an empty pool', () => {
    const dna = dnaWith({ price: { targetTier: 1, ceilingCents: 1000 } });
    const pool = [frag({ retail_msrp_usd_cents: 30000 })];
    const { recs, relaxed } = rankWithRelaxation(pool, dna);
    expect(recs.length).toBe(1);
    expect(relaxed[0]).toBe('price');
  });

  it('cascades relaxation (price → projection) when needed', () => {
    const dna = dnaWith({ price: { targetTier: 1, ceilingCents: 1000 }, projectionCap: 1 });
    const pool = [frag({ retail_msrp_usd_cents: 30000, community_projection: 5 })];
    const { recs, relaxed } = rankWithRelaxation(pool, dna);
    expect(recs.length).toBe(1);
    expect(relaxed).toEqual(['price', 'projection']);
  });

  it('never returns empty for a non-empty pool (gender relax last)', () => {
    const dna = dnaWith({
      gender: { lean: 'feminine', hard: true },
      price: { targetTier: 1, ceilingCents: 1000 },
      projectionCap: 1,
    });
    const pool = [frag({ gender: 'masculine', retail_msrp_usd_cents: 30000, community_projection: 5 })];
    const { recs, relaxed } = rankWithRelaxation(pool, dna);
    expect(recs.length).toBe(1);
    expect(relaxed).toEqual(['price', 'projection', 'gender']);
  });

  it('returns an empty result only for an empty pool', () => {
    expect(rankWithRelaxation([], dnaWith({})).recs).toEqual([]);
  });
});

// ── wardrobe ─────────────────────────────────────────────────────────────────
describe('wardrobe', () => {
  it('assigns office slot for an office-safe fragrance', () => {
    expect(assignSlots(frag({ office_safe_score: 0.9 }))).toContain('office');
  });

  it('assigns a date slot for a projecting evening amber', () => {
    expect(assignSlots(frag({ fragrance_family: 'amber', top_accords: ['amber'], community_projection: 4 }))).toContain('date');
  });

  it('computes completion as filledSlots / 6 and names the biggest gap', () => {
    const owned = [frag({ versatility_score: 0.9, office_safe_score: 0.9 })];
    const w = deriveWardrobe(owned);
    expect(w.completion).toBeGreaterThan(0);
    expect(w.completion).toBeLessThanOrEqual(1);
    expect(w.biggestGap).not.toBeNull();
  });

  it('an empty wardrobe is 0% complete with all slots false', () => {
    const w = deriveWardrobe([]);
    expect(w.completion).toBe(0);
    expect(Object.values(w.slots).every((v) => v === false)).toBe(true);
    expect(w.biggestGap).toBe('signature');
  });
});

// ── journey ──────────────────────────────────────────────────────────────────
describe('matchJourney', () => {
  const dna = deriveFragranceDNA({
    picks: [pick(frag({ fragrance_family: 'woody', top_accords: ['woody'], accord_intensity: { woody: 5 } }))],
    now: FIXED_NOW,
  }).dna;

  it('matches a ladder and places the user on a valid stage', () => {
    const j = matchJourney(dna);
    expect(typeof j.ladderId).toBe('string');
    expect(j.stage).toBeGreaterThanOrEqual(1);
    expect(j.stage).toBeLessThanOrEqual(4);
    expect(j.nextLikely.length).toBeGreaterThan(0);
    expect(j.source).toBe('editorial');
  });

  it('resolves the matched ladderId back to its authored ladder (M8 view)', () => {
    const j = matchJourney(dna);
    const ladder = getLadderById(j.ladderId);
    expect(ladder).not.toBeNull();
    expect(ladder!.id).toBe(j.ladderId);
    // The matched stage indexes into the ladder's authored rungs.
    expect(ladder!.stages.length).toBeGreaterThanOrEqual(j.stage);
    expect(ladder!.stages[j.stage - 1].label).toBe(j.stageLabel);
  });

  it('returns null for an unknown / empty ladder id', () => {
    expect(getLadderById('nope')).toBeNull();
    expect(getLadderById(null)).toBeNull();
    expect(getLadderById(undefined)).toBeNull();
  });
});

// ── computeConfidence ────────────────────────────────────────────────────────
describe('computeConfidence', () => {
  it('floors at 0.1 with zero signal', () => {
    expect(computeConfidence({ seedCount: 0, answeredCount: 0, weights: {} })).toBe(MIN_CONFIDENCE);
  });

  it('rises monotonically with pick count', () => {
    const c1 = computeConfidence({ seedCount: 1, answeredCount: 0, weights: { a: 1 } });
    const c3 = computeConfidence({ seedCount: 3, answeredCount: 0, weights: { a: 1, b: 1, c: 1 } });
    expect(c3).toBeGreaterThan(c1);
  });

  it('lands ~0.38 around two picks (calibration target)', () => {
    const c = computeConfidence({ seedCount: 2, answeredCount: 0, weights: { a: 1, b: 1, c: 1, d: 1 } });
    expect(c).toBeGreaterThan(0.3);
    expect(c).toBeLessThan(0.5);
  });

  it('never exceeds the ceiling', () => {
    const c = computeConfidence({ seedCount: 100, answeredCount: 100, weights: Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`a${i}`, 1])) });
    expect(c).toBeLessThanOrEqual(0.95);
  });
});

// ── blend (the most-used path) ───────────────────────────────────────────────
describe('blendProfiles', () => {
  const passive: DerivedTasteProfile = deriveTasteProfile([
    { fragrance: frag({ top_accords: ['fresh'], accord_intensity: { fresh: 5 } }) as never, weight: 1 },
  ]);

  it('returns the passive profile unchanged when DNA is absent (NO REGRESSION)', () => {
    expect(blendProfiles(null, passive)).toBe(passive);
    expect(blendProfiles(null, EMPTY_TASTE_PROFILE)).toBe(EMPTY_TASTE_PROFILE);
  });

  it('a high-confidence DNA dominates the blend', () => {
    const dna = deriveFragranceDNA({ picks: [pick(frag({ top_accords: ['amber'], accord_intensity: { amber: 5 } }))], now: FIXED_NOW }).dna;
    dna.confidence = 1;
    const blended = blendProfiles(dna, passive);
    // amber comes only from DNA, fresh only from passive; at confidence 1 amber leads.
    expect(blended.preferred_accords.amber).toBeGreaterThan(blended.preferred_accords.fresh ?? 0);
  });

  it('a zero-confidence DNA leaves passive signal intact', () => {
    const dna = deriveFragranceDNA({ picks: [pick(frag({ top_accords: ['amber'], accord_intensity: { amber: 5 } }))], now: FIXED_NOW }).dna;
    dna.confidence = 0;
    const blended = blendProfiles(dna, passive);
    expect(blended.preferred_accords.fresh).toBeCloseTo(passive.preferred_accords.fresh);
  });

  it('dnaToTasteProfile maps the envelope onto the passive shape', () => {
    const dna = deriveFragranceDNA({ picks: [pick(frag())], now: FIXED_NOW }).dna;
    const p = dnaToTasteProfile(dna);
    expect(p.preferred_accords).toEqual(dna.accords);
    expect(p.avg_price_tier).toBe(dna.price.targetTier);
  });
});

// ── deriveFragranceDNA orchestration + compute-failure fallback ──────────────
describe('deriveFragranceDNA', () => {
  it('produces a structurally complete v2 envelope', () => {
    const { dna, events } = deriveFragranceDNA({
      picks: [pick(frag({ top_accords: ['amber'], accord_intensity: { amber: 5 } }), 'own', true)],
      now: FIXED_NOW,
    });
    expect(dna.version).toBe(FRAGRANCE_DNA_VERSION);
    expect(dna.category).toBe('fragrance');
    expect(dna.traits.schema).toBe(TRAIT_SCHEMA_VERSION);
    expect(dna.archetype.primary).toBeDefined();
    expect(dna.journey).not.toBeNull();
    expect(dna.wardrobe).not.toBeNull();
    expect(dna.seeds).toHaveLength(1);
    expect(dna.updatedAt).toBe('2026-06-18T00:00:00.000Z');
    expect(events).toEqual([]);
  });

  it('gate→ineligible cannot crash: empty picks yields a valid low-confidence DNA', () => {
    const { dna } = deriveFragranceDNA({ picks: [], now: FIXED_NOW });
    expect(dna.version).toBe(FRAGRANCE_DNA_VERSION);
    expect(dna.confidence).toBe(MIN_CONFIDENCE);
    expect(dna.seeds).toEqual([]);
  });

  it('records want vs own provenance in seeds', () => {
    const { dna } = deriveFragranceDNA({
      picks: [pick(frag(), 'own', true), pick(frag(), 'want')],
      now: FIXED_NOW,
    });
    expect(dna.seeds[0]).toMatchObject({ relation: 'own', favorite: true });
    expect(dna.seeds[1]).toMatchObject({ relation: 'want', favorite: false });
  });

  it('on compute failure emits the dumb fallback DNA + dna_compute_failed', () => {
    // Force a throw inside aggregation via a malformed pick (null accords array).
    const broken = pick({ ...frag(), top_accords: null as unknown as string[] });
    const { dna, events } = deriveFragranceDNA({ picks: [broken], now: FIXED_NOW });
    expect(events).toContain('dna_compute_failed');
    expect(dna.confidence).toBe(0.1);
    expect(dna.version).toBe(FRAGRANCE_DNA_VERSION);
  });

  it('fallbackDNA is a valid envelope with confidence 0.1', () => {
    const dna = fallbackDNA([pick(frag())], [], 'picker', FIXED_NOW);
    expect(dna.confidence).toBe(0.1);
    expect(dna.traits.values.luxury).toBeNull();
    expect(dna.archetype.primary).toBe('the_explorer');
  });
});

// ── M5: question-fallback derivation (S1b) ──────────────────────────────────
describe('deriveDnaFromAnswers (question fallback)', () => {
  const pool: DnaCatalogFragrance[] = [
    frag({ id: 'wood1', fragrance_family: 'woody', top_accords: ['woody'], popularity_tier: 5 }),
    frag({ id: 'wood2', fragrance_family: 'woody aromatic', top_accords: ['woody'], popularity_tier: 4 }),
    frag({ id: 'flo1', fragrance_family: 'floral', top_accords: ['floral'], accord_intensity: { floral: 4 }, popularity_tier: 5 }),
    frag({ id: 'flo2', fragrance_family: 'white floral', top_accords: ['floral'], accord_intensity: { floral: 3 }, popularity_tier: 3 }),
    frag({ id: 'fresh1', fragrance_family: 'citrus', top_accords: ['citrus'], accord_intensity: { citrus: 4 }, popularity_tier: 4 }),
  ];

  it('emits an identical v2 envelope shape, tagged source: question_fallback', () => {
    const { dna } = deriveDnaFromAnswers(
      { family: 'woody', occasion: 'office', price: '2' },
      pool,
      { now: FIXED_NOW },
    );
    expect(dna.version).toBe(FRAGRANCE_DNA_VERSION);
    expect(dna.source).toBe('question_fallback');
    expect(dna.traits.schema).toBe(TRAIT_SCHEMA_VERSION);
    // Every user lands in exactly one archetype, like the picker path.
    expect(dna.archetype.primary).toBeTruthy();
    expect(dna.seeds.length).toBeGreaterThan(0);
  });

  it('seeds from the chosen family (woody → woody bottles, not florals)', () => {
    const { dna } = deriveDnaFromAnswers({ family: 'woody' }, pool, { now: FIXED_NOW });
    const seedIds = dna.seeds.map((s) => s.id);
    expect(seedIds).toContain('wood1');
    expect(seedIds).not.toContain('flo1');
    expect(dna.families.woody).toBeGreaterThan(0);
  });

  it('applies the price answer as an explicit hard ceiling + target tier', () => {
    const { dna } = deriveDnaFromAnswers({ family: 'floral', price: '1' }, pool, { now: FIXED_NOW });
    expect(dna.price.targetTier).toBe(1);
    expect(dna.price.ceilingCents).toBe(5000);
    // tier 4 (niche) carries no ceiling.
    const niche = deriveDnaFromAnswers({ family: 'floral', price: '4' }, pool, { now: FIXED_NOW });
    expect(niche.dna.price.ceilingCents).toBeNull();
  });

  it('falls back to the most recognizable bottles when the family matches nothing', () => {
    const { dna } = deriveDnaFromAnswers({ family: 'gourmand' }, pool, { now: FIXED_NOW });
    // No gourmand in pool → still a real, non-empty envelope from top bottles.
    expect(dna.seeds.length).toBeGreaterThan(0);
    expect(dna.confidence).toBeGreaterThan(0.1); // not the dumb compute-failure fallback
  });
});
