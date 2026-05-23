import { useProStore } from '@/src/stores/useProStore';

beforeEach(() => {
  useProStore.setState({ isPro: false, purchasedAt: null, hasHydrated: false });
});

describe('useProStore', () => {
  describe('activate()', () => {
    it('sets isPro = true', () => {
      useProStore.getState().activate();
      expect(useProStore.getState().isPro).toBe(true);
    });

    it('sets purchasedAt to a non-null ISO timestamp', () => {
      useProStore.getState().activate();
      const { purchasedAt } = useProStore.getState();
      expect(purchasedAt).toBeTruthy();
      expect(() => new Date(purchasedAt!)).not.toThrow();
    });
  });

  describe('deactivate()', () => {
    it('sets isPro = false', () => {
      useProStore.setState({ isPro: true, purchasedAt: '2026-01-01T00:00:00Z', hasHydrated: true });
      useProStore.getState().deactivate();
      expect(useProStore.getState().isPro).toBe(false);
    });

    it('clears purchasedAt', () => {
      useProStore.setState({ isPro: true, purchasedAt: '2026-01-01T00:00:00Z', hasHydrated: true });
      useProStore.getState().deactivate();
      expect(useProStore.getState().purchasedAt).toBeNull();
    });
  });

  describe('syncFromServer()', () => {
    it('syncFromServer(true) sets isPro = true regardless of local state', () => {
      // local is false, server says true
      useProStore.getState().syncFromServer(true);
      expect(useProStore.getState().isPro).toBe(true);
    });

    it('syncFromServer(true) when already true remains true', () => {
      useProStore.setState({ isPro: true, purchasedAt: '2026-01-01T00:00:00Z', hasHydrated: true });
      useProStore.getState().syncFromServer(true);
      expect(useProStore.getState().isPro).toBe(true);
    });

    it('syncFromServer(false) sets isPro = false regardless of local state', () => {
      useProStore.setState({ isPro: true, purchasedAt: '2026-01-01T00:00:00Z', hasHydrated: true });
      useProStore.getState().syncFromServer(false);
      expect(useProStore.getState().isPro).toBe(false);
    });

    it('syncFromServer(false) when already false remains false', () => {
      useProStore.getState().syncFromServer(false);
      expect(useProStore.getState().isPro).toBe(false);
    });

    it('syncFromServer(false) clears purchasedAt on mismatch', () => {
      useProStore.setState({ isPro: true, purchasedAt: '2026-01-01T00:00:00Z', hasHydrated: true });
      useProStore.getState().syncFromServer(false);
      expect(useProStore.getState().purchasedAt).toBeNull();
    });
  });
});
