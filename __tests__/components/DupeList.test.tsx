import React from 'react';
import { Text } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { DupeList } from '@/src/components/fragrance/DupeList';
import type { DupeResult } from '@/src/stores/useCatalogStore';

// M0/M1 — Curated dupes hero (PRD §7.1). The list IS the ranking; each row is
// honest about confidence (gold "% match" vs muted "Loose match"), and the
// freemium teaser renders a locked footer for withheld rows.

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

function dupe(overrides: Partial<DupeResult> = {}): DupeResult {
  return {
    id: 'dupe-1',
    brand: 'Lattafa',
    name: 'Asad',
    concentration: 'edp',
    fragrance_family: 'woody',
    gender: 'masculine',
    top_notes: [],
    heart_notes: [],
    base_notes: [],
    top_accords: [],
    accord_intensity: {},
    community_longevity: 4,
    community_sillage: 4,
    community_projection: 4,
    compliment_score: 0.6,
    versatility_score: 0.6,
    office_safe_score: 0.6,
    price_tier: 1,
    retail_msrp_usd_cents: 3000,
    image_url: 'https://example.com/asad.jpg',
    similar_ids: [],
    dupe_of: null,
    release_year: 2021,
    match_pct: 92,
    price_delta_cents: 12000,
    // 'algo' can no longer reach the UI: get_dupes only returns DECLARED clones
    // (seed/editorial/clone_house/community) because accord-overlap matches
    // assert confident false clone claims. clone_house is the realistic default
    // now — it is 308 of the 333 renderable rows.
    dupe_source: 'clone_house',
    is_loose: false,
    locked: false,
    ...overrides,
  };
}

beforeEach(() => mockPush.mockClear());

describe('DupeList', () => {
  it('renders a loading spinner when loading', () => {
    const { UNSAFE_getByType } = render(<DupeList dupes={[]} loading />);
    const { ActivityIndicator } = require('react-native');
    expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  });

  it('renders the provided empty state when there are no dupes', () => {
    render(<DupeList dupes={[]} emptyState={<Text>No dupes found</Text>} />);
    expect(screen.getByText('No dupes found')).toBeTruthy();
  });

  it('shows a gold "% match" pill for a confident match', () => {
    render(<DupeList dupes={[dupe({ match_pct: 92, is_loose: false })]} />);
    expect(screen.getByText('92% match')).toBeTruthy();
    expect(screen.queryByText('Loose match')).toBeNull();
  });

  it('shows "Loose match" instead of a number for a loose pair', () => {
    render(<DupeList dupes={[dupe({ match_pct: 55, is_loose: true })]} />);
    expect(screen.getByText('Loose match')).toBeTruthy();
    expect(screen.queryByText('55% match')).toBeNull();
  });

  it('shows savings only when price_delta is positive', () => {
    const { rerender } = render(<DupeList dupes={[dupe({ price_delta_cents: 12000 })]} />);
    expect(screen.getByText('Save ~$120')).toBeTruthy();

    rerender(<DupeList dupes={[dupe({ price_delta_cents: 0 })]} />);
    expect(screen.queryByText(/Save ~\$/)).toBeNull();
  });

  it('labels an editorial, non-loose pick as "Editor pick"', () => {
    render(<DupeList dupes={[dupe({ dupe_source: 'editorial', is_loose: false })]} />);
    expect(screen.getByText('Editor pick')).toBeTruthy();
  });

  it('does NOT show "Editor pick" for an editorial-but-loose pair', () => {
    render(<DupeList dupes={[dupe({ dupe_source: 'editorial', is_loose: true })]} />);
    expect(screen.queryByText('Editor pick')).toBeNull();
  });

  it('renders rows in ranking order with 1-based rank numbers', () => {
    render(
      <DupeList
        dupes={[
          dupe({ id: 'd1', name: 'First' }),
          dupe({ id: 'd2', name: 'Second' }),
          dupe({ id: 'd3', name: 'Third' }),
        ]}
      />,
    );
    expect(screen.getByText('First')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('caps rows at `max`', () => {
    render(
      <DupeList
        max={2}
        dupes={[
          dupe({ id: 'd1', name: 'First' }),
          dupe({ id: 'd2', name: 'Second' }),
          dupe({ id: 'd3', name: 'Third' }),
        ]}
      />,
    );
    expect(screen.getByText('First')).toBeTruthy();
    expect(screen.getByText('Second')).toBeTruthy();
    expect(screen.queryByText('Third')).toBeNull();
  });

  it('renders the locked teaser footer when lockedCount > 0', () => {
    const onUnlock = jest.fn();
    render(<DupeList dupes={[dupe()]} lockedCount={4} onUnlock={onUnlock} />);
    expect(screen.getByText('4 more dupes ranked & ready')).toBeTruthy();
    fireEvent.press(screen.getByText('Unlock →'));
    expect(onUnlock).toHaveBeenCalled();
  });

  it('uses singular copy when exactly one dupe is locked', () => {
    render(<DupeList dupes={[dupe()]} lockedCount={1} />);
    expect(screen.getByText('1 more dupe ranked & ready')).toBeTruthy();
  });

  it('navigates to the fragrance detail when a row is pressed, tagged from=dupe', () => {
    render(<DupeList dupes={[dupe({ id: 'asad-edp', name: 'Asad' })]} />);
    fireEvent.press(screen.getByText('Asad'));
    // from=dupe is load-bearing: it's how the destination page attributes a buy
    // back to the dupe rail (source_screen='dupe_rail'). Without it a dupe sale
    // is indistinguishable from any other sale and dupes can never prove ROI.
    expect(mockPush).toHaveBeenCalledWith('/fragrance/asad-edp?from=dupe');
  });

  it('does not render a savings number when price_delta_cents is null', () => {
    // 122 of 333 renderable dupes have no comparable price on one side. The old
    // code coalesced that to 0 and rendered the FULL original price as savings
    // ("save $220" on a bottle that isn't free). NULL must render nothing.
    render(<DupeList dupes={[dupe({ name: 'Nada', price_delta_cents: null })]} />);
    expect(screen.queryByText(/save \$/i)).toBeNull();
  });
});
