// Concierge-first scanner.
//
// Live on-device OCR (MLKit via react-native-vision-camera-v3-text-recognition)
// was unreliable and required EAS rebuilds to keep working; we pivoted to an
// LLM-vision flow ("Cigar Concierge") that identifies a cigar from a single
// photo. This screen is a thin viewfinder + capture button that hands the
// photo to /identify/result for the AI round-trip.

import { View, Text, StyleSheet, Pressable, Linking, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Alert } from '@/src/components/ui/StyledAlert';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  useCameraDevice,
  useCameraFormat,
  useCameraPermission,
} from 'react-native-vision-camera';
import {
  GestureHandlerRootView,
  GestureDetector,
  Gesture,
} from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

// Framing-guide geometry (kept in one place so capture-time cropping stays in
// lockstep with the on-screen guide at `styles.frameGuide` below).
const GUIDE_TOP_PCT = 0.28;
const GUIDE_BOTTOM_PCT = 0.42; // from bottom
const GUIDE_SIDE_PCT = 0.10;

// Number of frames in a burst capture. Three is the sweet spot — enough to
// pick a sharp one if the user's hand twitched, not so many that we blow the
// 8-frame server cap or hold the shutter open for over a second.
const BURST_FRAMES = 3;
const BURST_SPACING_MS = 150;

// Below this size the captured frame is almost certainly garbage — a finger
// over the lens, a completely dark room, or an unrenderable stale buffer.
// Rejecting early keeps Sonnet from wasting tokens on noise.
const MIN_FRAME_BYTES = 60 * 1024;

// AsyncStorage flag that controls whether the tips overlay card is rendered.
// First successful scan sets it; after that the viewfinder is clean for
// returning users. Reset via `AsyncStorage.removeItem(TIPS_SEEN_KEY)`.
const TIPS_SEEN_KEY = 'scanner_tips_seen_v1';

export default function CameraScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<Camera>(null);

  const { hasPermission, requestPermission } = useCameraPermission();
  // Include ultra-wide + telephoto so iOS can auto-engage macro on iPhone 13
  // Pro and newer when the subject is very close. The OS picks the right
  // physical lens at capture time — we just opt into the virtual device.
  const device = useCameraDevice('back', {
    physicalDevices: ['ultra-wide-angle-camera', 'wide-angle-camera', 'telephoto-camera'],
  });

  const { width: winW, height: winH } = useWindowDimensions();

  // Explicitly pick the largest photo format available — default format
  // selection frequently lands on a lower-res format on multi-lens devices.
  // Also prefer a video-stabilization mode so macro/handheld shots are
  // steadier. `useCameraFormat` returns `undefined` when no match exists
  // (e.g. device not yet ready), which is fine — camera falls back to
  // default in that window.
  const format = useCameraFormat(device, [
    { photoResolution: 'max' },
    { videoStabilizationMode: 'cinematic-extended' },
    { videoStabilizationMode: 'cinematic' },
    { videoStabilizationMode: 'auto' },
  ]);

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

  // Load the tips-seen flag once per mount. If the user has ever completed a
  // successful scan we suppress the overlay so the viewfinder stays clean.
  // Failure to read AsyncStorage just falls back to showing the card.
  const [showTips, setShowTips] = useState(true);
  useEffect(() => {
    AsyncStorage.getItem(TIPS_SEEN_KEY)
      .then((v) => {
        if (v === '1') setShowTips(false);
      })
      .catch(() => {});
  }, []);

  // Pre-focus on the framing-guide center once the camera becomes active, so
  // the first Concierge tap captures a sharp photo instead of a cold one.
  // `isActive` guard prevents focus() firing before the camera device mounts,
  // which throws a noisy native exception on some devices.
  useEffect(() => {
    if (!isActive || !device) return;
    const t = setTimeout(() => {
      if (cameraRef.current) {
        handleFocus(winW / 2, winH * ((GUIDE_TOP_PCT + (1 - GUIDE_BOTTOM_PCT)) / 2));
      }
    }, 350);
    return () => clearTimeout(t);
  }, [isActive, device, handleFocus, winW, winH]);

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

  // Drive the corner-bracket pulse. Runs once per focus-lock so the user
  // gets a real signal (lens actually found focus) rather than wall-clock
  // theater. Kept in a shared value so the style is computed on the UI thread.
  const cornerPulse = useSharedValue(0);
  const cornerPulseStyle = useAnimatedStyle(() => ({
    opacity: 0.55 + cornerPulse.value * 0.45,
    transform: [{ scale: 1 + cornerPulse.value * 0.08 }],
  }));
  const pulseCorners = useCallback(() => {
    cornerPulse.value = withSequence(
      withTiming(1, { duration: 120, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 260, easing: Easing.out(Easing.quad) }),
    );
  }, [cornerPulse]);

  // Crop a captured photo down to just the framing-guide region. The LLM
  // sees far less background noise (table, hands, decor) and the payload
  // shrinks by ~60%. Returns { uri, bytes } so the caller can reject frames
  // that fell below the minimum-quality bar. On any failure returns the
  // original URI + 0 bytes so the caller can fall through to a heuristic.
  const cropToGuide = useCallback(
    async (sourceUri: string): Promise<{ uri: string; bytes: number }> => {
      try {
        // Probe the captured photo dimensions. Also doubles as a sanity
        // check that the file is readable before we attempt the crop.
        const probe = await ImageManipulator.manipulateAsync(sourceUri, [], {
          base64: false,
        });
        let { width: W, height: H } = probe;
        let sourceForCrop = probe.uri;
        // Orientation guard: some iOS formats (notably multi-cam builds)
        // return landscape pixel buffers even when the viewfinder is
        // portrait. Rotate 90° so the guide geometry below applies to the
        // same visual orientation the user framed against.
        if (W > H) {
          const rotated = await ImageManipulator.manipulateAsync(
            probe.uri,
            [{ rotate: 90 }],
            { base64: false },
          );
          sourceForCrop = rotated.uri;
          W = rotated.width;
          H = rotated.height;
        }
        const cropX = Math.round(W * GUIDE_SIDE_PCT);
        const cropY = Math.round(H * GUIDE_TOP_PCT);
        const cropW = Math.round(W * (1 - 2 * GUIDE_SIDE_PCT));
        const cropH = Math.round(H * (1 - GUIDE_TOP_PCT - GUIDE_BOTTOM_PCT));
        const result = await ImageManipulator.manipulateAsync(
          sourceForCrop,
          [{ crop: { originX: cropX, originY: cropY, width: cropW, height: cropH } }],
          { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG, base64: false },
        );
        // Get byte size so caller can discard obvious garbage frames.
        let bytes = 0;
        try {
          const info = await FileSystem.getInfoAsync(result.uri);
          // `size` is only populated on existing files; narrow via `exists`.
          bytes = info.exists && typeof info.size === 'number' ? info.size : 0;
        } catch {
          // Size-lookup failure is non-fatal — fall through with bytes=0 and
          // the caller will treat it as "unknown", not as garbage.
        }
        return { uri: result.uri, bytes };
      } catch {
        return { uri: sourceUri, bytes: 0 };
      }
    },
    [],
  );

  // Single focus+capture. Used 3x in the burst. Keeping it small so each call
  // is independently retriable — the outer loop tolerates a single failure.
  const captureOne = useCallback(async (): Promise<string | null> => {
    if (!cameraRef.current) return null;
    try {
      // Re-focus and auto-expose on the guide center immediately before each
      // shutter so each frame is individually locked-in. Cigar bands are
      // reflective and iOS's AE drifts between shots otherwise.
      const focusX = winW / 2;
      const focusY = winH * ((GUIDE_TOP_PCT + (1 - GUIDE_BOTTOM_PCT)) / 2);
      try {
        await cameraRef.current.focus({ x: focusX, y: focusY });
        // Real signal — lens actually locked. Pulse the corners once.
        pulseCorners();
      } catch {
        // Focus can reject mid-sequence on rapid calls — proceed anyway.
      }
      const photo = await cameraRef.current.takePhoto({
        // `auto` lets iOS fire the flash in low light without the user
        // having to remember to tap the torch. The manual torch toggle in
        // the UI still works and takes precedence when held on.
        flash: torchOn ? 'off' : 'auto',
        enableShutterSound: false,
      });
      return photo?.path ?? null;
    } catch {
      return null;
    }
  }, [winW, winH, torchOn, pulseCorners]);

  const handleConcierge = useCallback(async () => {
    if (capturing) return;
    setCapturing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    track(EVENTS.SCAN_CONCIERGE_TAPPED, { source: 'primary' });
    track(EVENTS.SCAN_CAPTURE_BURST_STARTED, { target_frames: BURST_FRAMES });

    // Burst capture — 3 frames spaced ~150ms apart. The server-side prompt
    // reconstructs the full band wrap-around from multiple angles, so more
    // frames = better reading. Frames that fail are silently skipped.
    const rawPaths: string[] = [];
    for (let i = 0; i < BURST_FRAMES; i++) {
      const path = await captureOne();
      if (path) rawPaths.push(path);
      if (i < BURST_FRAMES - 1) {
        // Subtle haptic per subsequent frame gives the user a "burst" feel.
        Haptics.selectionAsync();
        await new Promise((r) => setTimeout(r, BURST_SPACING_MS));
      }
    }

    // Heavy end-of-burst haptic — the user *feels* the shutter closed.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    if (rawPaths.length === 0) {
      setCapturing(false);
      track(EVENTS.SCAN_CAPTURE_FAILED, { reason: 'all_frames_failed' });
      track(EVENTS.SCAN_CAPTURE_BURST_COMPLETED, { frames: 0, rejected: 0 });
      Alert.alert('Capture Error', 'Failed to capture photo. Please try again.');
      return;
    }

    // Crop each frame to the guide region. Parallel since the crops are
    // independent and expo-image-manipulator runs off-main-thread.
    const cropped = await Promise.all(
      rawPaths.map((p) => cropToGuide(normalizeFileUri(p))),
    );

    // Reject obvious-garbage frames. Keep at least one so we don't starve
    // the server; if every frame falls below the size floor, surface a
    // specific error to the user instead of sending noise.
    const qualified = cropped.filter((c) => c.bytes === 0 || c.bytes >= MIN_FRAME_BYTES);
    const rejected = cropped.length - qualified.length;
    if (rejected > 0) {
      track(EVENTS.SCAN_FRAME_TOO_SMALL_REJECTED, { count: rejected });
    }

    if (qualified.length === 0) {
      setCapturing(false);
      track(EVENTS.SCAN_CAPTURE_FAILED, { reason: 'all_frames_too_small' });
      track(EVENTS.SCAN_CAPTURE_BURST_COMPLETED, {
        frames: 0,
        rejected,
      });
      Alert.alert(
        'Too dark to read',
        'The camera couldn\'t make out the band. Try again with more light, or tap the flash.',
      );
      return;
    }

    track(EVENTS.SCAN_CAPTURE_BURST_COMPLETED, {
      frames: qualified.length,
      rejected,
    });

    // Remember the user completed a successful capture so we can dismiss the
    // tips card on the *next* mount. Non-blocking — a storage failure never
    // costs the scan.
    AsyncStorage.setItem(TIPS_SEEN_KEY, '1').catch(() => {});

    router.replace({
      pathname: '/identify/result',
      params: { imageUris: JSON.stringify(qualified.map((q) => q.uri)) },
    });
    // Don't reset capturing — we're navigating away.
  }, [capturing, router, captureOne, cropToGuide]);

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
        // Keep the user's original fidelity — we'll downscale below so we
        // don't ship a 12 MP photo through the LLM. Pre-ImagePicker
        // compression loses detail we can't get back; we want the raw.
        quality: 1,
        selectionLimit: 1,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;

      // Gallery-imported photos aren't framed against our on-screen guide,
      // so we can't crop them the way we crop burst captures. Instead,
      // downscale to a sane maximum (1200px on the longest side) so the
      // token cost of a gallery scan is roughly comparable to a camera
      // scan. For a 4000×3000 iPhone photo that's a ~6× payload reduction
      // while still preserving enough detail for the model to read a band.
      let finalUri = result.assets[0].uri;
      try {
        const resized = await ImageManipulator.manipulateAsync(
          finalUri,
          [{ resize: { width: 1200 } }],
          { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG, base64: false },
        );
        finalUri = resized.uri;
      } catch {
        // Resize failure is non-fatal — fall through with the original.
        // Costs more tokens but still gives the user a scan attempt.
      }

      router.replace({
        pathname: '/identify/result',
        params: { imageUris: JSON.stringify([finalUri]) },
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
          Upgrade to Pro for unlimited identifications, wishlists, and your full collection journal.
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
            format={format}
            isActive={isActive}
            photo={true}
            torch={torchOn ? 'on' : 'off'}
            zoom={zoom}
            // Enable hardware-based stabilization when the chosen format
            // supports it — noticeably sharper handheld frames without
            // needing accelerometer-gated capture.
            videoStabilizationMode="auto"
            // Prefer sharpness over capture latency — cigar-band text is the
            // subject; an extra ~200ms per shot is a fine trade.
            photoQualityBalance="quality"
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

          {/* Framing guide — corners pulse once per real focus-lock as a
              premium "got it" signal. Pulse is wall-clock-quick (~380ms total)
              so it never reads as waiting. */}
          <View style={styles.frameGuide} pointerEvents="none">
            <Animated.View style={[styles.frameCornerTL, cornerPulseStyle]} />
            <Animated.View style={[styles.frameCornerTR, cornerPulseStyle]} />
            <Animated.View style={[styles.frameCornerBL, cornerPulseStyle]} />
            <Animated.View style={[styles.frameCornerBR, cornerPulseStyle]} />
          </View>

          {/* Instructions card — shown only until the user completes their
              first successful scan, then suppressed on subsequent visits for
              a clean viewfinder. Premium through restraint. */}
          {showTips && (
            <View style={styles.tipsCard} pointerEvents="none">
              <Text style={styles.tipsTitle}>For the best match</Text>
              <Text style={styles.tip}>• Fill the frame with the band</Text>
              <Text style={styles.tip}>• Use even, bright light — avoid glare</Text>
              <Text style={styles.tip}>• Hold steady, keep text in focus</Text>
              <Text style={styles.tipHint}>
                Tap Cigar Concierge when you're ready — AI handles the rest.
              </Text>
            </View>
          )}

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
