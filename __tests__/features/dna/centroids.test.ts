/**
 * M1 — the 20-centroid roster + weighted-distance election (centroids.ts).
 * Structural sanity (targets/weights well-formed), the reachability tiling
 * property (every centroid wins on its own target point — a dead centroid is
 * a placement bug), determinism, and margin → lean behavior.
 */

import {
  CENTROIDS,
  centroidDistance,
  electArchetype,
  V3_ARCHETYPE_KEYS,
  V3_LEAN_MARGIN,
} from '@/src/features/dna/centroids';
import { NEUTRAL_AXIS, type UserAxisVector } from '@/src/features/dna/axes';
import { CATALOG_AXES, USER_RELATIVE_AXES, type DnaAxis } from '@/src/features/dna/axisNorms';

const ALL_AXES: DnaAxis[] = [...CATALOG_AXES, ...USER_RELATIVE_AXES];

function neutralVector(): UserAxisVector {
  const v = {} as UserAxisVector;
  for (const a of ALL_AXES) v[a] = NEUTRAL_AXIS;
  return v;
}

/** A user sitting exactly on a centroid's target profile (neutral elsewhere). */
function vectorAt(key: (typeof V3_ARCHETYPE_KEYS)[number]): UserAxisVector {
  const v = neutralVector();
  for (const [axis, spec] of Object.entries(CENTROIDS[key])) {
    v[axis as DnaAxis] = spec.t;
  }
  return v;
}

describe('roster structure', () => {
  it('has exactly the 20 V2 keys — crowd_pleaser and rebel are not electable', () => {
    expect(V3_ARCHETYPE_KEYS).toHaveLength(20);
    expect(Object.keys(CENTROIDS).sort()).toEqual([...V3_ARCHETYPE_KEYS].sort());
    expect(V3_ARCHETYPE_KEYS).not.toContain('the_crowd_pleaser');
    expect(V3_ARCHETYPE_KEYS).not.toContain('the_rebel');
  });

  it('every centroid has sane targets ([0,1]) and positive weights on real axes', () => {
    for (const key of V3_ARCHETYPE_KEYS) {
      const profile = CENTROIDS[key];
      const axes = Object.keys(profile) as DnaAxis[];
      expect(axes.length).toBeGreaterThanOrEqual(2); // a 1-axis centroid is a scorer, not a centroid
      for (const axis of axes) {
        expect(ALL_AXES).toContain(axis);
        const { t, w } = profile[axis]!;
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThanOrEqual(1);
        expect(w).toBeGreaterThan(0);
      }
    }
  });

  it('no centroid depends on adventurousness with meaningful weight (dead axis for the all-popular pool)', () => {
    for (const key of V3_ARCHETYPE_KEYS) {
      const spec = CENTROIDS[key].adventurousness;
      if (spec) expect(spec.w).toBeLessThanOrEqual(0.3);
    }
  });
});

describe('election', () => {
  it('every centroid is REACHABLE: a user at its target point elects it', () => {
    for (const key of V3_ARCHETYPE_KEYS) {
      const e = electArchetype(vectorAt(key));
      expect(e.primary).toBe(key);
    }
  });

  it('ranks all 20 with finite scores in [0,1], strongest first', () => {
    const e = electArchetype(neutralVector());
    expect(e.ranked).toHaveLength(20);
    for (let i = 1; i < e.ranked.length; i++) {
      expect(e.ranked[i].score).toBeLessThanOrEqual(e.ranked[i - 1].score);
    }
    for (const r of e.ranked) {
      expect(Number.isFinite(r.score)).toBe(true);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic, with roster-order tie-breaks', () => {
    const v = neutralVector();
    const a = electArchetype(v);
    const b = electArchetype(v);
    expect(a.primary).toBe(b.primary);
    expect(a.ranked.map((r) => r.key)).toEqual(b.ranked.map((r) => r.key));
  });

  it('margin = distance gap, lean flips below V3_LEAN_MARGIN', () => {
    for (const key of V3_ARCHETYPE_KEYS) {
      const e = electArchetype(vectorAt(key));
      const dBest = centroidDistance(vectorAt(key), CENTROIDS[e.primary]);
      const dRunner = centroidDistance(vectorAt(key), CENTROIDS[e.runnerUp]);
      expect(e.margin).toBeCloseTo(dRunner - dBest);
      expect(e.margin).toBeGreaterThanOrEqual(0);
      expect(e.lean).toBe(e.margin < V3_LEAN_MARGIN);
      expect(e.runnerUp).not.toBe(e.primary);
    }
  });

  it('election responds to the signature axis: pushing a user along it changes the winner', () => {
    const v = neutralVector();
    v.sweetness = 0.95;
    v.presence = 0.75;
    expect(electArchetype(v).primary).toBe('the_gourmand');
    const dark = neutralVector();
    dark.darkness = 0.95;
    expect(electArchetype(dark).primary).toBe('the_night_owl');
  });
});
