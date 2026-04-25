// Concierge-first scanner.
//
// Live on-device OCR (MLKit via react-native-vision-camera-v3-text-recognition)
// was unreliable and required EAS rebuilds to keep working; we pivoted to an
// LLM-vision flow ("Cigar Concierge") that identifies a cigar from a single
// photo. This screen is a thin viewfinder + capture button that hands the
// photo to /identify/result for the AI round-trip.

import { View, Text, StyleSheet, Pressable, Linking, ActivityIndicator } from 'react-native';
import { Alert } from '@/src/components/ui/StyledAlert';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';
import {
  GestureHandlerRootView,
  GestureDetector,
  Gesture,
} from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/src/components/ui/Button';
import { COLORS, SPACING, RADIUS } from '@/src/constants/theme';
import { useScanCount } from '@/src/hooks/useScanCount';
import { track } from '@/src/lib/observability/analytics';
import { EVENTS } from '@/src/lib/observability/events';

function normalizeFileUri(path: string): string {
  if (!path) return '';
  if (path.startsWith('file://')) return path;
  return `file://${path.startsWith('/') ? '' : '/'}${path}`;
}

export default function CameraScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<Camera>(null);

  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');

  const scans = useScanCount();

  // SCAN_STARTED fires once per camera-open session.
  useEffect(() => {
    track(EVENTS.SCAN_STARTED, { source: 'camera_tab' });
  }, []);

  const [isActive, setIsActive] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setIsActive(true);
      return () => setIsActive(false);
    }, [])
  );

  const [torchOn, setTorchOn] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [capturing, setCapturing] = useState(false);
  const zoomStartRef = useRef(1);

  const handlePermission = useCallback(async () => {
    const granted = await requestPermission();
    if (!granted) {
      Alert.alert(
        'Camera access needed',
        'Enable camera access in Settings to scan cigars.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]
      );
    }
  }, [requestPermission]);

  const handleFocus = useCallback(async (x: number, y: number) => {
    if (!cameraRef.current) return;
    try {
      await cameraRef.current.focus({ x, y });
    } catch {
      // Rapid re-focus throws on some devices — next frame handles it.
    }
  }, []);

  const tapGesture = useMemo(
    () =>
      Gesture.Tap().onEnd((e) => {
        runOnJS(handleFocus)(e.x, e.y);
      }),
    [handleFocus]
  );

  const snapshotZoomStart = useCallback(() => {
    zoomStartRef.current = zoom;
  }, [zoom]);

  const pinchGesture = useMemo(() => {
    const minZoom = device?.minZoom ?? 1;
    const maxZoom = Math.min(device?.maxZoom ?? 10, 10);
    return Gesture.Pinch()
      .onStart(() => {
        runOnJS(snapshotZoomStart)();
      })
      .onUpdate((e) => {
        const next = Math.max(minZoom, Math.min(maxZoom, zoomStartRef.current * e.scale));
        runOnJS(setZoom)(next);
      });
  }, [device?.minZoom, device?.maxZoom, snapshotZoomStart]);

  const composedGesture = useMemo(
    () => Gesture.Simultaneous(pinchGesture, tapGesture),
    [pinchGesture, tapGesture]
  );

  // VisionCamera 4: takeSnapshot is Android-only. Use takePhoto on both
  // platforms — it writes a full-quality JPEG to a temp path we can re-read.
  const takeSnapshotFile = useCallback(async (): Promise<string | null> => {
    if (!cameraRef.current) return null;
    try {
      const photo = await cameraRef.current.takePhoto({
        flash: 'off',
        enableShutterSound: false,
      });
      return photo?.path ?? null;
    } catch {
      return null;
    }
  }, []);

  const handleConcierge = useCallback(async () => {
    if (capturing) return;
    setCapturing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    track(EVENTS.SCAN_CONCIERGE_TAPPED, { source: 'primary' });
    const path = await takeSnapshotFile();
    if (!path) {
      setCapturing(false);
      Alert.alert('Capture Error', 'Failed to capture photo. Please try again.');
      return;
    }
    const uri = normalizeFileUri(path);
    router.replace({
      pathname: '/identify/result',
      params: { imageUris: JSON.stringify([uri]) },
    });
    // Don't reset capturing — we're navigating away. If navigation fails,
    // the user can re-tap; focus/camera reset on next mount.
  }, [capturing, router, takeSnapshotFile]);

  const handleGalleryPick = useCallback(async () => {
    Haptics.selectionAsync();
    track(EVENTS.SCAN_GALLERY_TAPPED);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Photo library access needed',
          'Enable photos access in Settings to pick a cigar photo from your library.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.85,
        selectionLimit: 1,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      router.replace({
        pathname: '/identify/result',
        params: { imageUris: JSON.stringify([result.assets[0].uri]) },
      });
    } catch (e: any) {
      Alert.alert('Picker error', e?.message ?? 'Could not open the photo library.');
    }
  }, [router]);

  // Emit SCAN_LIMIT_REACHED once per gate hit, not on every render.
  const limitFiredRef = useRef(false);
  useEffect(() => {
    if (scans.limitReached || scans.guestLimitReached) {
      if (!limitFiredRef.current) {
        limitFiredRef.current = true;
        track(EVENTS.SCAN_LIMIT_REACHED, {
          limit: scans.limit,
          guest: scans.guestLimitReached,
        });
      }
    } else {
      limitFiredRef.current = false;
    }
  }, [scans.limitReached, scans.guestLimitReached, scans.limit]);

  // Scan-limit gates — hard gate before the camera opens.
  if (scans.limitReached) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <Ionicons name="lock-closed-outline" size={48} color={COLORS.muted} style={{ marginBottom: SPACING.md }} />
        <Text style={styles.permTitle}>You've used your {scans.limit} free scans</Text>
        <Text style={styles.permText}>
          Upgrade to Pro for unlimited identifications, wishlists, and smoking history.
        </Text>
        <Button title="Go Pro" onPress={() => router.replace('/paywall')} style={{ marginTop: SPACING.md }} />
        <Button title="Go Back" variant="ghost" onPress={() => router.back()} style={{ marginTop: SPACING.sm }} />
      </View>
    );
  }

  if (scans.guestLimitReached) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <Ionicons name="person-add-outline" size={48} color={COLORS.accent} style={{ marginBottom: SPACING.md }} />
        <Text style={styles.permTitle}>Sign in for 5 more scans</Text>
        <Text style={styles.permText}>
          Guests get {scans.limit} free scans. Sign in to unlock 5 more — your scans so far will stick with you.
        </Text>
        <Button title="Sign In" onPress={() => router.replace('/auth/login')} style={{ marginTop: SPACING.md }} />
        <Button title="Go Back" variant="ghost" onPress={() => router.back()} style={{ marginTop: SPACING.sm }} />
      </View>
    );
  }

  if (!hasPermission) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <Ionicons name="camera-outline" size={48} color={COLORS.muted} style={{ marginBottom: SPACING.md }} />
        <Text style={styles.permTitle}>Camera access needed</Text>
        <Text style={styles.permText}>Stick Picks uses the camera to identify cigars.</Text>
        <Button title="Grant Permission" onPress={handlePermission} style={{ marginTop: SPACING.md }} />
        <Button title="Go Back" variant="ghost" onPress={() => router.back()} style={{ marginTop: SPACING.sm }} />
      </View>
    );
  }

  if (!device) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={COLORS.accent} />
        <Text style={[styles.permText, { marginTop: SPACING.md }]}>Preparing camera…</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.screen}>
      <GestureDetector gesture={composedGesture}>
        <View style={styles.screen}>
          <Camera
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={isActive}
            photo={true}
            torch={torchOn ? 'on' : 'off'}
            zoom={zoom}
          />

          {/* Back */}
          <Pressable
            onPress={() => router.back()}
            style={[styles.topBtn, { top: insets.top + 10, left: 16 }]}
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </Pressable>

          {/* Torch */}
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              setTorchOn((v) => !v);
            }}
            style={[styles.topBtn, { top: insets.top + 10, right: 68 }]}
            hitSlop={8}
          >
            <Ionicons
              name={torchOn ? 'flash' : 'flash-off-outline'}
              size={22}
              color={torchOn ? COLORS.accent : COLORS.text}
            />
          </Pressable>

          {/* Gallery — send an existing photo to Concierge */}
          <Pressable
            onPress={handleGalleryPick}
            style={[styles.topBtn, { top: insets.top + 10, right: 16 }]}
            hitSlop={8}
          >
            <Ionicons name="images-outline" size={22} color={COLORS.text} />
          </Pressable>

          {/* Framing guide */}
          <View style={styles.frameGuide} pointerEvents="none">
            <View style={styles.frameCornerTL} />
            <View style={styles.frameCornerTR} />
            <View style={styles.frameCornerBL} />
            <View style={styles.frameCornerBR} />
          </View>

          {/* Instructions card above the action bar. Kept concise — the bulleted
              tips are what actually improves AI identification rates. */}
          <View style={styles.tipsCard} pointerEvents="none">
            <Text style={styles.tipsTitle}>For the best match</Text>
            <Text style={styles.tip}>• Fill the frame with the band</Text>
            <Text style={styles.tip}>• Use even, bright light — avoid glare</Text>
            <Text style={styles.tip}>• Hold steady, keep text in focus</Text>
            <Text style={styles.tipHint}>
              Tap Cigar Concierge when you're ready — AI handles the rest.
            </Text>
          </View>

          {/* Primary action */}
          <View style={[styles.actionBar, { paddingBottom: insets.bottom + 24 }]}>
            <Pressable
              onPress={handleConcierge}
              disabled={capturing}
              style={[styles.conciergeBtn, capturing && { opacity: 0.6 }]}
            >
              {capturing ? (
                <ActivityIndicator color={COLORS.bg} />
              ) : (
                <>
                  <Ionicons name="sparkles" size={20} color={COLORS.bg} />
                  <Text style={styles.conciergeText}>Cigar Concierge</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    backgroundColor: COLORS.bg,
  },
  permTitle: {
    fontFamily: 'Cormorant',
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
  permText: {
    fontFamily: 'Cormorant',
    fontSize: 15,
    color: COLORS.muted,
    textAlign: 'center',
  },
  topBtn: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  frameGuide: {
    position: 'absolute',
    top: '28%',
    left: '10%',
    right: '10%',
    bottom: '42%',
  },
  frameCornerTL: {
    position: 'absolute', top: 0, left: 0,
    width: 34, height: 34,
    borderTopWidth: 3, borderLeftWidth: 3,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  frameCornerTR: {
    position: 'absolute', top: 0, right: 0,
    width: 34, height: 34,
    borderTopWidth: 3, borderRightWidth: 3,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  frameCornerBL: {
    position: 'absolute', bottom: 0, left: 0,
    width: 34, height: 34,
    borderBottomWidth: 3, borderLeftWidth: 3,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  frameCornerBR: {
    position: 'absolute', bottom: 0, right: 0,
    width: 34, height: 34,
    borderBottomWidth: 3, borderRightWidth: 3,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  tipsCard: {
    position: 'absolute',
    left: SPACING.md,
    right: SPACING.md,
    bottom: 140,
    backgroundColor: 'rgba(0,0,0,0.68)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  tipsTitle: {
    fontFamily: 'Cormorant',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: COLORS.accent,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  tip: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    color: '#F5F1E8',
    lineHeight: 20,
  },
  tipHint: {
    fontFamily: 'Cormorant',
    fontSize: 12,
    fontStyle: 'italic',
    color: 'rgba(245,241,232,0.7)',
    marginTop: 6,
  },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  conciergeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.accent,
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: RADIUS.full,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    minWidth: 240,
    justifyContent: 'center',
  },
  conciergeText: {
    fontFamily: 'Cormorant',
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.bg,
    letterSpacing: 0.3,
  },
});
