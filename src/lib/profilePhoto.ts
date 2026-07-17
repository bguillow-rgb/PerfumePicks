import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { decode as decodeBase64 } from 'base64-arraybuffer';
import { useProfileStore } from '@/src/stores/useProfileStore';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { resolveCurrentUser } from '@/src/stores/useAuthStore';

const AVATAR_BUCKET = 'avatars';

/**
 * Upload the resized avatar bytes to Storage so the photo actually persists
 * server-side: it survives a reinstall, syncs across devices, and is visible to
 * others. Returns the public URL (cache-busted) on success, or null on failure
 * so the caller can fall back to the device-local ref.
 *
 * Path is {userId}/avatar.jpg — the RLS policy in 202607171800_avatars_bucket.sql
 * locks writes to your own folder via (storage.foldername(name))[1] = auth.uid().
 */
async function uploadAvatar(localUri: string, userId: string): Promise<string | null> {
  try {
    // RN can't hand Storage a File/Blob from a file:// URI directly; read the
    // bytes as base64 and decode to an ArrayBuffer, which the SDK accepts.
    const base64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const bytes = decodeBase64(base64);
    const path = `${userId}/avatar.jpg`;

    const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, bytes, {
      contentType: 'image/jpeg',
      upsert: true, // overwrite the previous avatar in place
    });
    if (error) {
      console.warn('[profilePhoto] avatar upload failed:', error.message);
      return null;
    }

    const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
    // The path is stable across re-uploads, so the URL is too — append a version
    // param so a new photo isn't masked by the cached old one (in <Image> or a CDN).
    return `${data.publicUrl}?v=${Date.now()}`;
  } catch (e) {
    console.warn('[profilePhoto] avatar upload threw:', e);
    return null;
  }
}

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

  // Show the local copy immediately so the avatar updates without waiting on the
  // network round-trip.
  useProfileStore.getState().setPhotoUri(storedRef);

  // Then upload the bytes and make the REMOTE url the source of truth, so the
  // photo persists past a reinstall and resolves on other devices. If the upload
  // fails (offline, etc.) we keep the local-only ref — the photo still shows this
  // session, matching the old device-local behavior as a floor rather than a
  // regression.
  const user = await resolveCurrentUser();
  const remoteUrl =
    user && isSupabaseConfigured ? await uploadAvatar(resized.uri, user.id) : null;

  const finalRef = remoteUrl ?? storedRef;
  useProfileStore.getState().setPhotoUri(finalRef);
  await persistAvatarRef(finalRef);
  return resolveAvatarUri(finalRef);
}

export async function clearProfilePhoto(): Promise<void> {
  try {
    await FileSystem.deleteAsync(AVATAR_PATH, { idempotent: true });
  } catch {}
  const user = await resolveCurrentUser();
  if (user && isSupabaseConfigured) {
    // Best-effort: drop the uploaded object too, so clearing the photo doesn't
    // leave a stale avatar in the bucket that a re-hydrate could resurrect.
    try {
      await supabase.storage.from(AVATAR_BUCKET).remove([`${user.id}/avatar.jpg`]);
    } catch (e) {
      console.warn('[profilePhoto] avatar remove failed:', e);
    }
  }
  useProfileStore.getState().setPhotoUri(null);
  await persistAvatarRef(null);
}
