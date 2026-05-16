/**
 * "Find this fragrance" Pro-gate state.
 *
 * Free users get ONE deeper search lifetime so they experience the magic;
 * every subsequent attempt routes them to the paywall. Per-device flag
 * stored in AsyncStorage — server-side enforcement isn't necessary because
 * the deeper-search edge function already counts each call against the
 * user's 10-scan free quota. This flag is purely UX signaling.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'pp.find_deeper.consumed';

export async function hasConsumedFreeDeeperSearch(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    return v === '1';
  } catch {
    return false;
  }
}

export async function markFreeDeeperSearchConsumed(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, '1');
  } catch {
    // Non-blocking.
  }
}

export async function resetFreeDeeperSearch(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Non-blocking.
  }
}
