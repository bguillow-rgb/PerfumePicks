// Direct port of Pour Picks' `src/lib/deviceId.ts` (itself a Stick Picks port)
// with the storage key renamed to 'perfumepicks.device_id'. Rest is verbatim.
//
// NOTE: an older, UNUSED copy exists at /lib/deviceId.ts (Stick Picks paste,
// key 'stickpicks.device_id') — nothing imports it, so this file is the live
// device-id surface for Perfume Picks (DNA layer M1 is its first consumer).
//
// Durable device identifier, stable across sign-in states (Guest → signup →
// Guest again all share the same id).
//
// Strategy:
//   - iOS: prefer Apple's identifier-for-vendor (persists across reinstalls
//     while any app from the same vendor is installed). Stable per vendor.
//   - Fallback (or Android later): a UUID stored in SecureStore (keychain on
//     iOS) so it persists across reinstalls too.

import * as Application from 'expo-application';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const STORAGE_KEY = 'perfumepicks.device_id';

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
        // Mirror into SecureStore so uninstall-during-vendor-absence still keeps the id.
        try {
          await SecureStore.setItemAsync(STORAGE_KEY, vendor);
        } catch {}
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
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, fresh);
  } catch {}
  return fresh;
}
