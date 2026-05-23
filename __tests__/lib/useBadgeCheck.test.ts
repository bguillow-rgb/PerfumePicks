/**
 * Tests for badge-check logic extracted from useBadgeCheck.
 *
 * We test the streak/collector/wear logic in isolation by directly seeding
 * the Zustand stores and then calling the badge award logic in the same way
 * useBadgeCheck does in its useEffect.
 */

import { useBadgesStore } from '@/src/stores/useBadgesStore';
import { useWearLogStore } from '@/src/stores/useWearLogStore';
import { useWardrobeStore } from '@/src/stores/useWardrobeStore';
import { useReviewsStore } from '@/src/stores/useReviewsStore';
import { useProStore } from '@/src/stores/useProStore';

const expoCrypto = require('expo-crypto');

// Replicate the badge check logic from useBadgeCheck for isolated testing
function runBadgeCheck() {
  const award = useBadgesStore.getState().award;
  const logs = useWearLogStore.getState().logs;
  const wardrobeItems = useWardrobeStore.getState().items;
  const myReviews = useReviewsStore.getState().mine;

  // First wear
  if (logs.length > 0) award('first_wear');

  // First review
  if (myReviews.length > 0) award('first_review');

  // Collector badges
  if (wardrobeItems.length >= 10) award('collector_10');
  if (wardrobeItems.length >= 50) award('collector_50');

  // Streak badges
  if (logs.length === 0) return;
  const days = new Set(logs.map((l) => l.worn_on));
  let streak = 0;
  const today = new Date();
  for (let i = 0; ; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString('en-CA');
    if (days.has(key)) { streak++; } else if (i > 0) { break; }
  }
  if (streak < 1) {
    for (let i = 1; ; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      if (days.has(d.toLocaleDateString('en-CA'))) { streak++; } else { break; }
    }
  }
  if (streak >= 7)   award('streak_7');
  if (streak >= 30)  award('streak_30');
  if (streak >= 100) award('streak_100');
  if (streak >= 365) award('streak_365');
}

function makeDateString(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toLocaleDateString('en-CA'); // yyyy-mm-dd
}

function seedWearLogs(count: number, startDaysAgo = 0) {
  const logs = Array.from({ length: count }, (_, i) => ({
    id: `log-${i}`,
    fragrance_id: 'frag-1',
    worn_on: makeDateString(startDaysAgo + i),
    created_at: new Date(Date.now() - (startDaysAgo + i) * 86400000).toISOString(),
  }));
  useWearLogStore.setState({ logs });
}

function seedWardrobeItems(count: number) {
  const items = Array.from({ length: count }, (_, i) => ({
    id: `item-${i}`,
    fragrance_id: `frag-${i}`,
    status: 'have' as const,
    unit_type: 'bottle' as const,
    size_ml: 50,
    remaining_ml: 50,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
  useWardrobeStore.setState({ items });
}

beforeEach(() => {
  expoCrypto.__resetCounter();
  useBadgesStore.setState({ earned: [] });
  useWearLogStore.setState({ logs: [] });
  useWardrobeStore.setState({ items: [] });
  useReviewsStore.setState({ mine: [], community: {}, helpfulVotes: [] });
  useProStore.setState({ isPro: false, purchasedAt: null, hasHydrated: true });
});

describe('useBadgeCheck logic', () => {
  describe('first_wear badge', () => {
    it('no wears → no first_wear badge', () => {
      runBadgeCheck();
      expect(useBadgesStore.getState().has('first_wear')).toBe(false);
    });

    it('1 wear → first_wear badge awarded', () => {
      seedWearLogs(1);
      runBadgeCheck();
      expect(useBadgesStore.getState().has('first_wear')).toBe(true);
    });
  });

  describe('streak badges', () => {
    it('streak of 7 consecutive days → streak_7 awarded', () => {
      seedWearLogs(7, 0); // today, yesterday, ..., 6 days ago
      runBadgeCheck();
      expect(useBadgesStore.getState().has('streak_7')).toBe(true);
    });

    it('streak of 6 days → streak_7 NOT awarded', () => {
      seedWearLogs(6, 0);
      runBadgeCheck();
      expect(useBadgesStore.getState().has('streak_7')).toBe(false);
    });

    it('streak of 30 days → streak_30 awarded', () => {
      seedWearLogs(30, 0);
      runBadgeCheck();
      expect(useBadgesStore.getState().has('streak_30')).toBe(true);
    });

    it('non-consecutive logs do not count as streak', () => {
      // Add logs with a gap: today + 3 days ago (gap at 1 and 2 days ago)
      useWearLogStore.setState({
        logs: [
          { id: 'l1', fragrance_id: 'f1', worn_on: makeDateString(0), created_at: new Date().toISOString() },
          { id: 'l2', fragrance_id: 'f1', worn_on: makeDateString(3), created_at: new Date(Date.now() - 3 * 86400000).toISOString() },
          { id: 'l3', fragrance_id: 'f1', worn_on: makeDateString(4), created_at: new Date(Date.now() - 4 * 86400000).toISOString() },
          { id: 'l4', fragrance_id: 'f1', worn_on: makeDateString(5), created_at: new Date(Date.now() - 5 * 86400000).toISOString() },
          { id: 'l5', fragrance_id: 'f1', worn_on: makeDateString(6), created_at: new Date(Date.now() - 6 * 86400000).toISOString() },
          { id: 'l6', fragrance_id: 'f1', worn_on: makeDateString(7), created_at: new Date(Date.now() - 7 * 86400000).toISOString() },
          { id: 'l7', fragrance_id: 'f1', worn_on: makeDateString(8), created_at: new Date(Date.now() - 8 * 86400000).toISOString() },
        ],
      });
      runBadgeCheck();
      // Only 1-day streak from today (gap at day 1 and 2)
      expect(useBadgesStore.getState().has('streak_7')).toBe(false);
    });
  });

  describe('collector badges', () => {
    it('10 wardrobe items → collector_10 awarded', () => {
      seedWardrobeItems(10);
      runBadgeCheck();
      expect(useBadgesStore.getState().has('collector_10')).toBe(true);
    });

    it('9 wardrobe items → collector_10 NOT awarded', () => {
      seedWardrobeItems(9);
      runBadgeCheck();
      expect(useBadgesStore.getState().has('collector_10')).toBe(false);
    });

    it('50 wardrobe items → collector_50 awarded', () => {
      seedWardrobeItems(50);
      runBadgeCheck();
      expect(useBadgesStore.getState().has('collector_50')).toBe(true);
    });
  });

  describe('first_review badge', () => {
    it('1 review → first_review awarded', () => {
      useReviewsStore.setState({
        mine: [{
          id: 'r1', fragrance_id: 'f1', user_id: 'local', rating: 4,
          helpful_count: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }],
        community: {},
        helpfulVotes: [],
      });
      runBadgeCheck();
      expect(useBadgesStore.getState().has('first_review')).toBe(true);
    });

    it('no reviews → first_review NOT awarded', () => {
      runBadgeCheck();
      expect(useBadgesStore.getState().has('first_review')).toBe(false);
    });
  });
});
