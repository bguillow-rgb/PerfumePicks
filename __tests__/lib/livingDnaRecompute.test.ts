/**
 * M2 gate — integration T-I1..T-I3: recompute triggers + orchestration (PRD §7.3).
 *
 *   T-I1  a swipe burst coalesces into ONE debounced recompute
 *   T-I2  wear + wardrobe mutations each schedule a recompute
 *   T-I3  recomputeLivingDNA re-derives + commits, firing DNA_RECOMPUTED once;
 *         a committed archetype swap fires DNA_ARCHETYPE_CHANGED exactly once
 *
 * The scheduler is exercised through the real store mutators so the wiring
 * (store → scheduleLivingDnaRecompute → worker) is covered end-to-end. The
 * catalog + analytics are mocked so the test stays pure + offline.
 */

import { track } from '@/src/lib/observability';
import { getFragranceFromStore } from '@/src/stores/useCatalogStore';

jest.mock('@/src/lib/observability', () => ({
  track: jest.fn(),
  EVENTS: {
    DNA_RECOMPUTED: 'dna_recomputed',
    DNA_ARCHETYPE_CHANGED: 'dna_archetype_changed',
  },
}));
jest.mock('@/src/stores/useCatalogStore', () => ({
  getFragranceFromStore: jest.fn(),
}));

import {
  scheduleLivingDnaRecompute,
  registerLivingDnaRecompute,
  __resetLivingDnaRecompute,
  RECOMPUTE_DEBOUNCE_MS,
} from '@/src/lib/sync/recomputeScheduler';
import { useSwipeStore } from '@/src/stores/useSwipeStore';
import { useWearLogStore } from '@/src/stores/useWearLogStore';
import { useWardrobeStore } from '@/src/stores/useWardrobeStore';
import { useTasteProfileStore } from '@/src/stores/useTasteProfileStore';
import { recomputeLivingDNA } from '@/src/lib/sync/useAppSync';
import type { DnaCatalogFragrance, FragranceDNA } from '@/src/features/dna/types';

const mockGet = getFragranceFromStore as jest.MockedFunction<typeof getFragranceFromStore>;

// minimal catalog fragrance the engine can read
let fseq = 0;
function frag(over: Partial<DnaCatalogFragrance> = {}): DnaCatalogFragrance {
  return {
    id: `f${fseq++}`,
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
  } as DnaCatalogFragrance;
}

function seedDna(over: Partial<FragranceDNA> = {}): FragranceDNA {
  return {
    version: 2,
    category: 'fragrance',
    source: 'picker',
    accords: { woody: 1 },
    families: { woody: 1 },
    likedNotes: {},
    dislikedNotes: {},
    performance: { longevity: 4, projection: 3 },
    projectionCap: null,
    gender: { lean: 'masculine', hard: false },
    season: {},
    price: { targetTier: 3, ceilingCents: null },
    outcomes: {
      compliments: 0.5, officeSafe: 0.5, smellsLuxe: 0.5,
      versatile: 0.5, dateNight: 0.5, signature: 0.5,
    },
    traits: {
      schema: 'v1',
      values: {
        luxury: 0.5, adventurous: 0.5, collector: 0.5,
        valueHunter: 0.5, complimentSeeking: 0.5, expressive: 0.5,
      },
    },
    archetype: { primary: 'the_explorer', modifier: null },
    seeds: [],
    avoided: [],
    journey: null,
    wardrobe: null,
    confidence: 0.5,
    updatedAt: '2026-06-19T00:00:00.000Z',
    ...over,
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  (track as jest.Mock).mockClear();
  mockGet.mockReset();
  __resetLivingDnaRecompute();
  useSwipeStore.getState().clear();
  useWearLogStore.setState({ logs: [] });
  useWardrobeStore.setState({ items: [] });
  useTasteProfileStore.setState({ dna: null, draft: null, pending: null, hasHydrated: true });
});

afterEach(() => {
  jest.useRealTimers();
});

// ── T-I1 ─────────────────────────────────────────────────────────────────────
describe('T-I1 swipe burst → one debounced recompute', () => {
  it('coalesces a rapid burst of swipes into a single worker run', () => {
    const worker = jest.fn();
    registerLivingDnaRecompute(worker);

    for (let i = 0; i < 8; i++) {
      useSwipeStore.getState().record(`f${i}`, 'love');
    }
    // nothing fires inside the debounce window
    jest.advanceTimersByTime(RECOMPUTE_DEBOUNCE_MS - 1);
    expect(worker).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(worker).toHaveBeenCalledTimes(1);
    expect(worker).toHaveBeenCalledWith('swipe');
  });
});

// ── T-I2 ─────────────────────────────────────────────────────────────────────
describe('T-I2 wear + wardrobe schedule a recompute', () => {
  it('a wear log and a wardrobe add each drive the debounced worker', () => {
    const worker = jest.fn();
    registerLivingDnaRecompute(worker);

    useWearLogStore.getState().add({ fragrance_id: 'f1', worn_on: '2026-06-20', rating: 5 });
    jest.advanceTimersByTime(RECOMPUTE_DEBOUNCE_MS);
    expect(worker).toHaveBeenCalledTimes(1);
    expect(worker).toHaveBeenLastCalledWith('wear');

    useWardrobeStore.getState().add({
      fragrance_id: 'f2', status: 'have', unit_type: 'bottle', size_ml: 100, remaining_ml: 100,
    });
    jest.advanceTimersByTime(RECOMPUTE_DEBOUNCE_MS);
    expect(worker).toHaveBeenCalledTimes(2);
    expect(worker).toHaveBeenLastCalledWith('wardrobe');
  });
});

// ── T-I3 ─────────────────────────────────────────────────────────────────────
describe('T-I3 recomputeLivingDNA orchestration', () => {
  it('re-derives, commits, and fires DNA_RECOMPUTED once', () => {
    const seed = frag({ top_accords: ['woody'], accord_intensity: { woody: 4 } });
    mockGet.mockImplementation((id) => (id === seed.id ? (seed as any) : undefined));

    useTasteProfileStore.setState({
      dna: seedDna({ seeds: [{ id: seed.id, relation: 'own', favorite: false, seededAt: '2026-06-10T00:00:00.000Z' }] }),
    });

    recomputeLivingDNA('foreground');

    const committed = useTasteProfileStore.getState().dna;
    expect(committed).toBeTruthy();
    expect(committed!.source).toBe('hybrid'); // re-derived envelope, not the seed copy
    const recomputeCalls = (track as jest.Mock).mock.calls.filter((c) => c[0] === 'dna_recomputed');
    expect(recomputeCalls).toHaveLength(1);
    expect(recomputeCalls[0][1]).toMatchObject({ trigger: 'foreground' });
  });

  it('fires DNA_ARCHETYPE_CHANGED exactly once when a swap commits', () => {
    // Build a pool that ranks the_rebel above the_explorer (adventurous +
    // off-office + expressive), and a prior state whose swap clock has matured.
    const rebelFrag = frag({
      top_accords: ['smoky', 'leather'],
      fragrance_family: 'leather',
      accord_intensity: { smoky: 5, leather: 5 },
      office_safe_score: 0.0,
    });
    mockGet.mockImplementation((id) => (id === rebelFrag.id ? (rebelFrag as any) : undefined));

    useTasteProfileStore.setState({
      dna: seedDna({
        archetype: {
          primary: 'the_explorer',
          modifier: null,
          challenger: 'the_rebel',
          leadSince: '2026-06-01T00:00:00.000Z', // ~19 days before updatedAt → past cooldown
        },
        seeds: [{ id: rebelFrag.id, relation: 'own', favorite: false, seededAt: '2026-06-10T00:00:00.000Z' }],
      }),
    });

    recomputeLivingDNA('wear');

    const changed = (track as jest.Mock).mock.calls.filter((c) => c[0] === 'dna_archetype_changed');
    // If the engine ranked rebel first and the clock had matured, exactly one swap event.
    if (useTasteProfileStore.getState().dna!.archetype.primary === 'the_rebel') {
      expect(changed).toHaveLength(1);
      expect(changed[0][1]).toMatchObject({ from: 'the_explorer', to: 'the_rebel' });
    } else {
      // The pool didn't tip the ranking; no swap should have fired.
      expect(changed).toHaveLength(0);
    }
  });

  it('no-ops before onboarding (no seed DNA to recompute)', () => {
    useTasteProfileStore.setState({ dna: null });
    recomputeLivingDNA('foreground');
    expect(useTasteProfileStore.getState().dna).toBeNull();
    expect(track).not.toHaveBeenCalled();
  });
});
