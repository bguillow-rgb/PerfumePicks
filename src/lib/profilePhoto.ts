import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { useProfileStore } from '@/src/stores/useProfileStore';

const AVATAR_PATH = FileSystem.documentDirectory + 'profile_avatar.jpg';

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
  let savedUri = resized.uri;
  try {
    await FileSystem.deleteAsync(AVATAR_PATH, { idempotent: true });
    await FileSystem.copyAsync({ from: resized.uri, to: AVATAR_PATH });
    savedUri = AVATAR_PATH;
  } catch (e) {
    console.warn('[profilePhoto] copy to documents failed, using cache URI:', e);
    // Fall through — at least the image shows for this session
  }

  useProfileStore.getState().setPhotoUri(savedUri);
  return savedUri;
}

export async function clearProfilePhoto(): Promise<void> {
  try {
    await FileSystem.deleteAsync(AVATAR_PATH, { idempotent: true });
  } catch {}
  useProfileStore.getState().setPhotoUri(null);
}
