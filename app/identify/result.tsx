/**
 * Perfume Concierge — Result screen (loading passthrough).
 *
 * This screen exists only for the gallery/deep-link path where an imageUri
 * is passed via params. It runs the AI identification and ALWAYS redirects
 * to confirm-personal. The camera.tsx screen handles its own scanning
 * inline, so most users never see this screen.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { COLORS, FONTS, SPACING, TYPE } from '@/src/constants/theme';

export default function ResultScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ imageUris: string }>();

  // If someone navigates here directly, redirect to camera
  useEffect(() => {
    if (!params.imageUris) {
      router.replace('/identify/camera' as any);
    }
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl }}>
        <Text style={{ ...TYPE.eyebrow, letterSpacing: 2, marginBottom: SPACING.md }}>
          PERFUME CONCIERGE
        </Text>
        <Text style={{ fontFamily: FONTS.serif, fontSize: 20, fontWeight: '600', color: COLORS.text }}>
          Redirecting…
        </Text>
      </View>
    </SafeAreaView>
  );
}
