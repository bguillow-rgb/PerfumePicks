/**
 * notifications.ts — push registration funnel instrumentation.
 *
 * This is the seam a simulator can't reach (getExpoPushTokenAsync needs real
 * APNs hardware), and it's exactly where Perfume was failing SILENTLY: the old
 * bare catch{} meant "1 token, no idea why". These tests assert every branch now
 * emits a typed event so the funnel is diagnosable from PostHog:
 *   attempted -> (granted{status} | denied) -> registered{status} | failed{stage}
 */

const mockTrack = jest.fn();
const mockUpsert = jest.fn(async () => ({ error: null as null | { message: string } }));
const mockUser: { current: { id: string } | null } = { current: { id: 'user-1' } };
const perms: { value: unknown } = { value: {} };
const tokenState: { data: string | null; throws: boolean } = { data: 'ExponentPushToken[x]', throws: false };

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

jest.mock('expo-notifications', () => ({
  IosAuthorizationStatus: { NOT_DETERMINED: 0, DENIED: 1, AUTHORIZED: 2, PROVISIONAL: 3 },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(async () => perms.value),
  getPermissionsAsync: jest.fn(async () => perms.value),
  getExpoPushTokenAsync: jest.fn(async () => {
    if (tokenState.throws) throw new Error('no valid aps-environment entitlement');
    return { data: tokenState.data };
  }),
}));

jest.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { from: () => ({ upsert: (...a: unknown[]) => mockUpsert(...a) }) },
}));

jest.mock('@/src/stores/useAuthStore', () => ({ resolveCurrentUser: async () => mockUser.current }));

jest.mock('@/src/stores/useNotificationStore', () => ({
  useNotificationStore: { getState: () => ({ setPermissionStatus: jest.fn() }) },
}));

jest.mock('@/src/lib/observability', () => ({
  track: (...a: unknown[]) => mockTrack(...a),
  EVENTS: jest.requireActual('@/src/lib/observability/events').EVENTS,
}));

import { ensurePushRegistered } from '@/src/lib/notifications';

const PROVISIONAL = { status: 'undetermined', ios: { status: 3 } };
const AUTHORIZED = { status: 'granted', ios: { status: 2 } };
const DENIED = { status: 'denied', ios: { status: 1 } };

const ev = (name: string) => mockTrack.mock.calls.filter((c) => c[0] === name);
const propsOf = (name: string) => ev(name)[0]?.[1];

beforeEach(() => {
  mockTrack.mockClear();
  mockUpsert.mockClear();
  mockUpsert.mockResolvedValue({ error: null });
  mockUser.current = { id: 'user-1' };
  tokenState.data = 'ExponentPushToken[x]';
  tokenState.throws = false;
  perms.value = PROVISIONAL;
});

describe('ensurePushRegistered — funnel', () => {
  it('always emits attempted, then registers a provisional grant silently', async () => {
    await ensurePushRegistered();
    expect(ev('push_register_attempted')).toHaveLength(1);
    expect(propsOf('push_permission_granted')).toEqual({ status: 'provisional' });
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(propsOf('push_token_registered')).toEqual({ status: 'provisional' });
  });

  it('labels a full grant as authorized (the iOS "Keep" state)', async () => {
    perms.value = AUTHORIZED;
    await ensurePushRegistered();
    expect(propsOf('push_permission_granted')).toEqual({ status: 'authorized' });
    expect(propsOf('push_token_registered')).toEqual({ status: 'authorized' });
  });

  it('records a denial and does not register a token', async () => {
    perms.value = DENIED;
    await ensurePushRegistered();
    expect(ev('push_permission_denied')).toHaveLength(1);
    expect(ev('push_token_registered')).toHaveLength(0);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('surfaces a token-fetch failure by stage (the top APNs suspect)', async () => {
    tokenState.throws = true;
    await ensurePushRegistered();
    expect(propsOf('push_register_failed')).toMatchObject({ stage: 'token_fetch' });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('surfaces a missing session by stage instead of swallowing it', async () => {
    mockUser.current = null;
    await ensurePushRegistered();
    expect(propsOf('push_register_failed')).toEqual({ stage: 'no_user' });
  });

  it('surfaces a DB upsert error by stage', async () => {
    mockUpsert.mockResolvedValueOnce({ error: { message: 'rls denied' } });
    await ensurePushRegistered();
    expect(propsOf('push_register_failed')).toMatchObject({ stage: 'upsert' });
    expect(ev('push_token_registered')).toHaveLength(0);
  });
});
