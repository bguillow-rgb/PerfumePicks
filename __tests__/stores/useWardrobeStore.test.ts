import { useWardrobeStore } from '@/src/stores/useWardrobeStore';
import { useProStore } from '@/src/stores/useProStore';
import { FREE_WARDROBE_CAP } from '@/src/lib/limits';

// Reset counter between tests
const expoCrypto = require('expo-crypto');

function makeItem(fragrance_id: string, overrides: Record<string, unknown> = {}) {
  return {
    fragrance_id,
    status: 'have' as const,
    unit_type: 'bottle' as const,
    size_ml: 50,
    remaining_ml: 50,
    ...overrides,
  };
}

beforeEach(() => {
  expoCrypto.__resetCounter();
  useWardrobeStore.setState({ items: [] });
  useProStore.setState({ isPro: false, purchasedAt: null, hasHydrated: true });
});

describe('useWardrobeStore', () => {
  describe('add()', () => {
    it('returns a string ID on success', () => {
      const id = useWardrobeStore.getState().add(makeItem('frag-1'));
      expect(typeof id).toBe('string');
      expect(id).toBeTruthy();
    });

    it('adds the item to the store', () => {
      useWardrobeStore.getState().add(makeItem('frag-1'));
      expect(useWardrobeStore.getState().items).toHaveLength(1);
      expect(useWardrobeStore.getState().items[0].fragrance_id).toBe('frag-1');
    });

    it('returns null when free-tier user hits FREE_WARDROBE_CAP', () => {
      // Add exactly FREE_WARDROBE_CAP items
      for (let i = 0; i < FREE_WARDROBE_CAP; i++) {
        const id = useWardrobeStore.getState().add(makeItem(`frag-${i}`));
        expect(id).toBeTruthy();
      }
      // Next add should return null
      const id = useWardrobeStore.getState().add(makeItem('frag-overflow'));
      expect(id).toBeNull();
      expect(useWardrobeStore.getState().items).toHaveLength(FREE_WARDROBE_CAP);
    });

    it('succeeds beyond cap when isPro = true', () => {
      useProStore.setState({ isPro: true, purchasedAt: new Date().toISOString(), hasHydrated: true });
      for (let i = 0; i < FREE_WARDROBE_CAP + 5; i++) {
        const id = useWardrobeStore.getState().add(makeItem(`frag-${i}`));
        expect(id).toBeTruthy();
      }
      expect(useWardrobeStore.getState().items).toHaveLength(FREE_WARDROBE_CAP + 5);
    });

    it('deduplicates: updates existing entry when same fragrance_id is added again', () => {
      useWardrobeStore.getState().add(makeItem('frag-1', { status: 'want' }));
      expect(useWardrobeStore.getState().items).toHaveLength(1);

      const id = useWardrobeStore.getState().add(makeItem('frag-1', { status: 'have' }));
      expect(useWardrobeStore.getState().items).toHaveLength(1);
      expect(id).toBeTruthy();
      expect(useWardrobeStore.getState().items[0].status).toBe('have');
    });
  });

  describe('remove()', () => {
    it('removes the item by id', () => {
      const id = useWardrobeStore.getState().add(makeItem('frag-1')) as string;
      expect(useWardrobeStore.getState().items).toHaveLength(1);

      useWardrobeStore.getState().remove(id);
      expect(useWardrobeStore.getState().items).toHaveLength(0);
    });

    it('does nothing when id does not exist', () => {
      useWardrobeStore.getState().add(makeItem('frag-1'));
      useWardrobeStore.getState().remove('nonexistent-id');
      expect(useWardrobeStore.getState().items).toHaveLength(1);
    });
  });

  describe('update()', () => {
    it('patches fields correctly', () => {
      const id = useWardrobeStore.getState().add(makeItem('frag-1', { size_ml: 50, remaining_ml: 50 })) as string;
      useWardrobeStore.getState().update(id, { remaining_ml: 25, notes: 'halfway done' });

      const item = useWardrobeStore.getState().items[0];
      expect(item.remaining_ml).toBe(25);
      expect(item.notes).toBe('halfway done');
      expect(item.size_ml).toBe(50); // unchanged
    });

    it('updates the updated_at timestamp', () => {
      const id = useWardrobeStore.getState().add(makeItem('frag-1')) as string;
      const before = useWardrobeStore.getState().items[0].updated_at;

      // Small delay to ensure timestamp differs
      jest.useFakeTimers();
      jest.advanceTimersByTime(1000);
      useWardrobeStore.getState().update(id, { notes: 'updated' });
      jest.useRealTimers();

      const after = useWardrobeStore.getState().items[0].updated_at;
      expect(after).not.toBe(before);
    });
  });

  // Regression: update() used to upsert a partial patch row ({ id, ...patch }).
  // Postgres validates NOT NULL constraints on the proposed insert tuple BEFORE
  // ON CONFLICT resolution, so the missing fragrance_id threw 23502 on every
  // edit and wardrobe edits never reached the server (Sentry 71d7a10f).
  describe('update() → server sync sends the FULL merged row', () => {
    const supabaseMock = require('@/lib/supabase');
    const { syncWrite } = require('@/src/lib/sync/syncWrite');
    const { setWardrobeUserId } = require('@/src/stores/useWardrobeStore');

    beforeEach(() => {
      supabaseMock.isSupabaseConfigured = true;
      setWardrobeUserId('user-1');
      syncWrite.mockClear();
    });

    afterEach(() => {
      supabaseMock.isSupabaseConfigured = false;
      setWardrobeUserId(null);
    });

    it('includes every NOT NULL column, not just the patch', () => {
      const id = useWardrobeStore.getState().add(makeItem('frag-1')) as string;
      syncWrite.mockClear();

      useWardrobeStore.getState().update(id, { remaining_ml: 25, notes: 'half gone' });

      expect(syncWrite).toHaveBeenCalledTimes(1);
      const [table, row, onConflict] = syncWrite.mock.calls[0];
      expect(table).toBe('wardrobe_items');
      expect(onConflict).toBe('id');
      // The patch itself
      expect(row.remaining_ml).toBe(25);
      expect(row.notes).toBe('half gone');
      // NOT NULL columns that the old partial upsert dropped → 23502
      expect(row.fragrance_id).toBe('frag-1');
      expect(row.status).toBe('have');
      expect(row.created_at).toBeTruthy();
      expect(row.user_id).toBe('user-1');
      // Local-only flag must never reach the DB
      expect(row._unsynced).toBeUndefined();
    });

    it('clears _unsynced on successful sync and sets it on failure', async () => {
      const id = useWardrobeStore.getState().add(makeItem('frag-1')) as string;

      syncWrite.mockResolvedValueOnce({ ok: false, error: 'boom' });
      useWardrobeStore.getState().update(id, { remaining_ml: 10 });
      await new Promise((r) => setTimeout(r, 0));
      expect(useWardrobeStore.getState().items[0]._unsynced).toBe(true);

      syncWrite.mockResolvedValueOnce({ ok: true });
      useWardrobeStore.getState().update(id, { remaining_ml: 5 });
      await new Promise((r) => setTimeout(r, 0));
      expect(useWardrobeStore.getState().items[0]._unsynced).toBe(false);
    });

    it('does not call syncWrite for an unknown id', () => {
      useWardrobeStore.getState().update('nonexistent-id', { remaining_ml: 1 });
      expect(syncWrite).not.toHaveBeenCalled();
    });
  });

  describe('byStatus() / inRotation()', () => {
    it('inRotation() returns only items with status=have', () => {
      useWardrobeStore.getState().add(makeItem('frag-1', { status: 'have' }));
      useWardrobeStore.getState().add(makeItem('frag-2', { status: 'want' }));
      useWardrobeStore.getState().add(makeItem('frag-3', { status: 'tested' }));

      const inRotation = useWardrobeStore.getState().inRotation();
      expect(inRotation).toHaveLength(1);
      expect(inRotation[0].fragrance_id).toBe('frag-1');
    });
  });

  describe('wardrobeCount / items.length', () => {
    it('returns correct count after multiple adds', () => {
      useWardrobeStore.getState().add(makeItem('frag-1'));
      useWardrobeStore.getState().add(makeItem('frag-2'));
      useWardrobeStore.getState().add(makeItem('frag-3'));
      expect(useWardrobeStore.getState().items).toHaveLength(3);
    });
  });

  describe('unsyncedCount()', () => {
    it('returns 0 when every item is synced', () => {
      useWardrobeStore.getState().add(makeItem('frag-1'));
      // add() marks demo-mode items _unsynced: true (no backend to write to);
      // clear it to simulate a successful server write.
      useWardrobeStore.setState({
        items: useWardrobeStore.getState().items.map((i) => ({ ...i, _unsynced: false })),
      });
      expect(useWardrobeStore.getState().unsyncedCount()).toBe(0);
    });

    it('returns count of items with _unsynced: true', () => {
      useWardrobeStore.getState().add(makeItem('frag-1'));
      useWardrobeStore.getState().add(makeItem('frag-2'));
      const items = useWardrobeStore.getState().items;
      useWardrobeStore.setState({
        items: items.map((item, i) => i === 0 ? { ...item, _unsynced: true } : { ...item, _unsynced: false }),
      });
      expect(useWardrobeStore.getState().unsyncedCount()).toBe(1);
    });

    it('marks a demo-mode add as unsynced (no backend to write to)', () => {
      // Without Supabase configured, add() pre-flags _unsynced so the item
      // survives the hydration merge on the next sign-in.
      useWardrobeStore.getState().add(makeItem('frag-1'));
      expect(useWardrobeStore.getState().unsyncedCount()).toBe(1);
    });
  });

  describe('getByFragrance()', () => {
    it('returns the item for a given fragrance_id', () => {
      useWardrobeStore.getState().add(makeItem('frag-42'));
      const found = useWardrobeStore.getState().getByFragrance('frag-42');
      expect(found).toBeDefined();
      expect(found?.fragrance_id).toBe('frag-42');
    });

    it('returns undefined when fragrance not in wardrobe', () => {
      expect(useWardrobeStore.getState().getByFragrance('not-here')).toBeUndefined();
    });
  });
});
