import { useLayeringStore } from '@/src/stores/useLayeringStore';

const expoCrypto = require('expo-crypto');

beforeEach(() => {
  expoCrypto.__resetCounter();
  useLayeringStore.setState({ entries: [] });
});

describe('useLayeringStore', () => {
  describe('add() — canonical ordering', () => {
    it('add("b", "a") stores entry with fragrance_a_id = "a" and fragrance_b_id = "b"', () => {
      useLayeringStore.getState().add('b', 'a');
      const entry = useLayeringStore.getState().entries[0];
      expect(entry.fragrance_a_id).toBe('a');
      expect(entry.fragrance_b_id).toBe('b');
    });

    it('add("a", "b") stores entry with fragrance_a_id = "a" and fragrance_b_id = "b"', () => {
      useLayeringStore.getState().add('a', 'b');
      const entry = useLayeringStore.getState().entries[0];
      expect(entry.fragrance_a_id).toBe('a');
      expect(entry.fragrance_b_id).toBe('b');
    });

    it('returns a string ID', () => {
      const id = useLayeringStore.getState().add('a', 'b');
      expect(typeof id).toBe('string');
      expect(id).toBeTruthy();
    });

    it('stores optional note trimmed', () => {
      useLayeringStore.getState().add('a', 'b', '  great combo  ');
      expect(useLayeringStore.getState().entries[0].note).toBe('great combo');
    });

    it('stores null note when none provided', () => {
      useLayeringStore.getState().add('a', 'b');
      expect(useLayeringStore.getState().entries[0].note).toBeNull();
    });
  });

  describe('forFragrance()', () => {
    it('returns entries where either a or b is the given fragrance_id', () => {
      useLayeringStore.getState().add('a', 'b');
      useLayeringStore.getState().add('a', 'c');
      useLayeringStore.getState().add('d', 'e');

      const result = useLayeringStore.getState().forFragrance('a');
      expect(result).toHaveLength(2);
      result.forEach((entry) => {
        expect(entry.fragrance_a_id === 'a' || entry.fragrance_b_id === 'a').toBe(true);
      });
    });

    it('returns empty array when fragrance has no layering entries', () => {
      useLayeringStore.getState().add('a', 'b');
      expect(useLayeringStore.getState().forFragrance('z')).toEqual([]);
    });
  });

  describe('remove()', () => {
    it('deletes by ID', () => {
      const id = useLayeringStore.getState().add('a', 'b');
      useLayeringStore.getState().remove(id);
      expect(useLayeringStore.getState().entries).toHaveLength(0);
    });

    it('does not remove other entries', () => {
      const id1 = useLayeringStore.getState().add('a', 'b');
      const id2 = useLayeringStore.getState().add('c', 'd');
      useLayeringStore.getState().remove(id1);
      expect(useLayeringStore.getState().entries).toHaveLength(1);
      expect(useLayeringStore.getState().entries[0].id).toBe(id2);
    });
  });
});
