// Live band scanner — VisionCamera + MLKit text recognition frame processor.
// Runs OCR on every frame, matches text against the preloaded cigar corpus,
// and lets the user confirm as soon as the match is stable. No shutter,
// no multi-frame capture ceremony.
//
// Fallback path: when OCR can't lock a match within FALLBACK_PROMPT_MS, we
// reveal the "Ask AI" button which routes to the existing identifyService
// flow. Manual search remains available from the result screen after that.

import { View, Text, StyleSheet, Pressable, Linking, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameProcessor,
  runAtTargetFps,
} from 'react-native-vision-camera';
import {
  GestureHandlerRootView,
  GestureDetector,
  Gesture,
} from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useTextRecognition } from 'react-native-vision-camera-v3-text-recognition';
import { useRunOnJS } from 'react-native-worklets-core';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/src/components/ui/Button';
import { COLORS, SPACING, RADIUS } from '@/src/constants/theme';
import { supabase } from '@/lib/supabase';
import { useCigarCorpus } from '@/src/stores/useCigarCorpus';
import { match, consensus, type MatchCandidate } from '@/src/features/identify/bandMatcher';
import { useScanCount } from '@/src/hooks/useScanCount';
import { getDeviceId } from '@/lib/deviceId';
import { track } from '@/src/lib/observability/analytics';
import { EVENTS } from '@/src/lib/observability/events';

// How often we push OCR data from the frame-processor worklet back to React.
const UPDATE_THROTTLE_MS = 200;
// Size of the sliding observation window used for consensus matching.
const WINDOW_SIZE = 6;
// A candidate has to appear in at least this many frames of the window to lock.
const MIN_CONSENSUS_FRAMES = 3;
// Minimum normalized consensus score before we consider the match "confident".
// Lowered from 0.35 — short-token brands (Oliva, Padron) and partial band
// readings score lower than initially assumed.
const CONFIDENT_SCORE = 0.22;
// How long with text visible but no lock before the Concierge button appears.
const FALLBACK_PROMPT_MS = 4500;
// How long on the camera with NO text ever detected before Concierge is offered
// anyway. Covers text-less / decorative-only bands.
const NO_TEXT_FALLBACK_MS = 9000;
// Debounce caption updates so it doesn't thrash between candidates.
const CAPTION_DEBOUNCE_MS = 400;

type OcrBlock = {
  text: string;
  // Raw bbox in frame (sensor) coords.
  bbox: { top: number; left: number; right: number; bottom: number };
};

type FrameDims = { width: number; height: number };

function normalizeFileUri(path: string): string {
  if (!path) return '';
  if (path.startsWith('file://')) return path;
  return `file://${path.startsWith('/') ? '' : '/'}${path}`;
}

function extractBlocks(data: unknown): OcrBlock[] {
  if (!data || typeof data !== 'object') return [];
  const out: OcrBlock[] = [];
  for (const key of Object.keys(data as Record<string, unknown>)) {
    const v = (data as Record<string, any>)[key];
    if (!v || typeof v !== 'object') continue;
    const text = typeof v.blockText === 'string' ? v.blockText : '';
    if (!text) continue;
    out.push({
      text,
      bbox: {
        top: Number(v.blockFrameTop ?? 0),
        left: Number(v.blockFrameLeft ?? 0),
        right: Number(v.blockFrameRight ?? 0),
        bottom: Number(v.blockFrameBottom ?? 0),
      },
    });
  }
  return out;
}

// Transform an MLKit sensor-coord bbox into normalized [0..1] portrait screen
// coords (x=left, y=top, w, h). Assumes iOS back camera held portrait —
// the sensor frame is landscape-oriented, so we rotate 90° CCW.
// Imperfect on all device/orientation combos; sufficient for a coaching overlay.
function toScreenRect(
  bbox: OcrBlock['bbox'],
  frame: FrameDims
): { x: number; y: number; w: number; h: number } | null {
  if (!frame.width || !frame.height) return null;
  // In landscape frame: long side = width, short side = height.
  // Rotate 90° CCW: (x_frame, y_frame) → (y_frame, frameWidth - x_frame)
  // New axes after rotation: x' ∈ [0..frame.height], y' ∈ [0..frame.width]
  const x1 = bbox.top / frame.height;
  const x2 = bbox.bottom / frame.height;
  const y1 = (frame.width - bbox.right) / frame.width;
  const y2 = (frame.width - bbox.left) / frame.width;
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const w = Math.abs(x2 - x1);
  const h = Math.abs(y2 - y1);
  if (w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

type ScannerStatus =
  | 'aiming'           // camera up, no text yet
  | 'reading'          // text visible but no corpus match
  | 'locking'          // unstable candidates
  | 'confident'        // locked
  | 'dead-end';        // long timeout, offer AI

export default function CameraScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<Camera>(null);

  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');

  const corpusIndex = useCigarCorpus((s) => s.index);
  const corpusLoading = useCigarCorpus((s) => s.loading);
  const corpusError = useCigarCorpus((s) => s.error);
  const loadCorpus = useCigarCorpus((s) => s.load);

  const scans = useScanCount();

  // SCAN_STARTED fires once per camera-open session.
  useEffect(() => {
    track(EVENTS.SCAN_STARTED, { source: 'camera_tab' });
  }, []);

  // Lazy load the corpus on focus.
  useFocusEffect(
    useCallback(() => {
      loadCorpus();
    }, [loadCorpus])
  );

  const [isActive, setIsActive] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setIsActive(true);
      return () => setIsActive(false);
    }, [])
  );

  const [torchOn, setTorchOn] = useState(false);
  const [zoom, setZoom] = useState(1);
  const zoomStartRef = useRef(1);

  // Rolling OCR observation window for consensus matching.
  const windowRef = useRef<string[][]>([]);
  const matchHistoryRef = useRef<MatchCandidate[][]>([]);
  const [overlayRect, setOverlayRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [status, setStatus] = useState<ScannerStatus>('aiming');
  const [consensusMatch, setConsensusMatch] = useState<MatchCandidate | null>(null);
  const [latestOcrText, setLatestOcrText] = useState<string>('');
  const [showFallback, setShowFallback] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const confirmLockRef = useRef(false);
  const lastPushRef = useRef(0);
  const firstTextAtRef = useRef<number | null>(null);
  const mountedAtRef = useRef<number>(Date.now());
  const lastCaptionChangeRef = useRef<number>(0);

  const { scanText } = useTextRecognition({ language: 'latin' });

  const pushFromWorklet = useRunOnJS(
    (data: unknown, frameWidth: number, frameHeight: number) => {
      const now = Date.now();
      if (now - lastPushRef.current < UPDATE_THROTTLE_MS) return;
      lastPushRef.current = now;

      const blocks = extractBlocks(data);
      if (blocks.length === 0) {
        windowRef.current.push([]);
        matchHistoryRef.current.push([]);
      } else {
        const texts = blocks.map((b) => b.text);
        windowRef.current.push(texts);
        const frameMatches = corpusIndex.length > 0 ? match(texts, corpusIndex) : [];
        matchHistoryRef.current.push(frameMatches);
        // Show user what OCR actually read — helps diagnose when text is being
        // detected but no catalog match is landing.
        setLatestOcrText(texts.join(' · ').slice(0, 80));
      }
      if (windowRef.current.length > WINDOW_SIZE) windowRef.current.shift();
      if (matchHistoryRef.current.length > WINDOW_SIZE) matchHistoryRef.current.shift();

      if (blocks.length > 0 && firstTextAtRef.current == null) {
        firstTextAtRef.current = now;
      }

      const best = consensus(matchHistoryRef.current, MIN_CONSENSUS_FRAMES);
      setConsensusMatch(best);

      // Overlay: pick the widest block that's near the vertical middle of the
      // frame — that's almost always the band. Stray text at the edges (other
      // cigars, packaging) gets de-prioritized.
      if (blocks.length > 0) {
        // In landscape frame coords, vertical middle of the band = frameHeight/2.
        // Penalize blocks whose center is far from that.
        const frameCenterY = frameHeight / 2;
        const scored = blocks.map((b) => {
          const width = b.bbox.right - b.bbox.left;
          const centerY = (b.bbox.top + b.bbox.bottom) / 2;
          const distanceFromCenter = Math.abs(centerY - frameCenterY) / Math.max(1, frameCenterY);
          return { block: b, score: width * (1 - Math.min(distanceFromCenter, 0.9)) };
        });
        scored.sort((a, b) => b.score - a.score);
        const winner = scored[0].block;
        const rect = toScreenRect(winner.bbox, { width: frameWidth, height: frameHeight });
        setOverlayRect(rect);
      } else {
        setOverlayRect(null);
      }

      // Update status machine.
      if (best && best.score >= CONFIDENT_SCORE) {
        setStatus('confident');
        return;
      }
      if (best) {
        setStatus('locking');
        return;
      }
      if (blocks.length > 0) {
        setStatus('reading');
        return;
      }
      setStatus('aiming');
    },
    [corpusIndex]
  );

  const frameProcessor = useFrameProcessor(
    (frame) => {
      'worklet';
      // Throttle MLKit at the worklet level to ~5 Hz. The 30 FPS default burned
      // battery/thermal with no accuracy gain since we rate-limit JS updates anyway.
      runAtTargetFps(5, () => {
        'worklet';
        const data = scanText(frame);
        pushFromWorklet(data, frame.width, frame.height);
      });
    },
    [scanText, pushFromWorklet]
  );

  // Haptic tick + telemetry when we first go confident.
  const wasConfidentRef = useRef(false);
  useEffect(() => {
    const isConfident = status === 'confident';
    if (isConfident && !wasConfidentRef.current && consensusMatch) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      track(EVENTS.SCAN_RESULT_RECEIVED, {
        method: 'ocr',
        cigar_id: consensusMatch.cigar.id,
        score: Number(consensusMatch.score.toFixed(3)),
      });
    }
    wasConfidentRef.current = isConfident;
  }, [status, consensusMatch]);

  // SCAN_CONCIERGE_OFFERED fires the first time we reveal the fallback.
  const conciergeOfferedRef = useRef(false);
  useEffect(() => {
    if (showFallback && !conciergeOfferedRef.current) {
      conciergeOfferedRef.current = true;
      track(EVENTS.SCAN_CONCIERGE_OFFERED, {
        had_text: firstTextAtRef.current !== null,
      });
      Haptics.selectionAsync();
    }
  }, [showFallback]);

  // Reveal the Concierge fallback after either:
  //   - FALLBACK_PROMPT_MS of reading text but not locking, OR
  //   - NO_TEXT_FALLBACK_MS since mount with no text ever detected
  // (decorative-only bands with no readable text still get an escape hatch).
  useEffect(() => {
    if (showFallback) return;
    if (status === 'confident') return;

    const noTextDeadline = mountedAtRef.current + NO_TEXT_FALLBACK_MS;
    const textDeadline =
      firstTextAtRef.current !== null
        ? firstTextAtRef.current + FALLBACK_PROMPT_MS
        : Infinity;
    const deadline = Math.min(noTextDeadline, textDeadline);
    const wait = Math.max(0, deadline - Date.now());
    const t = setTimeout(() => setShowFallback(true), wait);
    return () => clearTimeout(t);
  }, [status, showFallback]);

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
      // Some devices throw on rapid re-focus — safe to ignore, next frame will focus anyway.
    }
  }, []);

  const tapGesture = useMemo(
    () =>
      Gesture.Tap()
        .onEnd((e) => {
          runOnJS(handleFocus)(e.x, e.y);
        }),
    [handleFocus]
  );

  const snapshotZoomStart = useCallback(() => {
    zoomStartRef.current = zoom;
  }, [zoom]);

  const pinchGesture = useMemo(() => {
    const minZoom = device?.minZoom ?? 1;
    const maxZoom = Math.min(device?.maxZoom ?? 10, 10); // cap at 10x — anything higher is useless for bands
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

  const takeSnapshotFile = useCallback(async (): Promise<string | null> => {
    if (!cameraRef.current) return null;
    try {
      const photo = await cameraRef.current.takeSnapshot({ quality: 70 });
      return photo?.path ?? null;
    } catch {
      return null;
    }
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!consensusMatch) return;
    // Mutex — prevent double-fire under slow navigation.
    if (confirmLockRef.current) return;
    confirmLockRef.current = true;
    setConfirming(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const cigar = consensusMatch.cigar;
    const confidence = consensusMatch.score;
    track(EVENTS.SCAN_RESULT_CONFIRMED, {
      method: 'ocr',
      cigar_id: cigar.id,
      score: Number(confidence.toFixed(3)),
    });

    // Training snapshot — best-effort, never blocks navigation.
    (async () => {
      try {
        const [path, deviceId] = await Promise.all([takeSnapshotFile(), getDeviceId()]);
        const { data: { user } } = await supabase.auth.getUser();
        let imageUrl: string | null = null;
        if (path && user) {
          const fileUri = normalizeFileUri(path);
          const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
          const filePath = `${user.id}/${fileName}`;
          const imgRes = await fetch(fileUri);
          const blob = await imgRes.blob();
          await supabase.storage.from('scan-uploads').upload(filePath, blob, {
            contentType: 'image/jpeg',
          });
          const { data: urlData } = supabase.storage.from('scan-uploads').getPublicUrl(filePath);
          imageUrl = urlData.publicUrl;
        }
        await supabase.from('scan_images').insert({
          user_id: user?.id ?? null,
          device_id: deviceId,
          scan_method: 'ocr',
          image_url: imageUrl,
          identified_cigar_id: cigar.id,
          confidence,
          user_confirmed: true,
          raw_llm_response: { method: 'ocr', score: confidence },
        });
      } catch {
        // Non-blocking
      }
    })();

    // Add to humidor as owned.
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('humidor_items')
          .upsert(
            { user_id: user.id, cigar_id: cigar.id, status: 'owned' },
            { onConflict: 'user_id,cigar_id,status' }
          );
      }
    } catch {
      // Non-blocking
    }

    router.replace(`/(tabs)/cigar/${cigar.id}?from=scan`);
  }, [consensusMatch, confirming, router, takeSnapshotFile]);

  const handleAskAI = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    track(EVENTS.SCAN_CONCIERGE_TAPPED, { source: 'fallback' });
    const path = await takeSnapshotFile();
    if (!path) {
      Alert.alert('Capture Error', 'Failed to capture photo. Please try again.');
      return;
    }
    const uri = normalizeFileUri(path);
    router.replace({
      pathname: '/identify/result',
      params: { imageUris: JSON.stringify([uri]) },
    });
  }, [router, takeSnapshotFile]);

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

  const handleRejectMatch = useCallback(() => {
    Haptics.selectionAsync();
    track(EVENTS.SCAN_RESULT_REJECTED, {
      method: 'ocr',
      cigar_id: consensusMatch?.cigar.id,
    });
    // Blow away consensus and keep scanning.
    windowRef.current = [];
    matchHistoryRef.current = [];
    setConsensusMatch(null);
    setStatus('aiming');
    setOverlayRect(null);
  }, [consensusMatch]);

  // Emit SCAN_LIMIT_REACHED once per gate hit, not on every render.
  const limitFiredRef = useRef(false);
  useEffect(() => {
    if ((scans.limitReached || scans.guestLimitReached) && !limitFiredRef.current) {
      limitFiredRef.current = true;
      track(EVENTS.SCAN_LIMIT_REACHED, {
        guest: scans.guestLimitReached,
        total: scans.limitReached,
      });
    }
  }, [scans.limitReached, scans.guestLimitReached]);

  // Caption computation + debounced display state. Declared with the rest of
  // the hooks, BEFORE any early return, so React sees the same hook count on
  // every render regardless of permission / scan-limit / device state.
  const caption = (() => {
    if (corpusError) return 'Catalog failed to load — try Cigar Concierge';
    if (corpusLoading && corpusIndex.length === 0) return 'Loading cigar catalog…';
    if (status === 'confident' && consensusMatch) {
      const c = consensusMatch.cigar;
      return `${c.brand} · ${c.line ?? c.name}`;
    }
    if (status === 'locking' && consensusMatch) {
      const c = consensusMatch.cigar;
      return `${c.brand}?  ${c.line ?? c.name}`;
    }
    if (status === 'reading') {
      return latestOcrText ? `Reading: ${latestOcrText}` : 'Reading band…';
    }
    return 'Aim at the cigar band';
  })();

  const [displayedCaption, setDisplayedCaption] = useState(caption);
  useEffect(() => {
    if (status === 'confident') {
      setDisplayedCaption(caption);
      return;
    }
    const t = setTimeout(() => setDisplayedCaption(caption), CAPTION_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [caption, status]);

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
        <Text style={styles.permText}>Stick Picks uses the camera to read cigar bands.</Text>
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

  const bracketColor = (() => {
    switch (status) {
      case 'confident': return COLORS.success ?? '#4CAF50';
      case 'locking': return COLORS.accent;
      case 'reading': return 'rgba(255,255,255,0.7)';
      default: return 'rgba(255,255,255,0.35)';
    }
  })();

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
        frameProcessor={frameProcessor}
        pixelFormat="yuv"
        torch={torchOn ? 'on' : 'off'}
        zoom={zoom}
      />

      {/* Back button */}
      <Pressable
        onPress={() => router.back()}
        style={[styles.topBtn, { top: insets.top + 10, left: 16 }]}
      >
        <Ionicons name="arrow-back" size={24} color={COLORS.text} />
      </Pressable>

      {/* Torch toggle */}
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

      {/* Gallery picker — scan a photo from the library via Concierge */}
      <Pressable
        onPress={handleGalleryPick}
        style={[styles.topBtn, { top: insets.top + 10, right: 16 }]}
        hitSlop={8}
      >
        <Ionicons name="images-outline" size={22} color={COLORS.text} />
      </Pressable>

      {/* Dynamic brackets — when we have a bbox, we render it; else a centered guide */}
      {overlayRect ? (
        <BandBrackets rect={overlayRect} color={bracketColor} />
      ) : (
        <View style={styles.frameGuide} pointerEvents="none">
          <View style={[styles.frameCornerTL, { borderColor: bracketColor }]} />
          <View style={[styles.frameCornerTR, { borderColor: bracketColor }]} />
          <View style={[styles.frameCornerBL, { borderColor: bracketColor }]} />
          <View style={[styles.frameCornerBR, { borderColor: bracketColor }]} />
        </View>
      )}

      {/* Caption */}
      <View style={[styles.captionWrap, { top: insets.top + 70 }]} pointerEvents="none">
        <Text style={[styles.caption, status === 'confident' && styles.captionConfident]}>
          {displayedCaption}
        </Text>
      </View>

      {/* Action pad */}
      <View style={[styles.actionBar, { paddingBottom: insets.bottom + 24 }]}>
        {status === 'confident' && consensusMatch && (
          <>
            <Pressable
              onPress={handleConfirm}
              disabled={confirming}
              style={[styles.confirmBtn, confirming && { opacity: 0.6 }]}
            >
              {confirming ? (
                <ActivityIndicator color={COLORS.bg} />
              ) : (
                <>
                  <Ionicons name="checkmark" size={20} color={COLORS.bg} />
                  <Text style={styles.confirmText}>Confirm</Text>
                </>
              )}
            </Pressable>
            <Pressable onPress={handleRejectMatch} style={styles.keepLookingBtn}>
              <Text style={styles.keepLookingText}>Keep Looking</Text>
            </Pressable>
          </>
        )}

        {status !== 'confident' && showFallback && (
          <Pressable onPress={handleAskAI} style={styles.conciergeBtn}>
            <Ionicons name="sparkles" size={18} color={COLORS.accent} />
            <View>
              <Text style={styles.conciergeTitle}>Cigar Concierge</Text>
              <Text style={styles.conciergeSubtitle}>Let AI help ID this label</Text>
            </View>
          </Pressable>
        )}
      </View>
    </View>
    </GestureDetector>
    </GestureHandlerRootView>
  );
}

function BandBrackets({
  rect,
  color,
}: {
  rect: { x: number; y: number; w: number; h: number };
  color: string;
}) {
  // Pad the bbox a little so the rectangle frames the band rather than clamping to text.
  const PAD_X = 0.03;
  const PAD_Y = 0.04;
  const left = `${Math.max(0, (rect.x - PAD_X) * 100)}%` as const;
  const top = `${Math.max(0, (rect.y - PAD_Y) * 100)}%` as const;
  const width = `${Math.min(100, (rect.w + PAD_X * 2) * 100)}%` as const;
  const height = `${Math.min(100, (rect.h + PAD_Y * 2) * 100)}%` as const;

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: color,
        shadowColor: color,
        shadowOpacity: 0.55,
        shadowRadius: 12,
      }}
    />
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
    top: '30%',
    left: '10%',
    right: '10%',
    bottom: '40%',
  },
  frameCornerTL: {
    position: 'absolute', top: 0, left: 0,
    width: 34, height: 34, borderTopWidth: 3, borderLeftWidth: 3,
  },
  frameCornerTR: {
    position: 'absolute', top: 0, right: 0,
    width: 34, height: 34, borderTopWidth: 3, borderRightWidth: 3,
  },
  frameCornerBL: {
    position: 'absolute', bottom: 0, left: 0,
    width: 34, height: 34, borderBottomWidth: 3, borderLeftWidth: 3,
  },
  frameCornerBR: {
    position: 'absolute', bottom: 0, right: 0,
    width: 34, height: 34, borderBottomWidth: 3, borderRightWidth: 3,
  },
  captionWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  caption: {
    fontFamily: 'Cormorant',
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
  },
  captionConfident: {
    backgroundColor: 'rgba(0,0,0,0.82)',
    color: '#FFFFFF',
  },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    gap: 10,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.accent,
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: RADIUS.full,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  confirmText: {
    fontFamily: 'Cormorant',
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.bg,
    letterSpacing: 0.3,
  },
  keepLookingBtn: {
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: RADIUS.full,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  keepLookingText: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  conciergeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingVertical: 11,
    paddingHorizontal: 22,
    borderRadius: RADIUS.full,
    borderWidth: 1.5,
    borderColor: COLORS.accent,
  },
  conciergeTitle: {
    fontFamily: 'Cormorant',
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.accent,
    letterSpacing: 0.3,
  },
  conciergeSubtitle: {
    fontFamily: 'Cormorant',
    fontSize: 11,
    fontStyle: 'italic',
    color: COLORS.accentSoft ?? '#E8CC6A',
    marginTop: 1,
  },
});
