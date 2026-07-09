/**
 * Picker store — search-pick state machine (V3 M4, FEATURE_PICKER_SEARCH.md).
 *
 * pickFromSearch outcomes (docked / promoted / max / noop), the single cap
 * guard across sources, dupe promotion (no duplicate tile), the
 * deselect-stays-pinned-greyed session behavior, and abandonment clearing
 * (reset wipes query-side state wholesale).
 */

import { useDnaPickerStore } from '@/src/stores/useDnaPickerStore';
import { MAX_PICKS, type PickerCandidate } from '@/src/features/quiz/pickerGrid';

function candidate(id: string, over: Partial<PickerCandidate> = {}): PickerCandidate {
  return {
    id,
    brand: 'Test House',
    name: id,
    image_url: `https://img.test/${id}.jpg`,
    fragrance_family: 'amber',
    gender: 'unisex',
    top_accords: ['vanilla'],
    community_projection: 3,
    compliment_score: 0.5,
    popularity_tier: 4,
    ...over,
  };
}

const state = () => useDnaPickerStore.getState();

beforeEach(() => {
  state().reset();
});

describe('pickFromSearch — dock (new bottle, not in grid)', () => {
  it('pins to slot 0, selects, marks search-picked, and caches the row for compute', () => {
    const f = candidate('byredo-mojave-ghost');
    expect(state().pickFromSearch(f, false)).toBe('docked');
    expect(state().selectedIds).toContain(f.id);
    expect(state().searchPickedIds).toContain(f.id);
    expect(state().pinned[0]?.id).toBe(f.id);
    expect(state().searchPickCache[f.id]).toBe(f); // the byId merge source
  });

  it('a second dock goes to slot 0, ahead of the first', () => {
    state().pickFromSearch(candidate('first'), false);
    state().pickFromSearch(candidate('second'), false);
    expect(state().pinned.map((p) => p.id)).toEqual(['second', 'first']);
  });
});

describe('pickFromSearch — dupe of a grid tile', () => {
  it('promotes without pinning a duplicate tile', () => {
    const f = candidate('grid-bottle');
    expect(state().pickFromSearch(f, true)).toBe('promoted');
    expect(state().selectedIds).toContain(f.id);
    expect(state().searchPickedIds).toContain(f.id);
    expect(state().pinned).toHaveLength(0); // no second tile — the grid tile is selected instead
  });

  it('promotes an ALREADY-SELECTED grid pick to deliberate weight (no re-add)', () => {
    state().toggleSelect('grid-bottle');
    const f = candidate('grid-bottle');
    expect(state().pickFromSearch(f, true)).toBe('promoted');
    expect(state().selectedIds.filter((id) => id === 'grid-bottle')).toHaveLength(1);
    expect(state().searchPickedIds).toContain('grid-bottle');
  });

  it('is a noop when the tile is already selected AND already search-picked', () => {
    const f = candidate('grid-bottle');
    state().pickFromSearch(f, true);
    expect(state().pickFromSearch(f, true)).toBe('noop');
  });
});

describe('pickFromSearch — the cap guard (one currency across sources)', () => {
  beforeEach(() => {
    for (let i = 0; i < MAX_PICKS; i++) state().toggleSelect(`grid-${i}`);
  });

  it('blocks a NEW search pick past MAX_PICKS and changes nothing', () => {
    const before = state().selectedIds;
    const f = candidate('one-too-many');
    expect(state().pickFromSearch(f, false)).toBe('max');
    expect(state().selectedIds).toEqual(before);
    expect(state().searchPickedIds).toHaveLength(0);
    expect(state().pinned).toHaveLength(0);
    expect(state().searchPickCache[f.id]).toBeUndefined();
  });

  it('still PROMOTES an already-selected tile at the cap (not a new pick)', () => {
    expect(state().pickFromSearch(candidate('grid-0'), true)).toBe('promoted');
    expect(state().selectedIds).toHaveLength(MAX_PICKS);
    expect(state().searchPickedIds).toContain('grid-0');
  });
});

describe('deselect gold tile — stays pinned (greyed) for the session', () => {
  it('deselect clears selection + favorite but keeps pinned + search-picked marker', () => {
    const f = candidate('gold-tile');
    state().pickFromSearch(f, false);
    state().setFavorite(f.id);
    state().toggleSelect(f.id); // deselect

    expect(state().selectedIds).not.toContain(f.id);
    expect(state().favoriteId).toBeNull(); // favorite/relation cleared
    expect(state().relations[f.id]).toBeUndefined();
    expect(state().pinned.map((p) => p.id)).toContain(f.id); // still on the wall, greyed
    expect(state().searchPickedIds).toContain(f.id); // gold status is session-sticky
  });

  it('re-docking a deselected pinned bottle re-selects without duplicating the pin', () => {
    const f = candidate('gold-tile');
    state().pickFromSearch(f, false);
    state().toggleSelect(f.id); // deselect
    expect(state().pickFromSearch(f, false)).toBe('docked');
    expect(state().selectedIds).toContain(f.id);
    expect(state().pinned.filter((p) => p.id === f.id)).toHaveLength(1);
  });

  it('re-tapping the pinned tile (grid tap path) restores selection under the same cap', () => {
    const f = candidate('gold-tile');
    state().pickFromSearch(f, false);
    state().toggleSelect(f.id); // deselect
    state().toggleSelect(f.id); // plain grid re-tap
    expect(state().selectedIds).toContain(f.id);
    expect(state().searchPickedIds).toContain(f.id); // ring + weight come back
  });
});

describe('abandonment / fresh open — reset clears search state wholesale', () => {
  it('reset wipes selection, pins, gold markers, and the compute cache', () => {
    state().pickFromSearch(candidate('a'), false);
    state().pickFromSearch(candidate('b'), true);
    state().setFavorite('a');
    state().reset();

    expect(state().selectedIds).toEqual([]);
    expect(state().searchPickedIds).toEqual([]);
    expect(state().pinned).toEqual([]);
    expect(state().searchPickCache).toEqual({});
    expect(state().favoriteId).toBeNull();
    expect(state().hardNoIds).toEqual([]);
  });
});
