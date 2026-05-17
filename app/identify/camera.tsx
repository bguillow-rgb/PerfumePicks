/**
 * Perfume Concierge — Camera screen with live viewfinder.
 *
 * Mirrors Pour Picks flow:
 *   - Live camera viewfinder fills the screen (dark bg)
 *   - Tips overlaid on the viewfinder in a semi-transparent card
 *   - "Perfume Concierge" capture button at bottom
 *   - Gallery picker icon in top-right
 *   - Back button top-left
 *   - After capture → shimmer loading → always route to confirm-personal
 */

import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

type ScreenState = 'viewfinder' | 'scanning' | 'permission_needed';

export default function CameraScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isPro = useProStore((s) => s.isPro);
  const { remaining, limitReached, guestLimitReached, isAnonymous } =
    useScanCount();
  const [permission, requestPermission] = useCameraPermissions();

  const cameraRef = useRef<CameraView>(null);
  const [state, setState] = useState<ScreenState>('viewfinder');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0]);
  const [capturing, setCapturing] = useState(false);

  // Request permission on mount
  useEffect(() => {
    if (!permission) return;
    if (!permission.granted && !permission.canAskAgain) {
      setState('permission_needed');
    }
    if (!permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission]);

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

  const handleCapture = async () => {
    if (capturing) return;
    if (!checkQuota()) return;

    setCapturing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    try {
      const photo = await cameraRef.current?.takePictureAsync({
        quality: 0.85,
        skipProcessing: false,
      });

      if (!photo?.uri) {
        setCapturing(false);
        return;
      }

      await processAndIdentify(photo.uri);
    } catch (e) {
      console.warn('[camera] capture error:', e);
      Alert.alert('Error', 'Could not capture photo. Please try again.');
      setCapturing(false);
    }
  };

  const handleGallery = async () => {
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
      <View style={styles.darkContainer}>
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <View style={{ width: 40 }} />
          <Text style={styles.topBarTitle}>PERFUME CONCIERGE</Text>
          <View style={{ width: 40 }} />
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
      </View>
    );
  }

  // ── Permission needed: can't ask again ──
  if (state === 'permission_needed' || (permission && !permission.granted && !permission.canAskAgain)) {
    return (
      <View style={styles.darkContainer}>
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </Pressable>
          <Text style={styles.topBarTitle}>PERFUME CONCIERGE</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.center}>
          <Ionicons name="camera-outline" size={56} color="rgba(255,255,255,0.5)" />
          <Text style={styles.permTitle}>Camera access needed</Text>
          <Text style={styles.permSub}>
            Open Settings and allow camera access to scan bottles.
          </Text>
          <Pressable
            style={styles.permBtn}
            onPress={() => Linking.openSettings()}
          >
            <Text style={styles.permBtnText}>Open Settings</Text>
          </Pressable>
          <Pressable style={styles.permBackBtn} onPress={() => router.back()}>
            <Text style={styles.permBackText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Permission loading ──
  if (!permission?.granted) {
    return (
      <View style={styles.darkContainer}>
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.accent} size="large" />
        </View>
      </View>
    );
  }

  // ── Live viewfinder with overlaid tips ──
  return (
    <View style={styles.darkContainer}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
      />

      {/* Top bar: back + gallery */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.topBarBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable onPress={handleGallery} hitSlop={12} style={styles.topBarBtn}>
          <Ionicons name="images-outline" size={20} color="#fff" />
        </Pressable>
      </View>

      {/* Bottom overlay: tips card + capture button */}
      <View style={[styles.bottomOverlay, { paddingBottom: insets.bottom + 16 }]}>
        {/* Tips card */}
        <View style={styles.tipsCard}>
          <Text style={styles.tipsHeading}>FOR THE BEST MATCH</Text>
          <Text style={styles.tipLine}>• Fill the frame with the front label</Text>
          <Text style={styles.tipLine}>• Use even, bright light — avoid glare</Text>
          <Text style={styles.tipLine}>• Hold steady, keep text in focus</Text>
          <Text style={styles.tipsHint}>
            Tap Perfume Concierge when you're ready — AI handles the rest.
          </Text>
        </View>

        {/* Scan quota */}
        {!isPro && remaining !== null && (
          <Text style={styles.quota}>
            {remaining} scan{remaining === 1 ? '' : 's'} remaining
            {isAnonymous ? ' · Sign in for more' : ''}
          </Text>
        )}

        {/* Capture button */}
        <Pressable
          style={[styles.captureBtn, capturing && { opacity: 0.6 }]}
          onPress={handleCapture}
          disabled={capturing}
        >
          {capturing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="sparkles" size={16} color="#fff" />
              <Text style={styles.captureBtnText}>Perfume Concierge</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
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
  darkContainer: {
    flex: 1,
    backgroundColor: '#000',
  },

  // Top bar
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  topBarTitle: {
    fontFamily: FONTS.body,
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.accent,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  topBarBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Bottom overlay
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: 16,
    gap: 10,
  },
  tipsCard: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: 'rgba(184,146,75,0.4)',
    padding: 14,
  },
  tipsHeading: {
    fontFamily: FONTS.body,
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.accent,
    letterSpacing: 2.5,
    marginBottom: 8,
  },
  tipLine: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 20,
    marginBottom: 2,
  },
  tipsHint: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    fontStyle: 'italic',
    marginTop: 6,
  },
  quota: {
    fontFamily: FONTS.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
  captureBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.full,
    paddingVertical: 16,
    minWidth: 240,
    alignSelf: 'center',
  },
  captureBtnText: {
    fontFamily: FONTS.body,
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 1,
  },

  // Center content (scanning + permission)
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
    gap: SPACING.md,
  },
  scanningTitle: {
    fontFamily: FONTS.serif,
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  scanningHint: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    fontStyle: 'italic',
  },
  shimmerWrap: {
    width: 220,
    height: 280,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    marginBottom: SPACING.lg,
  },
  scanImage: { width: '100%', height: '100%' },
  shimmerClip: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  shimmerBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: COLORS.accent,
    opacity: 0.6,
    borderRadius: 3,
  },

  // Permission screen
  permTitle: {
    fontFamily: FONTS.serif,
    fontSize: 22,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  permSub: {
    fontFamily: FONTS.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    paddingHorizontal: SPACING.lg,
  },
  permBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.full,
    paddingVertical: 14,
    paddingHorizontal: 40,
    marginTop: SPACING.md,
  },
  permBtnText: {
    fontFamily: FONTS.body,
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },
  permBackBtn: {
    paddingVertical: SPACING.sm,
  },
  permBackText: {
    fontFamily: FONTS.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
  },
});
