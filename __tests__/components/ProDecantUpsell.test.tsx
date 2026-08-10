import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { ProDecantUpsell } from '@/src/components/dna/ProDecantUpsell';
import type { DupeTeaser } from '@/src/stores/useCatalogStore';

// Savings-anchored personalization (2026-08-10): when the top match has a
// compelling dupe teaser, the card leads with THIS user's numbers instead of
// the generic "What you get with Pro" pitch. Weak teasers (loose match, tiny
// savings) must fall back to the generic card — a limp personalized headline
// is worse than none.

const mockTrack = jest.fn();
jest.mock('@/src/lib/observability', () => ({
  track: (...a: unknown[]) => mockTrack(...a),
  EVENTS: {
    DNA_REVEAL_UPSELL_SHOWN: 'dna_reveal_upsell_shown',
    DNA_REVEAL_UPSELL_TAPPED: 'dna_reveal_upsell_tapped',
    DUPE_TEASER_SHOWN: 'dupe_teaser_shown',
  },
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

const mockFetchDupeTeaser = jest.fn<Promise<DupeTeaser | null>, [string]>();
jest.mock('@/src/stores/useCatalogStore', () => ({
  useCatalogStore: {
    getState: () => ({ fetchDupeTeaser: mockFetchDupeTeaser }),
  },
}));

const TOP_MATCH = { slug: 'cloud-ariana-grande', name: 'Cloud' };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ProDecantUpsell personalization', () => {
  it('renders the generic card when no top match is passed', () => {
    render(<ProDecantUpsell archetype="the_gourmand" celebrate={false} />);
    expect(screen.getByText('What you get with Pro')).toBeTruthy();
    expect(screen.getByText('Try Pro free for 7 days')).toBeTruthy();
    expect(mockFetchDupeTeaser).not.toHaveBeenCalled();
  });

  it('leads with count, match % and savings when the teaser is compelling', async () => {
    mockFetchDupeTeaser.mockResolvedValue({ dupeCount: 3, bestMatchPct: 92, maxSavingsCents: 18000 });
    render(<ProDecantUpsell archetype="the_gourmand" celebrate={false} topMatch={TOP_MATCH} />);
    await waitFor(() => expect(screen.getByText('3 dupes for Cloud')).toBeTruthy());
    expect(
      screen.getByText('The closest is a 92% match, up to $180 cheaper. Pro shows you which bottles.'),
    ).toBeTruthy();
    expect(screen.getByText('See them free for 7 days')).toBeTruthy();
    // The generic dupes bullet is redundant under the personalized headline.
    expect(screen.queryByText('Cheaper dupes')).toBeNull();
    // Impression joins the existing dupe funnel.
    expect(mockTrack).toHaveBeenCalledWith('dupe_teaser_shown', {
      surface: 'taste_profile',
      locked_count: 3,
    });
  });

  it('uses singular copy for a single dupe', async () => {
    mockFetchDupeTeaser.mockResolvedValue({ dupeCount: 1, bestMatchPct: 88, maxSavingsCents: 9500 });
    render(<ProDecantUpsell archetype={null} celebrate={false} topMatch={TOP_MATCH} />);
    await waitFor(() => expect(screen.getByText("There's a dupe for Cloud")).toBeTruthy());
    expect(
      screen.getByText("It's a 88% match and costs up to $95 less. Pro shows you the bottle."),
    ).toBeTruthy();
    expect(screen.getByText('See it free for 7 days')).toBeTruthy();
  });

  it('never prints a percentage for a loose (<70%) match', async () => {
    mockFetchDupeTeaser.mockResolvedValue({ dupeCount: 2, bestMatchPct: 55, maxSavingsCents: 4000 });
    render(<ProDecantUpsell archetype={null} celebrate={false} topMatch={TOP_MATCH} />);
    await waitFor(() => expect(screen.getByText('2 dupes for Cloud')).toBeTruthy());
    expect(screen.getByText('They cost up to $40 less. Pro shows you which bottles.')).toBeTruthy();
    expect(screen.queryByText(/55% match/)).toBeNull();
  });

  it('falls back to generic when the teaser is weak (loose match AND under $10)', async () => {
    mockFetchDupeTeaser.mockResolvedValue({ dupeCount: 1, bestMatchPct: 55, maxSavingsCents: 500 });
    render(<ProDecantUpsell archetype={null} celebrate={false} topMatch={TOP_MATCH} />);
    await waitFor(() => expect(mockFetchDupeTeaser).toHaveBeenCalledWith('cloud-ariana-grande'));
    expect(screen.getByText('What you get with Pro')).toBeTruthy();
    expect(screen.getByText('Try Pro free for 7 days')).toBeTruthy();
  });

  it('falls back to generic when the teaser fetch returns null', async () => {
    mockFetchDupeTeaser.mockResolvedValue(null);
    render(<ProDecantUpsell archetype={null} celebrate={false} topMatch={TOP_MATCH} />);
    await waitFor(() => expect(mockFetchDupeTeaser).toHaveBeenCalled());
    expect(screen.getByText('What you get with Pro')).toBeTruthy();
  });

  it('uses "your top match" when the hero has no display name', async () => {
    mockFetchDupeTeaser.mockResolvedValue({ dupeCount: 3, bestMatchPct: 92, maxSavingsCents: 18000 });
    render(
      <ProDecantUpsell archetype={null} celebrate={false} topMatch={{ slug: 'x', name: null }} />,
    );
    await waitFor(() => expect(screen.getByText('3 dupes for your top match')).toBeTruthy());
  });
});
