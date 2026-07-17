// invite.ts — Feature A: the DNA-as-hook invite/referral loop.
//
// A user shares their Fragrance DNA archetype ("The Seducer") as the hook to
// pull friends in. The share carries a link to the marketing site's invite
// landing page, tagged with the sharer's archetype (for the hook copy) and
// their user id as the referrer (for best-effort attribution once the invitee
// signs up — see referral.ts).
//
// The link points at the web landing page (not the App Store directly) so it
// renders a rich preview + archetype hook and routes to the store from there;
// once universal links are live (associatedDomains: applinks:perfumepicks.app)
// an installed app opens straight into the invite path.

import { Share } from 'react-native';
import { track, EVENTS } from '@/src/lib/observability';
import { getCurrentUser } from '@/src/stores/useAuthStore';
import { ARCHETYPE_COPY, dnaDisplayName } from '@/src/features/dna/revealCopy';
import type { ArchetypeKey } from '@/src/features/dna/types';

const INVITE_ORIGIN = 'https://perfumepicks.app';

/** Build the shareable invite URL. `a` = archetype (hook copy), `r` = referrer. */
export function buildInviteUrl(archetype?: ArchetypeKey | null): string {
  const params: string[] = [];
  if (archetype) params.push(`a=${encodeURIComponent(archetype)}`);
  const user = getCurrentUser();
  if (user?.id) params.push(`r=${encodeURIComponent(user.id)}`);
  return `${INVITE_ORIGIN}/i${params.length ? `?${params.join('&')}` : ''}`;
}

/**
 * The share-sheet hook line. Renders the modifier-folded display form
 * ("The Magnetic Classicist") when a modifier is present; plain archetype name
 * when it's null; a generic hook when there's no archetype at all. Exported
 * pure so the M3 exit gate can unit-test the rendered copy.
 */
export function inviteHook(
  archetype?: ArchetypeKey | null,
  modifier?: string | null,
): string {
  // Keep the legacy guard: an archetype key without copy (never expected, but
  // persisted data outlives rosters) gets the generic hook, not a fallback name.
  const name =
    archetype && ARCHETYPE_COPY[archetype] ? dnaDisplayName(archetype, modifier) : null;
  return name
    ? `My Fragrance DNA came back "${name}". Find out yours 👇`
    : `Just found my Fragrance DNA on Perfume Picks. Find out yours 👇`;
}

/**
 * Open the native share sheet with a DNA-hook invite. Safe to call with no
 * archetype (falls back to a generic hook). `source` labels where the tap came
 * from (dna_reveal / profile) for funnel analysis. `modifier` is the persisted
 * snake_case secondary-trait key (DnaArchetype.modifier); when present the
 * hook reads "The Magnetic Classicist".
 */
export async function inviteFriends(
  archetype?: ArchetypeKey | null,
  // 'dna_reveal'    — the one-time post-quiz celebration screen
  // 'taste_profile' — the durable DNA card the user comes back to
  // 'profile'       — the "Invite friends" row in profile settings
  source: 'dna_reveal' | 'taste_profile' | 'profile' | 'unknown' = 'unknown',
  modifier?: string | null,
): Promise<void> {
  const url = buildInviteUrl(archetype);
  const hook = inviteHook(archetype, modifier);

  track(EVENTS.INVITE_SHARED, { archetype: archetype ?? null, source });
  try {
    // Everything in `message` (url included) so the hook text is never dropped
    // by a share target that would otherwise use only the `url` field.
    await Share.share({ message: `${hook}\n${url}` });
  } catch {
    // user dismissed the share sheet — nothing to do.
  }
}
