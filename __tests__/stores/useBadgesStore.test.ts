import { useBadgesStore } from '@/src/stores/useBadgesStore';

beforeEach(() => {
  useBadgesStore.setState({ earned: [] });
});

describe('useBadgesStore', () => {
  describe('award()', () => {
    it('adds badge to earned', () => {
      useBadgesStore.getState().award('first_wear');
      expect(useBadgesStore.getState().earned).toHaveLength(1);
      expect(useBadgesStore.getState().earned[0].key).toBe('first_wear');
    });

    it('sets awarded_at timestamp', () => {
      useBadgesStore.getState().award('first_wear');
      const badge = useBadgesStore.getState().earned[0];
      expect(badge.awarded_at).toBeTruthy();
      expect(() => new Date(badge.awarded_at)).not.toThrow();
    });

    it('is idempotent — no duplicates when called twice', () => {
      useBadgesStore.getState().award('first_wear');
      useBadgesStore.getState().award('first_wear');
      expect(useBadgesStore.getState().earned).toHaveLength(1);
    });

    it('can award multiple different badges', () => {
      useBadgesStore.getState().award('first_wear');
      useBadgesStore.getState().award('first_review');
      useBadgesStore.getState().award('collector_10');
      expect(useBadgesStore.getState().earned).toHaveLength(3);
    });
  });

  describe('has()', () => {
    it('returns true after award', () => {
      useBadgesStore.getState().award('first_wear');
      expect(useBadgesStore.getState().has('first_wear')).toBe(true);
    });

    it('returns false before award', () => {
      expect(useBadgesStore.getState().has('first_wear')).toBe(false);
    });

    it('returns false for a different badge key', () => {
      useBadgesStore.getState().award('first_wear');
      expect(useBadgesStore.getState().has('streak_7')).toBe(false);
    });
  });

  describe('hydrate()', () => {
    it('merges server rows without duplicating existing local badges', () => {
      useBadgesStore.getState().award('first_wear');
      const serverRows = [
        { key: 'first_wear' as const, awarded_at: '2026-01-01T00:00:00Z' },
        { key: 'streak_7' as const, awarded_at: '2026-02-01T00:00:00Z' },
      ];
      useBadgesStore.getState().hydrate(serverRows);
      const earned = useBadgesStore.getState().earned;
      // first_wear already present locally — should not duplicate
      const firstWearBadges = earned.filter((b) => b.key === 'first_wear');
      expect(firstWearBadges).toHaveLength(1);
      // streak_7 should be added from server
      expect(earned.some((b) => b.key === 'streak_7')).toBe(true);
      // total: 2 unique badges
      expect(earned).toHaveLength(2);
    });

    it('adds all server rows when no local badges exist', () => {
      const serverRows = [
        { key: 'collector_10' as const, awarded_at: '2026-03-01T00:00:00Z' },
        { key: 'first_review' as const, awarded_at: '2026-04-01T00:00:00Z' },
      ];
      useBadgesStore.getState().hydrate(serverRows);
      expect(useBadgesStore.getState().earned).toHaveLength(2);
    });
  });
});
