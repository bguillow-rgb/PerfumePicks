/**
 * Picker search pure logic (V3 M4 — FEATURE_PICKER_SEARCH.md).
 *
 * Covers the deliberate-weight composition (SEARCH_DELIBERATE_WEIGHT = 1.5,
 * composed multiplicatively with the ⭐ favorite anchor), the completeness
 * gate, and buildDnaPicks — the extracted pick-list builder startCompute uses,
 * so the weight path is testable without mounting the screen.
 */

import {
  SEARCH_DELIBERATE_WEIGHT,
  searchPickWeight,
  isSearchResultComplete,
  buildDnaPicks,
} from '@/src/features/dna/pickerSearch';
import { FAVORITE_MULTIPLIER, resolvePickWeight } from '@/src/features/dna/metrics';
import type { PickerCandidate } from '@/src/features/quiz/pickerGrid';

function candidate(id: string, over: Partial<PickerCandidate> = {}): PickerCandidate {
  return {
    id,
    brand: 'Test House',
    name: id,
    image_url: `https://img.test/${id}.jpg`,
    fragrance_family: 'amber',
    gender: 'unisex',
    top_accords: ['vanilla', 'amber'],
    community_projection: 3,
    compliment_score: 0.5,
    popularity_tier: 4,
    ...over,
  };
}

describe('searchPickWeight — deliberate-signal composition', () => {
  it('is 1.5 for a plain search pick', () => {
    expect(SEARCH_DELIBERATE_WEIGHT).toBe(1.5);
    expect(searchPickWeight(false)).toBe(1.5);
  });

  it('composes multiplicatively with the favorite anchor: 1.5 × 2.5', () => {
    expect(searchPickWeight(true)).toBe(SEARCH_DELIBERATE_WEIGHT * FAVORITE_MULTIPLIER);
    expect(searchPickWeight(true)).toBeCloseTo(3.75, 10);
  });
});

describe('isSearchResultComplete — the completeness gate', () => {
  it('passes when family AND accords are present', () => {
    expect(isSearchResultComplete(candidate('ok'))).toBe(true);
  });

  it('fails on empty accords (the enrich-on-demand trigger)', () => {
    expect(isSearchResultComplete(candidate('bare', { top_accords: [] }))).toBe(false);
  });

  it('fails on a missing family', () => {
    expect(isSearchResultComplete(candidate('nofam', { fragrance_family: '' }))).toBe(false);
  });
});

describe('buildDnaPicks — selection across sources at compute time', () => {
  const grid1 = candidate('grid-1');
  const grid2 = candidate('grid-2');
  const searched = candidate('searched-1');

  function byIdOf(...frags: PickerCandidate[]): Map<string, PickerCandidate> {
    return new Map(frags.map((f) => [f.id, f]));
  }

  it('mixed 1 search + N grid: one currency, only the search pick carries weight', () => {
    const picks = buildDnaPicks({
      selectedIds: ['grid-1', 'searched-1', 'grid-2'],
      favoriteId: null,
      searchPickedIds: ['searched-1'],
      byId: byIdOf(grid1, grid2, searched),
    });
    expect(picks).toHaveLength(3);
    for (const p of picks) {
      expect(p.relation).toBe('like'); // taste signal — never wardrobe
    }
    const [g1, s, g2] = picks;
    expect(g1.weight).toBeUndefined(); // grid picks ride the legacy pickWeight path
    expect(g2.weight).toBeUndefined();
    expect(s.weight).toBe(1.5);
    // resolvePickWeight honors the explicit weight verbatim.
    expect(resolvePickWeight(s)).toBe(1.5);
    expect(resolvePickWeight(g1)).toBe(1); // 'like' non-favorite → 1.0
  });

  it('favorite search pick composes 1.5 × 2.5 = 3.75', () => {
    const picks = buildDnaPicks({
      selectedIds: ['searched-1'],
      favoriteId: 'searched-1',
      searchPickedIds: ['searched-1'],
      byId: byIdOf(searched),
    });
    expect(picks[0].favorite).toBe(true);
    expect(picks[0].weight).toBeCloseTo(3.75, 10);
    expect(resolvePickWeight(picks[0])).toBeCloseTo(3.75, 10);
  });

  it('favorite GRID pick keeps the legacy path (no explicit weight, 2.5 via fallback)', () => {
    const picks = buildDnaPicks({
      selectedIds: ['grid-1'],
      favoriteId: 'grid-1',
      searchPickedIds: [],
      byId: byIdOf(grid1),
    });
    expect(picks[0].weight).toBeUndefined();
    expect(resolvePickWeight(picks[0])).toBe(FAVORITE_MULTIPLIER);
  });

  it('a promoted grid dupe (search-picked, in-pool) gets the deliberate weight', () => {
    const picks = buildDnaPicks({
      selectedIds: ['grid-1', 'grid-2'],
      favoriteId: null,
      searchPickedIds: ['grid-2'], // searched a bottle that was already on the wall
      byId: byIdOf(grid1, grid2),
    });
    expect(picks[0].weight).toBeUndefined();
    expect(picks[1].weight).toBe(1.5);
  });

  it('drops ids missing from byId (the compute-lookup contract: cache must be merged)', () => {
    const picks = buildDnaPicks({
      selectedIds: ['grid-1', 'searched-1'],
      favoriteId: null,
      searchPickedIds: ['searched-1'],
      byId: byIdOf(grid1), // cache NOT merged — the searched row is unknown
    });
    expect(picks).toHaveLength(1);
    expect(picks[0].fragrance.id).toBe('grid-1');
  });
});
