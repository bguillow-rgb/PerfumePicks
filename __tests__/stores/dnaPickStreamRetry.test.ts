// Guards the retry-backoff policy that caps the DNA pick-stream sync storm.
// Context: a 2026-06 schema-cache outage made a persistently-failing row retry
// on every flush with no backoff — 5,375 failed writes / 3,055 in one day from
// 3 users. The fix is exponential backoff + a hard attempt cap.
import { backoffMs, RETRY_POLICY } from '@/src/stores/useDnaPickStreamStore';

const S = 1000;
const M = 60 * S;

describe('DNA pick-stream retry policy', () => {
  it('backs off exponentially from 30s, doubling each attempt', () => {
    expect(backoffMs(1)).toBe(30 * S);
    expect(backoffMs(2)).toBe(1 * M);
    expect(backoffMs(3)).toBe(2 * M);
    expect(backoffMs(4)).toBe(4 * M);
    expect(backoffMs(5)).toBe(8 * M);
    expect(backoffMs(6)).toBe(16 * M);
  });

  it('caps the delay at 30 minutes and never grows unbounded', () => {
    expect(backoffMs(7)).toBe(30 * M); // 32m would exceed the ceiling
    expect(backoffMs(8)).toBe(30 * M);
    expect(backoffMs(50)).toBe(30 * M);
  });

  it('is monotonic non-decreasing', () => {
    for (let n = 2; n <= 20; n++) {
      expect(backoffMs(n)).toBeGreaterThanOrEqual(backoffMs(n - 1));
    }
  });

  it('gives up in bounded time — total backoff before dead-letter is finite', () => {
    let total = 0;
    for (let n = 1; n < RETRY_POLICY.MAX_SYNC_ATTEMPTS; n++) total += backoffMs(n);
    // 30s+1m+2m+4m+8m+16m+30m ≈ 61.5 min. Bounded, not the old forever-loop.
    expect(RETRY_POLICY.MAX_SYNC_ATTEMPTS).toBe(8);
    expect(total).toBeLessThan(90 * M);
    expect(total).toBeGreaterThan(30 * M);
  });
});
