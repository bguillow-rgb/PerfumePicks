/**
 * T-U9: living-archetype lean → swap mechanic (PRD §6.6).
 *
 * applyLivingArchetype advances the persisted archetype state by one recompute.
 * The committed `primary` swaps the moment the challenger clears SWAP_MARGIN —
 * there is no time cooldown. Below the margin the runner-up surfaces as a
 * `challenger` with a "leaning" readout. These tests pin the swap behaviour.
 */

import {
  applyLivingArchetype,
  isLeaning,
  leaningLabel,
  SWAP_MARGIN,
  LEAN_REVEAL_RATIO,
  type ArchetypeScore,
} from '@/src/features/dna';
import { ARCHETYPE_COPY } from '@/src/features/dna/revealCopy';
import type { DnaArchetype } from '@/src/features/dna/types';

const ranked = (...pairs: [string, number][]): ArchetypeScore[] =>
  pairs.map(([key, score]) => ({ key: key as ArchetypeScore['key'], score }));

const arch = (over: Partial<DnaArchetype> = {}): DnaArchetype => ({
  primary: 'the_explorer',
  modifier: null,
  challenger: null,
  leadSince: null,
  ...over,
});

// ── applyLivingArchetype ─────────────────────────────────────────────────────
describe('T-U9 applyLivingArchetype lean → swap', () => {
  it('does not swap when the challenger is inside the margin', () => {
    const r = ranked(['the_explorer', 10], ['the_rebel', 10]); // tie → not ahead
    const { archetype, swapped } = applyLivingArchetype(arch(), r, null);
    expect(swapped).toBe(false);
    expect(archetype.primary).toBe('the_explorer');
    expect(archetype.challenger).toBe('the_rebel'); // surfaced as runner-up
  });

  it('swaps immediately once the challenger clears the margin', () => {
    const r = ranked(['the_rebel', 12], ['the_explorer', 10], ['the_seducer', 5]); // 12 ≥ 10*1.05
    const { archetype, swapped } = applyLivingArchetype(arch(), r, 'expressive');
    expect(swapped).toBe(true);
    expect(archetype.primary).toBe('the_rebel');
    expect(archetype.modifier).toBe('expressive');
    // challenger now recomputed against the NEW primary
    expect(archetype.challenger).toBe('the_explorer');
    // the swap stamps a one-time nudge from→to for the readout
    expect(archetype.pendingShift).toEqual({ from: 'the_explorer', to: 'the_rebel' });
  });

  it('uses the configured SWAP_MARGIN as the lead threshold', () => {
    const current = 10;
    const justUnder = current * (1 + SWAP_MARGIN) - 0.001;
    const justOver = current * (1 + SWAP_MARGIN);
    const under = applyLivingArchetype(arch(), ranked(['the_rebel', justUnder], ['the_explorer', current]), null);
    const over = applyLivingArchetype(arch(), ranked(['the_rebel', justOver], ['the_explorer', current]), null);
    expect(under.swapped).toBe(false);
    expect(under.archetype.primary).toBe('the_explorer');
    expect(over.swapped).toBe(true);
    expect(over.archetype.primary).toBe('the_rebel');
  });
});

// ── leaning flag + shift nudge persisted for the readout ─────────────────────
describe('T-U9 readout state persisted onto the archetype', () => {
  it('sets leaning=true once the challenger crosses LEAN_REVEAL_RATIO', () => {
    const r = ranked(['the_explorer', 100], ['the_rebel', 90]); // 0.90 ≥ 0.85, < 1.05 margin
    const { archetype, swapped } = applyLivingArchetype(arch(), r, null);
    expect(swapped).toBe(false); // leaning, but hasn't cleared the swap margin
    expect(archetype.leaning).toBe(true);
  });

  it('sets leaning=false when the challenger is below the reveal ratio', () => {
    const r = ranked(['the_explorer', 100], ['the_rebel', 50]); // 0.50 < 0.85
    const { archetype } = applyLivingArchetype(arch(), r, null);
    expect(archetype.leaning).toBe(false);
  });

  it('leaves pendingShift null when nothing swapped and none was pending', () => {
    const r = ranked(['the_explorer', 11], ['the_rebel', 10]);
    const { archetype } = applyLivingArchetype(arch(), r, null);
    expect(archetype.pendingShift).toBeNull();
  });

  it('carries an unacknowledged pendingShift forward across a non-swap recompute', () => {
    const prev = arch({ pendingShift: { from: 'the_seducer', to: 'the_explorer' } });
    const r = ranked(['the_explorer', 11], ['the_rebel', 10]); // no swap this pass
    const { archetype, swapped } = applyLivingArchetype(prev, r, null);
    expect(swapped).toBe(false);
    expect(archetype.pendingShift).toEqual({ from: 'the_seducer', to: 'the_explorer' });
  });
});

// ── readout helpers ──────────────────────────────────────────────────────────
describe('T-U9 lean readout helpers', () => {
  it('isLeaning trips exactly at LEAN_REVEAL_RATIO', () => {
    const a = arch({ challenger: 'the_rebel' });
    const above = ranked(['the_explorer', 100], ['the_rebel', 100 * LEAN_REVEAL_RATIO]);
    const below = ranked(['the_explorer', 100], ['the_rebel', 100 * LEAN_REVEAL_RATIO - 1]);
    expect(isLeaning(a, above)).toBe(true);
    expect(isLeaning(a, below)).toBe(false);
  });

  it('isLeaning is false when there is no challenger', () => {
    expect(isLeaning(arch({ challenger: null }), ranked(['the_explorer', 10]))).toBe(false);
  });

  it('leaningLabel returns the challenger display name only while leaning', () => {
    const a = arch({ challenger: 'the_rebel' });
    const leaning = ranked(['the_explorer', 100], ['the_rebel', 95]);
    const notLeaning = ranked(['the_explorer', 100], ['the_rebel', 10]);
    expect(leaningLabel(a, leaning)).toBe(ARCHETYPE_COPY.the_rebel.name);
    expect(leaningLabel(a, notLeaning)).toBeNull();
  });
});
