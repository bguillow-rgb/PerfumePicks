/**
 * Push / local notification service for Perfume Picks.
 *
 * Two notification types:
 *   SOTD  — daily 8am "Your scent for today" (repeating)
 *   BOTTLES — one-shot 48h after first sign-in if wardrobe is empty
 *
 * All scheduling goes through this module so the store IDs stay consistent.
 * Callers should always read/write the store via useNotificationStore; this
 * module only interacts with expo-notifications.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { useNotificationStore } from '@/src/stores/useNotificationStore';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { resolveCurrentUser } from '@/src/stores/useAuthStore';
import { track, EVENTS } from '@/src/lib/observability';

/**
 * Which KIND of authorization we hold, for the funnel:
 *   'provisional' — silent quiet grant (Notification Center only, no banner).
 *   'authorized'  — full/prominent (granted outright, or the user tapped iOS's
 *                   "Keep" to upgrade). provisional -> authorized IS the Keep rate.
 */
function authorizationLabel(
  perms: Notifications.NotificationPermissionsStatus,
): 'provisional' | 'authorized' | 'none' {
  if (perms.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return 'provisional';
  return perms.status === 'granted' ? 'authorized' : 'none';
}

// EAS project id — getExpoPushTokenAsync needs it to mint a token bound to this
// project. Mirrors app.json expo.extra.eas.projectId.
const EAS_PROJECT_ID = '45707459-d6b8-4aa8-8ddf-5a5894dde578';

// ── Foreground behaviour: show banner + sound while app is open ────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// ── Permission ─────────────────────────────────────────────────────────────

/**
 * Request iOS notification permission.
 * Updates the store and returns true if granted.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  const { setPermissionStatus } = useNotificationStore.getState();

  if (Platform.OS === 'android') {
    // Android 13+ requires POST_NOTIFICATIONS; expo-notifications handles this.
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Perfume Picks',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const { status } = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: false,
      allowSound: false,
    },
  });

  const granted = status === 'granted';
  setPermissionStatus(granted ? 'granted' : 'denied');
  return granted;
}

/**
 * Register this device for SERVER push: mint the Expo push token and upsert it
 * (with the device's UTC offset) to push_tokens, so the daily-sotd-push edge
 * function can reach this user even when the app is closed. Without this, the
 * only nudge was a local on-device notification that couldn't re-engage a lapsed
 * user. Best-effort and fully swallowed — never blocks the caller.
 *
 * Call AFTER permission is granted (getExpoPushTokenAsync needs the grant).
 */
export async function registerPushToken(status?: 'provisional' | 'authorized'): Promise<void> {
  if (Platform.OS === 'web' || !isSupabaseConfigured) return;

  // Mint the Expo token. This is the single most likely silent-failure point
  // (no APNs entitlement, no network, simulator), so it gets its own stage.
  let token: string | undefined;
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID });
    token = data;
  } catch (e) {
    track(EVENTS.PUSH_REGISTER_FAILED, { stage: 'token_fetch', message: String((e as Error)?.message ?? e).slice(0, 200) });
    return;
  }
  if (!token) {
    track(EVENTS.PUSH_REGISTER_FAILED, { stage: 'token_fetch', message: 'empty token' });
    return;
  }

  const user = await resolveCurrentUser();
  if (!user) {
    // RLS needs auth.uid() = user_id; no session → can't write. Now visible.
    track(EVENTS.PUSH_REGISTER_FAILED, { stage: 'no_user' });
    return;
  }

  try {

    // IANA zone ('America/New_York') is the source of truth — it resolves the
    // right offset for the actual send date, so 8am local stays 8am across DST.
    // tz_offset_minutes is kept as a fallback for the edge function. Positive
    // minutes = behind UTC (getTimezoneOffset returns +300 for ET), stored as-is.
    let tz: string | undefined;
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      /* Intl tz unavailable — fall back to the offset alone */
    }
    const tz_offset_minutes = -new Date().getTimezoneOffset();

    const { error } = await supabase.from('push_tokens').upsert(
      {
        user_id: user.id,
        token,
        platform: Platform.OS,
        tz: tz ?? null,
        tz_offset_minutes,
        // Re-registering a previously dead token (app reinstalled) revives it.
        invalid_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    if (error) {
      track(EVENTS.PUSH_REGISTER_FAILED, { stage: 'upsert', message: String(error.message).slice(0, 200) });
      return;
    }
    track(EVENTS.PUSH_TOKEN_REGISTERED, { status: status ?? null });
  } catch (e) {
    track(EVENTS.PUSH_REGISTER_FAILED, { stage: 'unknown', message: String((e as Error)?.message ?? e).slice(0, 200) });
  }
}

/**
 * Ensure this device is registered for push — the audience-builder.
 *
 * Requests PROVISIONAL authorization (iOS): if the user hasn't made an explicit
 * choice yet, the system grants it SILENTLY (no prompt) and we can send quiet,
 * non-interrupting notifications straight to Notification Center. If they already
 * granted full permission, this is a no-op that keeps it. If they explicitly
 * denied, it stays denied.
 *
 * Why this matters: almost nobody opts in through a prompt (the data showed 1
 * token). But most users are still OS-"undetermined" — the soft pre-prompt gated
 * the real iOS dialog, so "Not now" never actually denied at the system level.
 * Provisional turns that silent-undetermined majority into a reachable audience
 * without asking. Call on every launch (idempotent).
 */
export async function ensurePushRegistered(): Promise<void> {
  if (Platform.OS === 'web' || !isSupabaseConfigured) return;
  track(EVENTS.PUSH_REGISTER_ATTEMPTED);
  try {
    const perms = await Notifications.requestPermissionsAsync({
      ios: {
        allowProvisional: true, // silent quiet-notification grant when undetermined
        allowAlert: true,
        allowBadge: false,
        allowSound: false,
      },
    });
    const label = authorizationLabel(perms);
    if (label === 'none') {
      track(EVENTS.PUSH_PERMISSION_DENIED);
      return;
    }
    track(EVENTS.PUSH_PERMISSION_GRANTED, { status: label });
    await registerPushToken(label);
  } catch (e) {
    track(EVENTS.PUSH_REGISTER_FAILED, { stage: 'unknown', message: String((e as Error)?.message ?? e).slice(0, 200) });
  }
}

/**
 * Check current permission without prompting.
 * Syncs the store and returns the status string.
 */
export async function checkNotificationPermission(): Promise<'granted' | 'denied' | 'undetermined'> {
  const { setPermissionStatus } = useNotificationStore.getState();
  const { status } = await Notifications.getPermissionsAsync();
  const mapped = status === 'granted' ? 'granted'
    : status === 'denied' ? 'denied'
    : 'undetermined';
  setPermissionStatus(mapped);
  return mapped;
}

// ── SOTD — daily 8am ───────────────────────────────────────────────────────

/**
 * Schedule (or re-schedule) the daily SOTD notification at 8:00am local time.
 * Cancels any previously scheduled instance first.
 * Stores the new identifier in the notification store.
 */
export async function scheduleSotdNotification(): Promise<void> {
  const store = useNotificationStore.getState();

  // Cancel old one if it exists
  if (store.sotdScheduledId) {
    await Notifications.cancelScheduledNotificationAsync(store.sotdScheduledId).catch(() => {});
  }

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Your scent for today ✨',
      body: 'Open Perfume Picks to see what to wear.',
      data: { screen: 'today' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 8,
      minute: 0,
    },
  });

  store.setSotdScheduledId(id);
}

/**
 * Cancel the daily SOTD notification and clear the store ID.
 */
export async function cancelSotdNotification(): Promise<void> {
  const { sotdScheduledId, setSotdScheduledId } = useNotificationStore.getState();
  if (sotdScheduledId) {
    await Notifications.cancelScheduledNotificationAsync(sotdScheduledId).catch(() => {});
    setSotdScheduledId(null);
  }
}

// ── Add Bottles — one-shot 48h ─────────────────────────────────────────────

/**
 * Schedule the one-time "add your bottles" nudge, 48 hours from now.
 * Safe to call multiple times — skips if already scheduled.
 */
export async function scheduleAddBottlesNotification(): Promise<void> {
  const store = useNotificationStore.getState();

  // Already scheduled or already fired (id would be null after cancel)
  if (store.addBottlesScheduledId) return;

  const fireAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Your wardrobe is waiting',
      body: "Add the bottles you own and we'll tell you what to wear today.",
      data: { screen: 'wardrobe' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireAt,
    },
  });

  store.setAddBottlesScheduledId(id);
}

/**
 * Cancel the add-bottles reminder (call when user adds their first wardrobe item).
 */
export async function cancelAddBottlesNotification(): Promise<void> {
  const { addBottlesScheduledId, setAddBottlesScheduledId } = useNotificationStore.getState();
  if (addBottlesScheduledId) {
    await Notifications.cancelScheduledNotificationAsync(addBottlesScheduledId).catch(() => {});
    setAddBottlesScheduledId(null);
  }
}

// ── Teardown (sign-out) ────────────────────────────────────────────────────

/**
 * Cancel all scheduled notifications. Call on sign-out.
 */
export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  const store = useNotificationStore.getState();
  store.setSotdScheduledId(null);
  store.setAddBottlesScheduledId(null);
}
