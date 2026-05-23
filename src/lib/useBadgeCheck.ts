import { useEffect } from 'react';
import { useBadgesStore } from '@/src/stores/useBadgesStore';
import { useWearLogStore } from '@/src/stores/useWearLogStore';
import { useWardrobeStore } from '@/src/stores/useWardrobeStore';
import { useReviewsStore } from '@/src/stores/useReviewsStore';

/**
 * Runs badge eligibility checks against local data and awards any newly
 * earned badges. Call once near the app root (e.g. in _layout.tsx or
 * useAppSync). Idempotent — duplicate awards are no-ops in the store.
 */
export function useBadgeCheck() {
  const award = useBadgesStore((s) => s.award);
  const logs = useWearLogStore((s) => s.logs);
  const wardrobeItems = useWardrobeStore((s) => s.items);
  const myReviews = useReviewsStore((s) => s.mine);

  useEffect(() => {
    // First wear
    if (logs.length > 0) award('first_wear');

    // First review
    if (myReviews.length > 0) award('first_review');

    // Collector badges
    if (wardrobeItems.length >= 10) award('collector_10');
    if (wardrobeItems.length >= 50) award('collector_50');

    // Streak badges — compute consecutive days
    if (logs.length === 0) return;
    const days = new Set(logs.map((l) => l.worn_on));
    let streak = 0;
    const today = new Date();
    for (let i = 0; ; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString('en-CA');
      if (days.has(key)) { streak++; } else if (i > 0) { break; }
    }
    if (streak < 1) {
      // Allow starting from yesterday
      for (let i = 1; ; i++) {
        const d = new Date(today); d.setDate(d.getDate() - i);
        if (days.has(d.toLocaleDateString('en-CA'))) { streak++; } else { break; }
      }
    }
    if (streak >= 7)   award('streak_7');
    if (streak >= 30)  award('streak_30');
    if (streak >= 100) award('streak_100');
    if (streak >= 365) award('streak_365');
  }, [logs, wardrobeItems, myReviews]);
}
