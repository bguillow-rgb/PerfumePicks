/**
 * M1 REPLAY GATE — the "everyone is one archetype" bug, made structurally
 * impossible. Replays ALL real prod pick streams (fixtures/replay-picks.json,
 * refreshed read-only via scripts/refresh-replay-fixture.mjs) through the
 * flag-ON v3 election and enforces the distribution contract from
 * MILESTONES-DNA-V3.md / FEATURE_ARCHETYPES_V2.md:
 *
 *   ≥ 8 distinct archetypes elected, max single-label share ≤ 20%.
 *
 * These thresholds are the contract — tune CENTROIDS, never the numbers here
 * (changing them requires Bob). Context: the legacy scorer elected the_seducer
 * for 28 of these same 31 streams (90%).
 */

import { deriveFragranceDNA } from '@/src/features/dna';
import { V3_ARCHETYPE_KEYS } from '@/src/features/dna/centroids';
import type { ArchetypeKey, DnaCatalogFragrance, DnaPick } from '@/src/features/dna/types';
import fixture from './fixtures/replay-picks.json';

const FIXED_NOW = () => '2026-07-09T00:00:00.000Z';

const MIN_DISTINCT = 8;
const MAX_SHARE = 0.2;

describe('replay gate — real prod pick streams, flag on', () => {
  const catalog = fixture.catalog as unknown as Record<string, DnaCatalogFragrance>;

  it(`elects ≥${MIN_DISTINCT} distinct archetypes with max share ≤${MAX_SHARE * 100}% over all ${fixture.streams.length} streams`, () => {
    expect(fixture.streams.length).toBeGreaterThan(0);

    const counts = new Map<ArchetypeKey, number>();
    for (const s of fixture.streams) {
      const picks: DnaPick[] = s.picks
        .filter((p) => catalog[p.id])
        .map((p) => ({
          fragrance: catalog[p.id],
          relation: p.relation as DnaPick['relation'],
          favorite: p.favorite,
        }));
      expect(picks.length).toBeGreaterThan(0); // every stream's bottles resolve

      const { dna, events } = deriveFragranceDNA({ picks, now: FIXED_NOW, v3Archetypes: true });
      expect(events).toEqual([]); // no stream may fail over to fallback
      expect(V3_ARCHETYPE_KEYS).toContain(dna.archetype.primary);
      counts.set(dna.archetype.primary, (counts.get(dna.archetype.primary) ?? 0) + 1);
    }

    const total = fixture.streams.length;
    const table = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `  ${k.padEnd(24)} ${String(n).padStart(2)}  (${((n / total) * 100).toFixed(1)}%)`)
      .join('\n');

    const distinct = counts.size;
    const maxShare = Math.max(...counts.values()) / total;

    // Distribution is printed on failure so tuning has the data in front of it.
    if (distinct < MIN_DISTINCT || maxShare > MAX_SHARE) {
      throw new Error(
        `Replay gate FAILED: distinct=${distinct} (need ≥${MIN_DISTINCT}), maxShare=${(maxShare * 100).toFixed(1)}% (need ≤${MAX_SHARE * 100}%)\n${table}`,
      );
    }
    expect(distinct).toBeGreaterThanOrEqual(MIN_DISTINCT);
    expect(maxShare).toBeLessThanOrEqual(MAX_SHARE);
  });
});
