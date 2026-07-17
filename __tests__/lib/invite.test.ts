/**
 * M3 share-hook gate: the invite hook renders the modifier-folded display form
 * ("The Magnetic Classicist"), guards a null modifier, and keeps the generic
 * fallback when there's no archetype at all.
 */
import { buildInviteUrl, inviteFriends, inviteHook } from '@/src/lib/invite';

const mockShare = jest.fn((..._a: unknown[]) => Promise.resolve({ action: 'sharedAction' }));
jest.mock('react-native', () => ({
  Share: { share: (...a: unknown[]) => mockShare(...a) },
}));

const mockTrack = jest.fn((..._a: unknown[]) => undefined);
jest.mock('@/src/lib/observability', () => ({
  track: (...a: unknown[]) => mockTrack(...a),
  EVENTS: { INVITE_SHARED: 'invite_shared' },
}));

jest.mock('@/src/stores/useAuthStore', () => ({
  getCurrentUser: () => ({ id: 'user-42' }),
}));

beforeEach(() => {
  mockShare.mockClear();
  mockTrack.mockClear();
});

describe('inviteHook', () => {
  it('renders the modifier-folded display form', () => {
    expect(inviteHook('the_classicist', 'compliment_seeking')).toBe(
      'My Fragrance DNA came back "The Magnetic Classicist". Find out yours 👇',
    );
  });

  it('renders the plain archetype name when the modifier is null', () => {
    expect(inviteHook('the_seducer', null)).toBe(
      'My Fragrance DNA came back "The Seducer". Find out yours 👇',
    );
  });

  it('falls back to the generic hook with no archetype', () => {
    expect(inviteHook(null)).toBe(
      'Just found my Fragrance DNA on Perfume Picks. Find out yours 👇',
    );
  });
});

describe('buildInviteUrl', () => {
  it('carries the archetype and referrer', () => {
    expect(buildInviteUrl('the_night_owl')).toBe(
      'https://perfumepicks.app/i?a=the_night_owl&r=user-42',
    );
  });
});

describe('inviteFriends', () => {
  it('shares hook + url in the message and tracks the source', async () => {
    await inviteFriends('the_night_owl', 'dna_reveal', 'luxury');
    expect(mockShare).toHaveBeenCalledWith({
      message:
        'My Fragrance DNA came back "The Gilded Night Owl". Find out yours 👇\n' +
        'https://perfumepicks.app/i?a=the_night_owl&r=user-42',
    });
    expect(mockTrack).toHaveBeenCalledWith('invite_shared', {
      archetype: 'the_night_owl',
      source: 'dna_reveal',
    });
  });
});
