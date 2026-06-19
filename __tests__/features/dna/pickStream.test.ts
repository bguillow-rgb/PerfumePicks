import {
  createSeqCounter,
  pickStreamId,
  seedToEvent,
  buildPickStreamBatch,
  eventToRow,
  shouldRotateAppId,
  resolveAppId,
  cohortSourceFor,
  APP_ID_TTL_MS,
} from '@/src/features/dna/pickStream';
import type { DnaSeed } from '@/src/features/dna/types';

const FIXED = () => '2026-06-18T00:00:00.000Z';

const seeds: DnaSeed[] = [
  { id: 'sauvage', relation: 'own', favorite: true },
  { id: 'aventus', relation: 'want', favorite: false },
  { id: 'layton', relation: 'own', favorite: false },
];

describe('createSeqCounter — monotonic, recoverable order', () => {
  it('yields a strictly increasing sequence from the start', () => {
    const s = createSeqCounter();
    expect([s.next(), s.next(), s.next()]).toEqual([0, 1, 2]);
    expect(s.peek()).toBe(3);
  });

  it('honours a custom start', () => {
    const s = createSeqCounter(10);
    expect(s.next()).toBe(10);
  });
});

describe('pickStreamId — deterministic idempotency key', () => {
  it('is a pure function of (appId, session, seq)', () => {
    expect(pickStreamId('app', 'sess', 4)).toBe('app:sess:4');
    expect(pickStreamId('app', 'sess', 4)).toBe(pickStreamId('app', 'sess', 4));
  });

  it('differs when any component differs', () => {
    expect(pickStreamId('a', 's', 1)).not.toBe(pickStreamId('b', 's', 1));
    expect(pickStreamId('a', 's', 1)).not.toBe(pickStreamId('a', 't', 1));
    expect(pickStreamId('a', 's', 1)).not.toBe(pickStreamId('a', 's', 2));
  });
});

describe('seedToEvent — PII strip (ids + enums only)', () => {
  it('projects only whitelisted fields and tags favorites', () => {
    const ev = seedToEvent(seeds[0], { appId: 'app', session: 'sess', seq: 0, source: 'picker', now: FIXED });
    expect(ev).toEqual({
      id: 'app:sess:0',
      appId: 'app',
      session: 'sess',
      seq: 0,
      kind: 'favorite',
      fragranceId: 'sauvage',
      relation: 'own',
      favorite: true,
      source: 'picker',
      createdAt: '2026-06-18T00:00:00.000Z',
    });
  });

  it('drops any extra (potentially PII) fields a caller smuggles in', () => {
    const dirty = { ...seeds[1], name: 'Creed Aventus', note: 'smells amazing', price: 435 } as unknown as DnaSeed;
    const ev = seedToEvent(dirty, { appId: 'app', session: 'sess', seq: 1, source: 'picker', now: FIXED });
    expect(Object.keys(ev).sort()).toEqual(
      ['appId', 'createdAt', 'favorite', 'fragranceId', 'id', 'kind', 'relation', 'seq', 'session', 'source'].sort(),
    );
    expect(JSON.stringify(ev)).not.toContain('Aventus');
    expect(JSON.stringify(ev)).not.toContain('amazing');
    expect(JSON.stringify(ev)).not.toContain('435');
  });
});

describe('buildPickStreamBatch — ordered, idempotent run capture', () => {
  it('emits one row per seed in order, then a commit marker', () => {
    const batch = buildPickStreamBatch({ seeds, source: 'picker', appId: 'app', session: 'sess', now: FIXED });
    expect(batch).toHaveLength(seeds.length + 1);
    expect(batch.map((e) => e.kind)).toEqual(['favorite', 'pick', 'pick', 'commit']);
    expect(batch.map((e) => e.seq)).toEqual([0, 1, 2, 3]);
    expect(batch.map((e) => e.fragranceId)).toEqual(['sauvage', 'aventus', 'layton', null]);
  });

  it('produces unique, deterministic ids — a replay yields the identical batch', () => {
    const a = buildPickStreamBatch({ seeds, source: 'picker', appId: 'app', session: 'sess', now: FIXED });
    const b = buildPickStreamBatch({ seeds, source: 'picker', appId: 'app', session: 'sess', now: FIXED });
    expect(a.map((e) => e.id)).toEqual(b.map((e) => e.id));
    expect(new Set(a.map((e) => e.id)).size).toBe(a.length);
  });

  it('carries the source through every row (picker vs fallback)', () => {
    const fb = buildPickStreamBatch({ seeds, source: 'question_fallback', appId: 'app', session: 's', now: FIXED });
    expect(fb.every((e) => e.source === 'question_fallback')).toBe(true);
  });
});

describe('eventToRow — clean snake_case DB projection', () => {
  it('maps the event to the dna_picker_events row shape', () => {
    const ev = seedToEvent(seeds[1], { appId: 'app', session: 'sess', seq: 1, source: 'picker', now: FIXED });
    expect(eventToRow(ev)).toEqual({
      id: 'app:sess:1',
      app_id: 'app',
      session_id: 'sess',
      seq: 1,
      kind: 'pick',
      fragrance_id: 'aventus',
      relation: 'want',
      favorite: false,
      source: 'picker',
      created_at: '2026-06-18T00:00:00.000Z',
    });
  });

  it('never leaks the auth user id (added only at write time, not in the body)', () => {
    const ev = seedToEvent(seeds[0], { appId: 'app', session: 'sess', seq: 0, source: 'picker', now: FIXED });
    expect(eventToRow(ev)).not.toHaveProperty('user_id');
  });
});

describe('rotating pseudonymous app id', () => {
  it('rotates once aged past the TTL', () => {
    expect(shouldRotateAppId(0, APP_ID_TTL_MS - 1)).toBe(false);
    expect(shouldRotateAppId(0, APP_ID_TTL_MS)).toBe(true);
  });

  it('mints a fresh id when none exists', () => {
    const got = resolveAppId(null, 1000, () => 'fresh');
    expect(got).toEqual({ value: 'fresh', issuedAt: 1000 });
  });

  it('keeps the current id while still inside the window', () => {
    const prev = { value: 'keep', issuedAt: 1000 };
    const got = resolveAppId(prev, 1000 + APP_ID_TTL_MS - 1, () => 'fresh');
    expect(got).toBe(prev);
  });

  it('re-mints once the window elapses', () => {
    const prev = { value: 'old', issuedAt: 1000 };
    const got = resolveAppId(prev, 1000 + APP_ID_TTL_MS, () => 'new');
    expect(got).toEqual({ value: 'new', issuedAt: 1000 + APP_ID_TTL_MS });
  });
});

describe('cohortSourceFor — editorial→cohort flip stub', () => {
  it('reports editorial for every ladder at launch (no cohort trained yet)', () => {
    expect(cohortSourceFor('fresh_to_niche_woody')).toBe('editorial');
    expect(cohortSourceFor('anything')).toBe('editorial');
  });

  it('flips to cohort once a ladder is marked ready', () => {
    const ready = { fresh_to_niche_woody: true };
    expect(cohortSourceFor('fresh_to_niche_woody', ready)).toBe('cohort');
    expect(cohortSourceFor('sweet_to_refined_amber', ready)).toBe('editorial');
  });
});
