import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useRef, useEffect } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  interpolateColor,
} from 'react-native-reanimated';
import { Button } from '@/src/components/ui/Button';
import { COLORS, SPACING, RADIUS } from '@/src/constants/theme';

const FRAME_COUNT = 4;
const CAPTURE_INTERVAL_MS = 750;
const SWEEP_DURATION_MS = CAPTURE_INTERVAL_MS * FRAME_COUNT;

export default function CameraScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [capturing, setCapturing] = useState(false);
  const [framesDone, setFramesDone] = useState(0);

  // Animations
  const sweepY = useSharedValue(0);       // 0..1 vertical position inside frame guide
  const cornerPulse = useSharedValue(0);  // 0..1 pulsing corner brackets
  const shutterFlash = useSharedValue(0); // 0..1 white flash on each capture
  const overlayOpacity = useSharedValue(0);

  // Idle corner pulse (before capture starts)
  useEffect(() => {
    cornerPulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 900, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, []);

  // ALL hooks must be declared unconditionally BEFORE any early return,
  // otherwise React crashes with "Rendered more hooks than previous render".
  const sweepStyle = useAnimatedStyle(() => ({
    top: `${sweepY.value * 100}%`,
    opacity: overlayOpacity.value,
  }));

  const cornerStyle = useAnimatedStyle(() => ({
    opacity: 0.55 + cornerPulse.value * 0.45,
  }));

  const flashStyle = useAnimatedStyle(() => ({
    opacity: shutterFlash.value * 0.6,
  }));

  const overlayTintStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value * 0.25,
  }));

  if (!permission) {
    return <View style={styles.screen} />;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.permText}>Camera access is required to scan cigars</Text>
        <Button title="Grant Permission" onPress={requestPermission} style={{ marginTop: SPACING.md }} />
        <Button title="Go Back" variant="ghost" onPress={() => router.back()} style={{ marginTop: SPACING.sm }} />
      </View>
    );
  }

  const triggerFlash = () => {
    shutterFlash.value = withSequence(
      withTiming(1, { duration: 50 }),
      withTiming(0, { duration: 200 }),
    );
  };

  const captureFrame = async (): Promise<string | null> => {
    if (!cameraRef.current) return null;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.75,
        base64: false,
        shutterSound: false,
      });
      return photo?.uri ?? null;
    } catch {
      return null;
    }
  };

  const handleStartCapture = async () => {
    if (capturing) return;

    setCapturing(true);
    setFramesDone(0);

    // Haptic: strong "start" impact
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    // Fade in the scanning overlay
    overlayOpacity.value = withTiming(1, { duration: 180 });

    // Start the sweeping laser line — takes the full capture window
    sweepY.value = 0;
    sweepY.value = withTiming(1, { duration: SWEEP_DURATION_MS, easing: Easing.inOut(Easing.ease) });

    // Capture N frames at fixed intervals
    const uris: string[] = [];
    for (let i = 0; i < FRAME_COUNT; i++) {
      const uri = await captureFrame();
      if (uri) uris.push(uri);
      triggerFlash();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setFramesDone(i + 1);
      if (i < FRAME_COUNT - 1) {
        await new Promise((r) => setTimeout(r, CAPTURE_INTERVAL_MS));
      }
    }

    // Success haptic + dismiss
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Small pause so the user sees 4/4 dots filled
    await new Promise((r) => setTimeout(r, 250));

    if (uris.length === 0) {
      setCapturing(false);
      setFramesDone(0);
      overlayOpacity.value = withTiming(0, { duration: 150 });
      Alert.alert('Capture Error', 'Failed to capture photos. Please try again.');
      return;
    }

    // Navigate to result with all captured URIs
    router.replace({
      pathname: '/identify/result',
      params: { imageUris: JSON.stringify(uris) },
    });
  };

  return (
    <View style={styles.screen}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
      >
        {/* Vignette tint during capture */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.vignette, overlayTintStyle]} pointerEvents="none" />

        {/* Back button */}
        <Pressable
          onPress={() => router.back()}
          style={[styles.topBtn, { top: insets.top + 10, left: 16 }]}
          disabled={capturing}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </Pressable>

        {/* Flip camera */}
        <Pressable
          onPress={() => setFacing((f) => f === 'back' ? 'front' : 'back')}
          style={[styles.topBtn, { top: insets.top + 10, right: 16 }]}
          disabled={capturing}
        >
          <Ionicons name="camera-reverse-outline" size={24} color={COLORS.text} />
        </Pressable>

        {/* Frame guide with pulsing corners */}
        <View style={styles.frameGuide} pointerEvents="none">
          <Animated.View style={[styles.frameCornerTL, cornerStyle]} />
          <Animated.View style={[styles.frameCornerTR, cornerStyle]} />
          <Animated.View style={[styles.frameCornerBL, cornerStyle]} />
          <Animated.View style={[styles.frameCornerBR, cornerStyle]} />

          {/* Sweeping laser line — only visible during capture */}
          <Animated.View style={[styles.sweepLine, sweepStyle]} pointerEvents="none" />
        </View>

        {/* Hint / progress indicator */}
        {!capturing ? (
          <Text style={styles.hint}>Take a clear picture of the band</Text>
        ) : (
          <View style={styles.progressPill}>
            <Text style={styles.progressText}>Rotate slowly</Text>
            <View style={styles.progressDots}>
              {Array.from({ length: FRAME_COUNT }).map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    i < framesDone && styles.dotFilled,
                  ]}
                />
              ))}
            </View>
          </View>
        )}

        {/* Capture button */}
        <View style={[styles.captureRow, { bottom: insets.bottom + 30 }]}>
          <Pressable
            onPress={handleStartCapture}
            disabled={capturing}
            style={[styles.captureBtn, capturing && styles.captureBtnActive]}
          >
            {capturing ? (
              <Ionicons name="scan" size={32} color={COLORS.bg} />
            ) : (
              <View style={styles.captureInner} />
            )}
          </Pressable>
        </View>

        {/* White shutter flash overlay */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.shutterFlash, flashStyle]} pointerEvents="none" />
      </CameraView>
    </View>
  );
}

const CORNER = {
  width: 34,
  height: 34,
  borderColor: COLORS.accent,
  position: 'absolute' as const,
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  permText: {
    fontFamily: 'Cormorant',
    fontSize: 16,
    color: COLORS.text,
    textAlign: 'center',
  },
  camera: {
    flex: 1,
  },
  vignette: {
    backgroundColor: '#000',
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
    top: '25%',
    left: '12%',
    right: '12%',
    bottom: '35%',
    overflow: 'hidden',
  },
  frameCornerTL: { ...CORNER, top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  frameCornerTR: { ...CORNER, top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  frameCornerBL: { ...CORNER, bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  frameCornerBR: { ...CORNER, bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  sweepLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: COLORS.accent,
    shadowColor: COLORS.accent,
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  hint: {
    fontFamily: 'Cormorant',
    position: 'absolute',
    bottom: '38%',
    alignSelf: 'center',
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
  },
  progressPill: {
    position: 'absolute',
    bottom: '38%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderWidth: 1,
    borderColor: COLORS.accent,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: RADIUS.full,
  },
  progressText: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  progressDots: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.accent,
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: COLORS.accent,
  },
  captureRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  captureBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureBtnActive: {
    backgroundColor: COLORS.accent,
  },
  captureInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: COLORS.accent,
  },
  shutterFlash: {
    backgroundColor: '#FFFFFF',
  },
});
