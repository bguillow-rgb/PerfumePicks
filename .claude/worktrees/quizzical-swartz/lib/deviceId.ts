// Durable device identifier used to enforce the free-scan quota across
// sign-in states (Guest → signup → Guest again all share the same quota).
//
// Strategy:
//   - iOS: prefer Apple's identifier-for-vendor (persists across reinstalls
//     while any app from the same vendor is installed). Stable per vendor.
//   - Fallback (or Android later): a UUID stored in SecureStore (keychain on
//     iOS) so it persists across reinstalls too.

import * as Application from 'expo-application';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const STORAGE_KEY = 'stickpicks.device_id';

let cached: string | null = null;

function uuid(): string {
  // RFC4122 v4 — no crypto dep needed.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;

  // Try iOS vendor ID first — no prompt, no permission.
  if (Platform.OS === 'ios') {
    try {
      const vendor = await Application.getIosIdForVendorAsync();
      if (vendor) {
        cached = vendor;
        // Mirror into SecureStore so uninstall-during-vendor-absence still keeps quota.
        try { await SecureStore.setItemAsync(STORAGE_KEY, vendor); } catch {}
        return vendor;
      }
    } catch {
      // fall through
    }
  }

  // Try reading our own stored UUID.
  try {
    const stored = await SecureStore.getItemAsync(STORAGE_KEY);
    if (stored) {
      cached = stored;
      return stored;
    }
  } catch {
    // fall through
  }

  // Last resort: mint one and persist.
  const fresh = uuid();
  cached = fresh;
  try { await SecureStore.setItemAsync(STORAGE_KEY, fresh); } catch {}
  return fresh;
}
