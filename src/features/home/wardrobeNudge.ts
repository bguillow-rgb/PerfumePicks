export interface WardrobeNudgeInput {
  /**
   * Total wardrobe items, ALL statuses (have / want / tested / sold_on).
   * Deliberately not just `have`: the rule is "has this user added anything at
   * all", so a single wishlist save is enough to retire the prompt.
   */
  wardrobeCount: number;
}

/**
 * Should Home show the "add the bottles you own" prompt?
 *
 * Empty wardrobe only. Once a user has put anything in, the prompt has done its
 * job and Home goes back to leading with their Fragrance DNA.
 *
 * The prompt exists because Home used to have no wardrobe CTA at all for the
 * biggest cohort in the app. The two that existed cancelled each other out:
 *
 *   GetStartedHero  rendered on  isNewUser && !hasDna
 *   SOTD section    rendered on  !isNewUser
 *
 * Finish the DNA picker without adding a bottle and you are isNewUser AND you
 * have a DNA, which fails both. 98 of 163 profiles since launch (60%, measured
 * 2026-08-19) sat in that hole and were never once asked for their shelf, which
 * is the likeliest reason only 30% of profiles ever start a collection.
 */
export function shouldShowWardrobeNudge({ wardrobeCount }: WardrobeNudgeInput): boolean {
  return wardrobeCount === 0;
}
