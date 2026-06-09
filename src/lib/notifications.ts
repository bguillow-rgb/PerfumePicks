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
