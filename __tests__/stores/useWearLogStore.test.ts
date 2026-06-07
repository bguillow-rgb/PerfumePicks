import { useWearLogStore } from '@/src/stores/useWearLogStore';

const expoCrypto = require('expo-crypto');

function makeLogInput(fragrance_id: string, worn_on: string, overrides: Record<string, unknown> = {}) {
  return { fragrance_id, worn_on, ...overrides };
}

beforeEach(() => {
  expoCrypto.__resetCounter();
  useWearLogStore.setState({ logs: [] });
});

describe('useWearLogStore', () => {
  describe('add()', () => {
    it('returns an ID and the log appears in logs', () => {
      const id = useWearLogStore.getState().add(makeLogInput('frag-1', '2026-05-22'));
      expect(typeof id).toBe('string');
      expect(id).toBeTruthy();
      const logs = useWearLogStore.getState().logs;
      expect(logs).toHaveLength(1);
      expect(logs[0].id).toBe(id);
      expect(logs[0].fragrance_id).toBe('frag-1');
      expect(logs[0].worn_on).toBe('2026-05-22');
    });

    it('with is_public: true persists the flag', () => {
      useWearLogStore.getState().add(makeLogInput('frag-1', '2026-05-22', { is_public: true }));
      expect(useWearLogStore.getState().logs[0].is_public).toBe(true);
    });

    it('with is_public: false or omitted persists false/undefined', () => {
      useWearLogStore.getState().add(makeLogInput('frag-1', '2026-05-22', { is_public: false }));
      expect(useWearLogStore.getState().logs[0].is_public).toBe(false);
    });
  });

  describe('update()', () => {
    it('patches a log by ID', () => {
      const id = useWearLogStore.getState().add(makeLogInput('frag-1', '2026-05-22'));
      useWearLogStore.getState().update(id, { rating: 4, note: 'great day' });
      const log = useWearLogStore.getState().logs[0];
      expect(log.rating).toBe(4);
      expect(log.note).toBe('great day');
      expect(log.fragrance_id).toBe('frag-1'); // unchanged
    });

    it('does not affect other logs', () => {
      const id1 = useWearLogStore.getState().add(makeLogInput('frag-1', '2026-05-21'));
      const id2 = useWearLogStore.getState().add(makeLogInput('frag-2', '2026-05-22'));
      useWearLogStore.getState().update(id1, { rating: 3 });
      const log2 = useWearLogStore.getState().logs.find((l) => l.id === id2);
      expect(log2?.rating).toBeUndefined();
    });
  });

  describe('remove()', () => {
    it('removes by ID', () => {
      const id = useWearLogStore.getState().add(makeLogInput('frag-1', '2026-05-22'));
      useWearLogStore.getState().remove(id);
      expect(useWearLogStore.getState().logs).toHaveLength(0);
    });

    it('does not remove other logs', () => {
      const id1 = useWearLogStore.getState().add(makeLogInput('frag-1', '2026-05-21'));
      const id2 = useWearLogStore.getState().add(makeLogInput('frag-2', '2026-05-22'));
      useWearLogStore.getState().remove(id1);
      const remaining = useWearLogStore.getState().logs;
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe(id2);
    });
  });

  describe('forFragrance()', () => {
    it('returns logs filtered and sorted newest worn_on first', () => {
      useWearLogStore.getState().add(makeLogInput('frag-1', '2026-05-20'));
      useWearLogStore.getState().add(makeLogInput('frag-1', '2026-05-22'));
      useWearLogStore.getState().add(makeLogInput('frag-2', '2026-05-22'));
      useWearLogStore.getState().add(makeLogInput('frag-1', '2026-05-21'));

      const result = useWearLogStore.getState().forFragrance('frag-1');
      expect(result).toHaveLength(3);
      expect(result.every((l) => l.fragrance_id === 'frag-1')).toBe(true);
      // sorted newest first by worn_on
      expect(result[0].worn_on).toBe('2026-05-22');
      expect(result[1].worn_on).toBe('2026-05-21');
      expect(result[2].worn_on).toBe('2026-05-20');
    });

    it('returns empty array when no logs for fragrance', () => {
      expect(useWearLogStore.getState().forFragrance('nonexistent')).toEqual([]);
    });
  });

  describe('recent()', () => {
    it('returns newest N logs across all fragrances', () => {
      // Add logs with different created_at by inserting them
      const logs = [
        { id: 'log-1', fragrance_id: 'frag-1', worn_on: '2026-05-20', created_at: '2026-05-20T10:00:00Z' },
        { id: 'log-2', fragrance_id: 'frag-2', worn_on: '2026-05-21', created_at: '2026-05-21T10:00:00Z' },
        { id: 'log-3', fragrance_id: 'frag-3', worn_on: '2026-05-22', created_at: '2026-05-22T10:00:00Z' },
        { id: 'log-4', fragrance_id: 'frag-4', worn_on: '2026-05-19', created_at: '2026-05-19T10:00:00Z' },
      ];
      useWearLogStore.setState({ logs });

      const result = useWearLogStore.getState().recent(2);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('log-3'); // newest created_at
      expect(result[1].id).toBe('log-2');
    });

    it('defaults to 20 when no limit given', () => {
      const logs = Array.from({ length: 25 }, (_, i) => ({
        id: `log-${i}`,
        fragrance_id: 'frag-1',
        worn_on: `2026-05-${String(i + 1).padStart(2, '0')}`,
        created_at: `2026-05-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
      }));
      useWearLogStore.setState({ logs });
      expect(useWearLogStore.getState().recent()).toHaveLength(20);
    });
  });

  describe('countByFragrance()', () => {
    it('returns correct counts', () => {
      useWearLogStore.getState().add(makeLogInput('frag-1', '2026-05-20'));
      useWearLogStore.getState().add(makeLogInput('frag-1', '2026-05-21'));
      useWearLogStore.getState().add(makeLogInput('frag-2', '2026-05-22'));

      const counts = useWearLogStore.getState().countByFragrance();
      expect(counts['frag-1']).toBe(2);
      expect(counts['frag-2']).toBe(1);
    });
  });

  describe('unsyncedCount()', () => {
    it('returns count of logs with _unsynced: true', () => {
      useWearLogStore.setState({
        logs: [
          { id: 'l1', fragrance_id: 'f1', worn_on: '2026-05-22', created_at: '2026-05-22T10:00:00Z', _unsynced: true },
          { id: 'l2', fragrance_id: 'f2', worn_on: '2026-05-22', created_at: '2026-05-22T10:00:00Z' },
          { id: 'l3', fragrance_id: 'f3', worn_on: '2026-05-22', created_at: '2026-05-22T10:00:00Z', _unsynced: true },
        ],
      });
      expect(useWearLogStore.getState().unsyncedCount()).toBe(2);
    });

    it('returns 0 when every log is synced', () => {
      useWearLogStore.getState().add(makeLogInput('frag-1', '2026-05-22'));
      // add() marks logs _unsynced: true by default; clear it to simulate a
      // successful server write.
      useWearLogStore.setState({
        logs: useWearLogStore.getState().logs.map((l) => ({ ...l, _unsynced: false })),
      });
      expect(useWearLogStore.getState().unsyncedCount()).toBe(0);
    });

    it('marks a demo-mode add as unsynced (no backend to write to)', () => {
      // Without Supabase configured, add() pre-flags _unsynced so the log
      // survives the hydration merge on the next sign-in.
      useWearLogStore.getState().add(makeLogInput('frag-1', '2026-05-22'));
      expect(useWearLogStore.getState().unsyncedCount()).toBe(1);
    });
  });
});
