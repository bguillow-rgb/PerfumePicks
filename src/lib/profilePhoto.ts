import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useProfileStore } from '@/src/stores/useProfileStore';

/**
 * Pick a photo from the library, present iOS's built-in square crop UI, then
 * downsize to a tidy 320×320 JPEG before storing the URI.
 *
 * Why we resize: the avatar appears at ~26-44px in most places. Storing a
 * 4032×3024 photo would waste space and slow image decoding. 320×320 is
 * sharp on every screen size at every avatar size, and JPEG-q-85 keeps the
 * file under ~30 KB.
 *
 * Returns the new URI on success, or null if the user cancelled.
 */
export async function pickAndSetProfilePhoto(): Promise<string | null> {
  // 1. Permissions — iOS shows the access prompt the first time.
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;

  // 2. Picker with the system square-crop UI. aspect:[1,1] forces a circle-
  //    friendly result (we display in a circular mask but the underlying
  //    image still has corners — square crop avoids weird offsets).
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  if (picked.canceled || !picked.assets?.[0]) return null;

  const original = picked.assets[0].uri;

  // 3. Downsize to 320×320 JPEG so AsyncStorage isn't bloated and the image
  //    decodes instantly even on the lowest-spec iPhone we support.
  const resized = await ImageManipulator.manipulateAsync(
    original,
    [{ resize: { width: 320, height: 320 } }],
    { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
  );

  // 4. Save into the persisted profile store. Avatars across the app
  //    re-render automatically.
  useProfileStore.getState().setPhotoUri(resized.uri);
  return resized.uri;
}

export function clearProfilePhoto(): void {
  useProfileStore.getState().setPhotoUri(null);
}
