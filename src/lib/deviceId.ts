/**
 * Durable device identifier for scan quota enforcement.
 * Persisted in AsyncStorage so it survives app updates and
 * Guest→signup→Guest cycles. The quota follows the device,
 * not the user account.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'pp.device_id';
let cached: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  try {
    const stored = await AsyncStorage.getItem(KEY);
    if (stored) {
      cached = stored;
      return stored;
    }
  } catch {
    // Fall through to generate.
  }
  const id = crypto.randomUUID();
  cached = id;
  try {
    await AsyncStorage.setItem(KEY, id);
  } catch {
    // Non-blocking — worst case is a new device id next launch.
  }
  return id;
}
