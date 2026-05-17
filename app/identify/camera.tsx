/**
 * Perfume Concierge — Camera screen.
 *
 * Mirrors Pour Picks flow exactly:
 *   1. Native camera opens IMMEDIATELY on mount (via expo-image-picker)
 *   2. User takes photo — no confirmation step
 *   3. Shimmer loading while AI identifies
 *   4. ALWAYS routes to confirm-personal with fields filled in (or empty)
 *
 * If user cancels the camera, we go back. Gallery fallback available
 * from the idle state (shown if camera was cancelled or for retry).
 */

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '@/src/constants/theme';
import { identifyBottle } from '@/src/features/identify/identifyService';
import { useScanCount, TOTAL_SCAN_LIMIT, GUEST_SCAN_LIMIT } from '@/src/hooks/useScanCount';
import { track, EVENTS } from '@/src/lib/observability';
import { captureException } from '@/src/lib/observability';
import { useProStore } from '@/src/stores/useProStore';

function normalizeFileUri(path: string): string {
  if (!path) return '';
  if (path.startsWith('file://')) return path;
  return `file://${path.startsWith('/') ? '' : '/'}${path}`;
}

const LOADING_MESSAGES = [
  'Reading the label…',
  'Checking our catalog…',
  'Almost there…',
];

type ScreenState = 'launching' | 'idle' | 'scanning';

export default function CameraScreen() {
  const router = useRouter();
  const isPro = useProStore((s) => s.isPro);
  const { remaining, limitReached, guestLimitReached, isAnonymous, loading } =
    useScanCount();
  const [state, setState] = useState<ScreenState>('launching');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0]);
  const launched = useRef(false);

  // Rotate loading messages while scanning
  useEffect(() => {
    if (state !== 'scanning') return;
    let i = 0;
    const iv = setInterval(() => {
      i = (i + 1) % LOADING_MESSAGES.length;
      setLoadingMsg(LOADING_MESSAGES[i]);
    }, 1600);
    return () => clearInterval(iv);
  }, [state]);

  // Open camera immediately on mount
  useFocusEffect(
    useCallback(() => {
      if (launched.current) return;
      launched.current = true;
      const t = setTimeout(() => launchCamera(), 150);
      return () => clearTimeout(t);
    }, [])
  );

  const checkQuota = (): boolean => {
    if (isPro) return true;
    if (limitReached) {
      router.push('/paywall' as any);
      return false;
    }
    if (guestLimitReached) {
      Alert.alert(
        'Sign in to continue',
        `You've used ${GUEST_SCAN_LIMIT} free scans. Sign in to unlock ${TOTAL_SCAN_LIMIT - GUEST_SCAN_LIMIT} more.`,
        [
          { text: 'Sign In', onPress: () => router.push('/auth/login' as any) },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
      return false;
    }
    return true;
  };

  const processAndIdentify = async (uri: string) => {
    const manipulated = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1200 } }],
      { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
    );
    const normalizedUri = normalizeFileUri(manipulated.uri);
    setPhotoUri(normalizedUri);
    setState('scanning');

    track(EVENTS.SCAN_STARTED, { method: 'camera' });

    try {
      const result = await identifyBottle(normalizedUri);

      Haptics.notificationAsync(
        result.fragranceId
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning
      );

      // ALWAYS route to confirm — match or not
      router.replace({
        pathname: '/identify/confirm-personal',
        params: {
          scanId: result.scanId ?? '',
          fragranceId: result.fragranceId ?? '',
          brand: result.displayBrand !== 'Unknown' ? result.displayBrand : '',
          name: result.displayName !== 'Unknown' ? result.displayName : '',
          concentration: result.displayConcentration ?? '',
          confidence: String(result.confidence),
          reasoning: result.reasoning,
          imageUri: normalizedUri,
        },
      } as any);
    } catch (e: any) {
      captureException(e, { area: 'identify_bottle' });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

      // Even on error, route to confirm with empty fields
      router.replace({
        pathname: '/identify/confirm-personal',
        params: {
          scanId: '',
          fragranceId: '',
          brand: '',
          name: '',
          concentration: '',
          confidence: '0',
          reasoning: e?.message ?? '',
          imageUri: normalizedUri,
        },
      } as any);
    }
  };

  const launchCamera = async () => {
    if (!checkQuota()) {
      setState('idle');
      return;
    }

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Camera Access Needed',
        'Allow camera access in Settings to scan bottles.'
      );
      setState('idle');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const pickerResult = await ImagePicker.launchCameraAsync({
      quality: 1,
      base64: false,
      allowsEditing: false,
    });

    if (pickerResult.canceled || !pickerResult.assets?.[0]?.uri) {
      // User cancelled camera — show idle with retry options
      setState('idle');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    await processAndIdentify(pickerResult.assets[0].uri);
  };

  const launchGallery = async () => {
    if (!checkQuota()) return;

    Haptics.selectionAsync();
    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      base64: false,
    });
    if (pickerResult.canceled || !pickerResult.assets?.[0]?.uri) return;

    await processAndIdentify(pickerResult.assets[0].uri);
  };

  // ── Scanning state: shimmer over photo ──
  if (state === 'scanning') {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <View style={{ width: 28 }} />
          <Text style={styles.headerTitle}>PERFUME CONCIERGE</Text>
          <View style={{ width: 28 }} />
        </View>
        <View style={styles.center}>
          {photoUri && (
            <View style={styles.shimmerWrap}>
              <Image source={{ uri: photoUri }} style={styles.scanImage} />
              <ShimmerOverlay />
            </View>
          )}
          <Text style={styles.scanningTitle}>Identifying your fragrance</Text>
          <Text style={styles.scanningHint}>{loadingMsg}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Launching state: blank while camera opens ──
  if (state === 'launching') {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.center} />
      </SafeAreaView>
    );
  }

  // ── Idle state: shown after camera cancel or for retry ──
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
          Take a photo of a perfume bottle and we'll identify it instantly.
        </Text>

        <Pressable style={styles.primaryBtn} onPress={launchCamera}>
          <Ionicons name="camera" size={18} color={COLORS.white} />
          <Text style={styles.primaryBtnText}>Take Photo</Text>
        </Pressable>

        <Pressable style={styles.secondaryBtn} onPress={launchGallery}>
          <Ionicons name="images-outline" size={16} color={COLORS.muted} />
          <Text style={styles.secondaryBtnText}>Choose from Library</Text>
        </Pressable>

        {!loading && !isPro && remaining !== null && (
          <Text style={styles.quota}>
            {remaining} scan{remaining === 1 ? '' : 's'} remaining
            {isAnonymous ? ' · Sign in for more' : ' · Unlimited with Pro'}
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}

function ShimmerOverlay() {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.ease) }),
      -1,
      false
    );
  }, []);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -160 + progress.value * 320 }],
  }));
  return (
    <View style={styles.shimmerClip} pointerEvents="none">
      <Animated.View style={[styles.shimmerBar, animStyle]} />
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
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.accent,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  heroTitle: {
    fontFamily: FONTS.serif, fontSize: 26, fontWeight: '600',
    color: COLORS.text, textAlign: 'center', lineHeight: 32,
  },
  heroSub: {
    ...TYPE.bodySmall, color: COLORS.muted,
    textAlign: 'center', paddingHorizontal: SPACING.sm,
  },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.accent,
    paddingHorizontal: 40, paddingVertical: 16,
    borderRadius: RADIUS.full, minWidth: 240, justifyContent: 'center',
    marginTop: SPACING.lg,
  },
  primaryBtnText: {
    ...TYPE.label, color: COLORS.white, letterSpacing: 1.5, fontSize: 14,
  },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: SPACING.sm,
  },
  secondaryBtnText: {
    ...TYPE.label, color: COLORS.muted, fontSize: 12, letterSpacing: 0.5,
  },
  quota: {
    ...TYPE.caption, color: COLORS.subtle,
    textAlign: 'center', marginTop: SPACING.sm,
  },
  // Scanning
  shimmerWrap: {
    width: 220, height: 280, borderRadius: RADIUS.lg,
    overflow: 'hidden', marginBottom: SPACING.lg,
  },
  scanImage: { width: '100%', height: '100%' },
  shimmerClip: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  shimmerBar: {
    position: 'absolute', left: 0, right: 0, height: 6,
    backgroundColor: COLORS.accent, opacity: 0.5, borderRadius: 3,
  },
  scanningTitle: {
    fontFamily: FONTS.serif, fontSize: 20, fontWeight: '600',
    color: COLORS.text, textAlign: 'center',
  },
  scanningHint: {
    ...TYPE.caption, color: COLORS.muted, fontStyle: 'italic',
  },
});
