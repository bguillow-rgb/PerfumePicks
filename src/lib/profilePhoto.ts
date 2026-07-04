import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { useProfileStore } from '@/src/stores/useProfileStore';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { resolveCurrentUser } from '@/src/stores/useAuthStore';

/** Persist the avatar reference to the user's profiles row so it re-hydrates
 *  after sign-out/sign-in on this device. (Local-filename refs only resolve on
 *  the device that picked the photo; remote http URLs would resolve anywhere.) */
async function persistAvatarRef(ref: string | null): Promise<void> {
  if (!isSupabaseConfigured) return;
  const user = await resolveCurrentUser();
  if (!user) return;
  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: ref })
    .eq('id', user.id);
  if (error) console.warn('[profilePhoto] avatar_url persist failed:', error.message);
}

const AVATAR_FILENAME = 'profile_avatar.jpg';
const AVATAR_PATH = FileSystem.documentDirectory + AVATAR_FILENAME;

/**
 * Resolve a persisted avatar reference into a usable URI.
 *
 * iOS rotates the app's container UUID across reinstalls (and sometimes OTA
 * updates), so a previously-persisted *absolute* documentDirectory path goes
 * stale and the image fails to load. We now persist only the bare filename and
 * rebuild the path against the CURRENT documentDirectory here — which also
 * heals any legacy absolute path already saved in the store (we take its
 * basename and re-prepend today's container dir). Remote http(s) URIs pass
 * through untouched.
 */
export function resolveAvatarUri(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (stored.startsWith('http')) return stored;
  const filename = stored.split('/').pop() || AVATAR_FILENAME;
  return FileSystem.documentDirectory + filename;
}

/**
 * Pick a photo from the library, present iOS's built-in square crop UI, then
 * downsize to a tidy 320×320 JPEG and save to the documents directory so the
 * file persists across app launches (cache directory gets evicted by the OS).
 *
 * Returns the saved URI on success, or null if the user cancelled / permission denied.
 */
export async function pickAndSetProfilePhoto(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;

  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  if (picked.canceled || !picked.assets?.[0]) return null;

  const resized = await ImageManipulator.manipulateAsync(
    picked.assets[0].uri,
    [{ resize: { width: 320, height: 320 } }],
    { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
  );

  // Copy to documents directory for persistence. Delete first — copyAsync
  // may throw if the destination already exists on some OS versions.
  // Persist only the filename (not the absolute container path) so the avatar
  // survives container-UUID changes. Falls back to the cache URI just for this
  // session if the copy fails.
  let storedRef = resized.uri;
  try {
    await FileSystem.deleteAsync(AVATAR_PATH, { idempotent: true });
    await FileSystem.copyAsync({ from: resized.uri, to: AVATAR_PATH });
    storedRef = AVATAR_FILENAME;
  } catch (e) {
    console.warn('[profilePhoto] copy to documents failed, using cache URI:', e);
    // Fall through — at least the image shows for this session
  }

  useProfileStore.getState().setPhotoUri(storedRef);
  await persistAvatarRef(storedRef);
  return resolveAvatarUri(storedRef);
}

export async function clearProfilePhoto(): Promise<void> {
  try {
    await FileSystem.deleteAsync(AVATAR_PATH, { idempotent: true });
  } catch {}
  useProfileStore.getState().setPhotoUri(null);
  await persistAvatarRef(null);
}
