import { useState, useCallback } from 'react';
import { Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { getDeviceId } from '@/lib/deviceId';
import { Alert } from '@/src/components/ui/StyledAlert';

// Hook that powers the "Add a photo" affordance on cigars missing an image.
//
// Flow:
//   1. Ask for media-library permission, open picker, let user crop.
//   2. Upload to the existing `cigar-images` Supabase Storage bucket.
//   3. Insert a row in `cigar_image_submissions`. The DB trigger
//      `promote_cigar_image_if_takedown` auto-promotes the submission to the
//      canonical image when the cigar is in takedown; otherwise it sits
//      pending for manual review.
//   4. Caller is expected to refetch the cigar after the promise resolves so
//      the UI reflects a newly-promoted image.

export interface UseCigarImageUpload {
  uploading: boolean;
  pickAndSubmit: (cigarId: string) => Promise<{ submitted: boolean }>;
}

export function useCigarImageUpload(): UseCigarImageUpload {
  const [uploading, setUploading] = useState(false);

  const pickAndSubmit = useCallback(async (cigarId: string) => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Photo library access needed',
          'Enable photos access in Settings so you can submit an image.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
        return { submitted: false };
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        // Square crop matches the display aspect everywhere we render cigar art.
        aspect: [1, 1],
        quality: 0.85,
        selectionLimit: 1,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return { submitted: false };
      const uri = result.assets[0].uri;

      setUploading(true);

      const [{ data: authData }, deviceId] = await Promise.all([
        supabase.auth.getUser(),
        getDeviceId(),
      ]);
      const user = authData?.user ?? null;
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
      // Storage path: group by cigar so a moderator can audit all submissions
      // for a given stick without combing by user. Anonymous uploads go under
      // the `anon/` prefix to keep them separable.
      const filePath = `${cigarId}/${user?.id ?? 'anon'}/${fileName}`;

      const imgRes = await fetch(uri);
      const blob = await imgRes.blob();

      const { error: uploadErr } = await supabase.storage
        .from('cigar-images')
        .upload(filePath, blob, { contentType: 'image/jpeg' });
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage
        .from('cigar-images')
        .getPublicUrl(filePath);

      const { error: insertErr } = await supabase.from('cigar_image_submissions').insert({
        cigar_id: cigarId,
        user_id: user?.id ?? null,
        device_id: deviceId,
        image_url: urlData.publicUrl,
      });
      if (insertErr) throw insertErr;

      Alert.alert(
        'Thanks',
        "Your photo's been submitted. If this cigar doesn't have an image, it'll appear for everyone shortly.",
      );
      return { submitted: true };
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? 'Could not submit that photo. Try again.');
      return { submitted: false };
    } finally {
      setUploading(false);
    }
  }, []);

  return { uploading, pickAndSubmit };
}
