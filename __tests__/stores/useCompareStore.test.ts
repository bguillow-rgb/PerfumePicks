import { useCompareStore, COMPARE_MAX } from '@/src/stores/useCompareStore';

// M4b — Compare tray (PRD §7.5). Transient store; the 2–3 fragrances the user
// has picked to view side-by-side.

beforeEach(() => {
  useCompareStore.setState({ ids: [] });
});

describe('useCompareStore', () => {
  describe('toggle()', () => {
    it('adds an id and returns true', () => {
      const ok = useCompareStore.getState().toggle('frag-1');
      expect(ok).toBe(true);
      expect(useCompareStore.getState().ids).toEqual(['frag-1']);
    });

    it('removes an already-present id and returns true', () => {
      useCompareStore.getState().toggle('frag-1');
      const ok = useCompareStore.getState().toggle('frag-1');
      expect(ok).toBe(true);
      expect(useCompareStore.getState().ids).toEqual([]);
    });

    it('preserves insertion order across multiple adds', () => {
      useCompareStore.getState().toggle('a');
      useCompareStore.getState().toggle('b');
      useCompareStore.getState().toggle('c');
      expect(useCompareStore.getState().ids).toEqual(['a', 'b', 'c']);
    });

    it('returns false and does not add when at COMPARE_MAX', () => {
      for (let i = 0; i < COMPARE_MAX; i++) {
        expect(useCompareStore.getState().toggle(`frag-${i}`)).toBe(true);
      }
      const ok = useCompareStore.getState().toggle('overflow');
      expect(ok).toBe(false);
      expect(useCompareStore.getState().ids).toHaveLength(COMPARE_MAX);
      expect(useCompareStore.getState().ids).not.toContain('overflow');
    });

    it('still allows removing an existing id even when at max', () => {
      for (let i = 0; i < COMPARE_MAX; i++) {
        useCompareStore.getState().toggle(`frag-${i}`);
      }
      const ok = useCompareStore.getState().toggle('frag-0');
      expect(ok).toBe(true);
      expect(useCompareStore.getState().ids).toHaveLength(COMPARE_MAX - 1);
    });
  });

  describe('has()', () => {
    it('reports membership accurately', () => {
      useCompareStore.getState().toggle('frag-1');
      expect(useCompareStore.getState().has('frag-1')).toBe(true);
      expect(useCompareStore.getState().has('frag-2')).toBe(false);
    });
  });

  describe('remove()', () => {
    it('removes a specific id, leaving the rest', () => {
      useCompareStore.getState().toggle('a');
      useCompareStore.getState().toggle('b');
      useCompareStore.getState().remove('a');
      expect(useCompareStore.getState().ids).toEqual(['b']);
    });

    it('is a no-op for an id not present', () => {
      useCompareStore.getState().toggle('a');
      useCompareStore.getState().remove('missing');
      expect(useCompareStore.getState().ids).toEqual(['a']);
    });
  });

  describe('clear()', () => {
    it('empties the tray', () => {
      useCompareStore.getState().toggle('a');
      useCompareStore.getState().toggle('b');
      useCompareStore.getState().clear();
      expect(useCompareStore.getState().ids).toEqual([]);
    });
  });

  it('COMPARE_MAX is 3 per PRD §7.5', () => {
    expect(COMPARE_MAX).toBe(3);
  });
});
