/**
 * Perfume Concierge — Camera screen.
 *
 * Mirrors Pour Picks' camera.tsx architecture:
 *   - expo-camera viewfinder (expo-camera/next not needed; expo-image-picker
 *     for capture since react-native-vision-camera requires EAS build)
 *   - Gallery picker alternative
 *   - Scan quota gating (device-scoped)
 *   - Pro bypass
 *   - Routes to /identify/result with imageUris param
 */

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '@/src/constants/theme';
import { useScanCount, TOTAL_SCAN_LIMIT, GUEST_SCAN_LIMIT } from '@/src/hooks/useScanCount';
import { track, EVENTS } from '@/src/lib/observability';
import { useProStore } from '@/src/stores/useProStore';

function normalizeFileUri(path: string): string {
  if (!path) return '';
  if (path.startsWith('file://')) return path;
  return `file://${path.startsWith('/') ? '' : '/'}${path}`;
}

export default function CameraScreen() {
  const router = useRouter();
  const isPro = useProStore((s) => s.isPro);
  const { count, remaining, limitReached, guestLimitReached, isAnonymous, loading } =
    useScanCount();
  const [capturing, setCapturing] = useState(false);

  const treatAsPro = isPro;

  const handleCapture = async () => {
    if (!treatAsPro && limitReached) {
      router.push('/paywall' as any);
      return;
    }
    if (!treatAsPro && guestLimitReached) {
      Alert.alert(
        'Sign in to continue',
        `You've used ${GUEST_SCAN_LIMIT} free scans. Sign in to unlock ${TOTAL_SCAN_LIMIT - GUEST_SCAN_LIMIT} more.`,
        [
          { text: 'Sign In', onPress: () => router.push('/auth/login' as any) },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCapturing(true);

    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Camera Access Needed',
          'Allow camera access in Settings to scan bottles.'
        );
        setCapturing(false);
        return;
      }

      const pickerResult = await ImagePicker.launchCameraAsync({
        quality: 1,
        base64: false,
        allowsEditing: false,
      });

      if (pickerResult.canceled || !pickerResult.assets?.[0]?.uri) {
        setCapturing(false);
        return;
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      const uri = pickerResult.assets[0].uri;

      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1200 } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
      );

      track(EVENTS.SCAN_STARTED, { method: 'camera' });

      router.replace({
        pathname: '/identify/result',
        params: { imageUris: normalizeFileUri(manipulated.uri) },
      } as any);
    } catch (e) {
      console.warn('[camera] capture error:', e);
      Alert.alert('Error', 'Could not capture photo. Please try again.');
    } finally {
      setCapturing(false);
    }
  };

  const handleGallery = async () => {
    if (!treatAsPro && limitReached) {
      router.push('/paywall' as any);
      return;
    }
    if (!treatAsPro && guestLimitReached) {
      Alert.alert(
        'Sign in to continue',
        `You've used ${GUEST_SCAN_LIMIT} free scans. Sign in to unlock more.`,
        [
          { text: 'Sign In', onPress: () => router.push('/auth/login' as any) },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
      return;
    }

    Haptics.selectionAsync();

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      base64: false,
    });
    if (pickerResult.canceled || !pickerResult.assets?.[0]?.uri) return;

    const manipulated = await ImageManipulator.manipulateAsync(
      pickerResult.assets[0].uri,
      [{ resize: { width: 1200 } }],
      { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
    );

    track(EVENTS.SCAN_STARTED, { method: 'gallery' });

    router.replace({
      pathname: '/identify/result',
      params: { imageUris: normalizeFileUri(manipulated.uri) },
    } as any);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={28} color={COLORS.text} />
        </Pressable>
        <Text style={styles.headerTitle}>PERFUME CONCIERGE</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.center}>
        <View style={styles.iconCircle}>
          <Ionicons name="sparkles" size={36} color={COLORS.accent} />
        </View>
        <Text style={styles.heroTitle}>Identify a Fragrance</Text>
        <Text style={styles.heroSub}>
          Take a photo of a perfume bottle — our AI will identify it for you.
        </Text>

        <View style={styles.tipsCard}>
          <Tip icon="scan-outline" text="Fill the frame with the bottle" />
          <Tip icon="sunny-outline" text="Even, bright lighting works best" />
          <Tip icon="hand-left-outline" text="Hold steady, keep the label visible" />
        </View>

        <Pressable
          style={[styles.conciergeBtn, capturing && { opacity: 0.6 }]}
          onPress={handleCapture}
          disabled={capturing}
        >
          {capturing ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <>
              <Ionicons name="sparkles" size={16} color={COLORS.white} />
              <Text style={styles.conciergeBtnText}>Perfume Concierge</Text>
            </>
          )}
        </Pressable>

        <Pressable style={styles.galleryBtn} onPress={handleGallery}>
          <Ionicons name="images-outline" size={16} color={COLORS.muted} />
          <Text style={styles.galleryBtnText}>Choose from Library</Text>
        </Pressable>

        {!loading && !treatAsPro && remaining !== null && (
          <Text style={styles.quota}>
            {remaining} scan{remaining === 1 ? '' : 's'} remaining
            {isAnonymous ? ' · Sign in for more' : ' · Unlimited with Pro'}
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}

function Tip({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.tipRow}>
      <Ionicons name={icon} size={16} color={COLORS.accent} />
      <Text style={styles.tipText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  headerTitle: { ...TYPE.eyebrow, letterSpacing: 2 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
    gap: SPACING.md,
  },
  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  heroTitle: {
    fontFamily: FONTS.serif,
    fontSize: 26,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 32,
  },
  heroSub: {
    ...TYPE.bodySmall,
    color: COLORS.muted,
    textAlign: 'center',
    paddingHorizontal: SPACING.sm,
  },
  tipsCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: 10,
    width: '100%',
    marginTop: SPACING.md,
  },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  tipText: { ...TYPE.bodySmall, color: COLORS.text, flex: 1 },
  conciergeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.accent,
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: RADIUS.full,
    minWidth: 240,
    justifyContent: 'center',
    marginTop: SPACING.lg,
  },
  conciergeBtnText: {
    ...TYPE.label,
    color: COLORS.white,
    letterSpacing: 1.5,
    fontSize: 14,
  },
  galleryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: SPACING.sm,
  },
  galleryBtnText: {
    ...TYPE.label,
    color: COLORS.muted,
    fontSize: 12,
    letterSpacing: 0.5,
  },
  quota: {
    ...TYPE.caption,
    color: COLORS.subtle,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
});
