import { useComplimentsStore } from '@/src/stores/useComplimentsStore';

const expoCrypto = require('expo-crypto');

beforeEach(() => {
  expoCrypto.__resetCounter();
  useComplimentsStore.setState({ entries: [] });
});

describe('useComplimentsStore', () => {
  describe('add()', () => {
    it('adds an entry and returns an ID', () => {
      const id = useComplimentsStore.getState().add('frag-1');
      expect(typeof id).toBe('string');
      expect(id).toBeTruthy();
      expect(useComplimentsStore.getState().entries).toHaveLength(1);
      expect(useComplimentsStore.getState().entries[0].fragrance_id).toBe('frag-1');
    });

    it('stores optional context trimmed', () => {
      useComplimentsStore.getState().add('frag-1', '  work  ');
      expect(useComplimentsStore.getState().entries[0].context).toBe('work');
    });

    it('stores null context when none provided', () => {
      useComplimentsStore.getState().add('frag-1');
      expect(useComplimentsStore.getState().entries[0].context).toBeNull();
    });

    it('accumulates multiple entries', () => {
      useComplimentsStore.getState().add('frag-1');
      useComplimentsStore.getState().add('frag-1');
      useComplimentsStore.getState().add('frag-2');
      expect(useComplimentsStore.getState().entries).toHaveLength(3);
    });
  });

  describe('totalFor()', () => {
    it('returns correct count for a fragrance', () => {
      useComplimentsStore.getState().add('frag-1');
      useComplimentsStore.getState().add('frag-1');
      useComplimentsStore.getState().add('frag-2');
      expect(useComplimentsStore.getState().totalFor('frag-1')).toBe(2);
      expect(useComplimentsStore.getState().totalFor('frag-2')).toBe(1);
    });

    it('returns 0 when no compliments for fragrance', () => {
      expect(useComplimentsStore.getState().totalFor('nonexistent')).toBe(0);
    });
  });

  describe('forFragrance()', () => {
    it('returns only entries for the given fragrance', () => {
      useComplimentsStore.getState().add('frag-1', 'work');
      useComplimentsStore.getState().add('frag-1', 'date');
      useComplimentsStore.getState().add('frag-2', 'gym');

      const result = useComplimentsStore.getState().forFragrance('frag-1');
      expect(result).toHaveLength(2);
      result.forEach((e) => expect(e.fragrance_id).toBe('frag-1'));
    });

    it('returns empty array when no entries for fragrance', () => {
      useComplimentsStore.getState().add('frag-1');
      expect(useComplimentsStore.getState().forFragrance('frag-2')).toEqual([]);
    });
  });
});
