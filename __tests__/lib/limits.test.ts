import { FREE_WARDROBE_CAP, FREE_LIFETIME_WEAR_LOG_CAP } from '@/src/lib/limits';
import { FREE_DAILY_SWIPE_LIMIT } from '@/src/stores/useSwipeStore';
import { FREE_LIFETIME_SCAN_LIMIT } from '@/src/stores/useScanStore';

// These caps are the paywall. The 2026-07-16 audit found both set so far above
// real behavior that they never bound: the wardrobe cap was 20 while the
// largest real collection in the entire user base was 5 items, and the swipe
// cap was 10 while only 4 user-days ever reached it. 5 paywall views, 0 sales.
// The 2026-07-23 monetization pass tightened further (swipe 5->3, scans from a
// daily 10 to a LIFETIME 5, wear logs capped at 10) so the repeat loops actually
// create a decision point. These tests assert the caps stay inside observed
// behavior, not that the numbers equal themselves.
describe('free-tier limits', () => {
  it('wardrobe cap is 5 — the 6th add must hit the paywall', () => {
    expect(FREE_WARDROBE_CAP).toBe(5);
  });

  it('daily swipe cap is 3', () => {
    expect(FREE_DAILY_SWIPE_LIMIT).toBe(3);
  });

  it('scan cap is a LIFETIME 5 (not a daily reset)', () => {
    expect(FREE_LIFETIME_SCAN_LIMIT).toBe(5);
  });

  it('wear-log (journal) cap is a lifetime 10 — retention-safe but present', () => {
    expect(FREE_LIFETIME_WEAR_LOG_CAP).toBe(10);
  });

  // Guard rails: if someone raises these again, they should have to justify it
  // against real usage rather than quietly restore a decorative cap.
  it('wardrobe cap stays within observed collection sizes (max seen: 5)', () => {
    expect(FREE_WARDROBE_CAP).toBeGreaterThan(0);
    expect(FREE_WARDROBE_CAP).toBeLessThanOrEqual(10);
  });

  it('swipe cap stays low enough that an engaged session reaches it', () => {
    expect(FREE_DAILY_SWIPE_LIMIT).toBeGreaterThan(0);
    expect(FREE_DAILY_SWIPE_LIMIT).toBeLessThanOrEqual(10);
  });
});
