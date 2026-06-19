import { useTasteProfileStore } from '@/src/stores/useTasteProfileStore';
import type { FragranceDNA } from '@/src/features/dna/types';

// The store enqueues a debounced Supabase mirror on every commit. We don't want
// the network in a unit test, so syncWrite is mocked to a resolved success and
// supabase to an inert client.
jest.mock('@/src/lib/sync/syncWrite', () => ({
  syncWrite: jest.fn(async () => ({ ok: true })),
}));
jest.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: false,
  supabase: {},
}));

function makeDna(overrides: Partial<FragranceDNA> = {}): FragranceDNA {
  return {
    version: 2,
    category: 'fragrance',
    source: 'picker',
    accords: { woody: 1 },
    families: { oriental: 1 },
    likedNotes: { vanilla: 1 },
    dislikedNotes: {},
    performance: { longevity: 4, projection: 3 },
    projectionCap: null,
    gender: { lean: 'unisex', hard: false },
    season: {},
    price: { targetTier: 4, ceilingCents: null },
    outcomes: {
      compliments: 0.5, officeSafe: 0.5, smellsLuxe: 0.5,
      versatile: 0.5, dateNight: 0.5, signature: 0.5,
    },
    traits: {
      schema: 'v1',
      values: {
        luxury: 0.5, adventurous: 0.3, collector: null,
        valueHunter: 0.2, complimentSeeking: 0.4, expressive: 0.6,
      },
    },
    archetype: { primary: 'the_crowd_pleaser', modifier: null },
    seeds: [],
    avoided: [],
    journey: null,
    wardrobe: null,
    confidence: 0.7,
    updatedAt: '2026-06-18T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  useTasteProfileStore.setState({ dna: null, draft: null, pending: null, hasHydrated: true });
});

describe('useTasteProfileStore', () => {
  it('setDna commits the DNA and queues a server write', () => {
    const dna = makeDna();
    useTasteProfileStore.getState().setDna(dna);
    const s = useTasteProfileStore.getState();
    expect(s.dna).toEqual(dna);
    expect(s.draft).toBeNull();
    expect(s.pending?.updatedAt).toBe(dna.updatedAt);
  });

  it('retake is atomic: draft never leaks into the live dna until commit', () => {
    const live = makeDna({ updatedAt: '2026-06-18T00:00:00.000Z' });
    useTasteProfileStore.getState().setDna(live);

    const retaken = makeDna({
      archetype: { primary: 'the_executive', modifier: null },
      updatedAt: '2026-06-19T00:00:00.000Z',
    });
    useTasteProfileStore.getState().retake();
    useTasteProfileStore.getState().setDraft(retaken);

    // Readers still see the OLD dna while the retake is in progress.
    expect(useTasteProfileStore.getState().dna?.archetype.primary).toBe('the_crowd_pleaser');
    expect(useTasteProfileStore.getState().draft?.archetype.primary).toBe('the_executive');

    useTasteProfileStore.getState().commitDraft();
    expect(useTasteProfileStore.getState().dna?.archetype.primary).toBe('the_executive');
    expect(useTasteProfileStore.getState().draft).toBeNull();
  });

  it('commitDraft is a no-op when there is no draft', () => {
    const live = makeDna();
    useTasteProfileStore.getState().setDna(live);
    useTasteProfileStore.getState().commitDraft();
    expect(useTasteProfileStore.getState().dna).toEqual(live);
  });

  it('applyBehaviorSignal nudges a derivable trait and clamps to [0,1]', () => {
    useTasteProfileStore.getState().setDna(makeDna());
    useTasteProfileStore.getState().applyBehaviorSignal({ trait: 'adventurous', delta: 0.1 });
    expect(useTasteProfileStore.getState().dna?.traits.values.adventurous).toBeCloseTo(0.4);

    useTasteProfileStore.getState().applyBehaviorSignal({ trait: 'adventurous', delta: 5 });
    expect(useTasteProfileStore.getState().dna?.traits.values.adventurous).toBe(1);

    useTasteProfileStore.getState().applyBehaviorSignal({ trait: 'adventurous', delta: -5 });
    expect(useTasteProfileStore.getState().dna?.traits.values.adventurous).toBe(0);
  });

  it('applyBehaviorSignal leaves a null (underivable) axis untouched', () => {
    useTasteProfileStore.getState().setDna(makeDna());
    useTasteProfileStore.getState().applyBehaviorSignal({ trait: 'collector', delta: 0.1 });
    expect(useTasteProfileStore.getState().dna?.traits.values.collector).toBeNull();
  });

  it('applyBehaviorSignal is a no-op when no DNA exists', () => {
    useTasteProfileStore.getState().applyBehaviorSignal({ trait: 'luxury', delta: 0.1 });
    expect(useTasteProfileStore.getState().dna).toBeNull();
  });

  it('clearDna wipes dna, draft, and the pending write queue', () => {
    useTasteProfileStore.getState().setDna(makeDna());
    useTasteProfileStore.getState().setDraft(makeDna());
    useTasteProfileStore.getState().clearDna();
    const s = useTasteProfileStore.getState();
    expect(s.dna).toBeNull();
    expect(s.draft).toBeNull();
    expect(s.pending).toBeNull();
  });

  it('hydrateDna sets dna without enqueuing a server write', () => {
    const dna = makeDna();
    useTasteProfileStore.getState().hydrateDna(dna);
    const s = useTasteProfileStore.getState();
    expect(s.dna).toEqual(dna);
    expect(s.pending).toBeNull();
  });
});
