import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { LivingArchetypeReadout } from '@/src/components/dna/LivingArchetypeReadout';
import { useTasteProfileStore } from '@/src/stores/useTasteProfileStore';
import type { FragranceDNA, DnaArchetype } from '@/src/features/dna/types';

// M4 — living-archetype readout (PRD §6.6). The component renders purely from the
// persisted DNA; the store's Supabase mirror is stubbed so the test stays offline.
jest.mock('@/src/lib/sync/syncWrite', () => ({
  syncWrite: jest.fn(async () => ({ ok: true })),
}));
jest.mock('@/lib/supabase', () => ({ isSupabaseConfigured: false, supabase: {} }));

const NOW = '2026-06-20T00:00:00.000Z';

function dna(archetype: Partial<DnaArchetype>): FragranceDNA {
  return {
    version: 2,
    category: 'fragrance',
    source: 'hybrid',
    accords: {}, families: {}, likedNotes: {}, dislikedNotes: {},
    performance: { longevity: 4, projection: 3 },
    projectionCap: null,
    gender: { lean: 'unisex', hard: false },
    season: {},
    price: { targetTier: 3, ceilingCents: null },
    outcomes: {
      compliments: 0.5, officeSafe: 0.5, smellsLuxe: 0.5,
      versatile: 0.5, dateNight: 0.5, signature: 0.5,
    },
    traits: { schema: 'v1', values: {
      luxury: 0.5, adventurous: 0.5, collector: 0.5,
      valueHunter: 0.5, complimentSeeking: 0.5, expressive: 0.5,
    } },
    archetype: { primary: 'the_explorer', modifier: null, ...archetype },
    seeds: [], avoided: [], journey: null, wardrobe: null,
    confidence: 0.5, updatedAt: NOW,
  };
}

beforeEach(() => {
  useTasteProfileStore.setState({ dna: null, draft: null, pending: null, hasHydrated: true });
});

describe('LivingArchetypeReadout — shift nudge', () => {
  it('renders the "You\'ve shifted" banner and dismisses on Got it', () => {
    const d = dna({ primary: 'the_rebel', pendingShift: { from: 'the_explorer', to: 'the_rebel' } });
    useTasteProfileStore.setState({ dna: d });

    render(<LivingArchetypeReadout dna={d} variant="full" />);
    expect(screen.getByTestId('dna-shift-banner')).toBeTruthy();
    expect(screen.getByText('Your DNA has shifted')).toBeTruthy();
    expect(screen.getByText(/now The Rebel — it suits you/)).toBeTruthy();

    fireEvent.press(screen.getByTestId('dna-shift-ack'));
    expect(useTasteProfileStore.getState().dna?.archetype.pendingShift).toBeNull();
  });

  it('compact variant shows the shifted-to name in one line', () => {
    const d = dna({ primary: 'the_rebel', pendingShift: { from: 'the_explorer', to: 'the_rebel' } });
    render(<LivingArchetypeReadout dna={d} variant="compact" />);
    expect(screen.getByText('Your DNA has shifted to The Rebel')).toBeTruthy();
  });
});

describe('LivingArchetypeReadout — leaning', () => {
  it('shows "Leaning toward X" as a tease (no progress meter, swaps are instant)', () => {
    const d = dna({ challenger: 'the_rebel', leaning: true });
    render(<LivingArchetypeReadout dna={d} variant="full" />);
    expect(screen.getByText('The Rebel')).toBeTruthy();
    expect(screen.queryByTestId('dna-swap-progress')).toBeNull();
  });

  it('renders nothing when there is no challenger and no shift', () => {
    const d = dna({ challenger: null, leaning: false });
    const { toJSON } = render(<LivingArchetypeReadout dna={d} variant="full" />);
    expect(toJSON()).toBeNull();
  });

  it('renders nothing when a challenger exists but is not leaning', () => {
    const d = dna({ challenger: 'the_rebel', leaning: false });
    const { toJSON } = render(<LivingArchetypeReadout dna={d} variant="compact" />);
    expect(toJSON()).toBeNull();
  });
});
