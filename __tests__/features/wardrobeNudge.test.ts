import { shouldShowWardrobeNudge } from '@/src/features/home/wardrobeNudge';

/**
 * Regression cover for the Home dead-CTA gap.
 *
 * Before this prompt shipped, Home's two wardrobe CTAs cancelled each other
 * out: GetStartedHero needed `isNewUser && !hasDna`, the SOTD section needed
 * `!isNewUser`, and a DNA-complete user with an empty shelf satisfied neither.
 * 98 of 163 profiles since launch were in that state and were never asked for a
 * single bottle. The first test below is the one that must never go red.
 */
describe('shouldShowWardrobeNudge', () => {
  it('SHOWS for an empty wardrobe, the cohort Home used to leave with no CTA at all', () => {
    expect(shouldShowWardrobeNudge({ wardrobeCount: 0 })).toBe(true);
  });

  it('retires as soon as the user has added anything at all', () => {
    expect(shouldShowWardrobeNudge({ wardrobeCount: 1 })).toBe(false);
  });

  it('stays retired however full the wardrobe gets', () => {
    for (const n of [2, 5, 12, 40]) {
      expect(shouldShowWardrobeNudge({ wardrobeCount: n })).toBe(false);
    }
  });
});
