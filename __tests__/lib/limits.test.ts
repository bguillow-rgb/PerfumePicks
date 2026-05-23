import { FREE_WARDROBE_CAP, FREE_DAILY_SWIPE_CAP } from '@/src/lib/limits';

describe('limits', () => {
  it('FREE_WARDROBE_CAP equals 20', () => {
    expect(FREE_WARDROBE_CAP).toBe(20);
  });

  it('FREE_DAILY_SWIPE_CAP equals 10', () => {
    expect(FREE_DAILY_SWIPE_CAP).toBe(10);
  });
});
