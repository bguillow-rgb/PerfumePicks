/**
 * Perfume Concierge — Result screen.
 *
 * Mirrors Pour Picks' result.tsx with 6 render states:
 *   1. Loading — shimmer + rotating messages
 *   2. Error — retry / describe / cancel
 *   3. Deeper pending — "Searching deeper…"
 *   4. Deeper candidate — "Is this it?" confirm/reject
 *   5. No match — describe / suggest / try again
 *   6. Match — confidence badge, bottle card, confirm with undo snackbar
 */

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated as RNAnimated,
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

import { DescribeFragranceSheet } from '@/src/components/identify/DescribeFragranceSheet';
import { SuggestFragranceSheet } from '@/src/components/identify/SuggestFragranceSheet';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '@/src/constants/theme';
import {
  findBottleDeeper,
  identifyBottle,
  type DeeperResult,
  type IdentifyResult,
} from '@/src/features/identify/identifyService';
import {
  hasConsumedFreeDeeperSearch,
  markFreeDeeperSearchConsumed,
} from '@/src/features/identify/findDeeperGate';
import { track, EVENTS } from '@/src/lib/observability';
import { captureException } from '@/src/lib/observability';
import { useProStore } from '@/src/stores/useProStore';
import { supabase } from '@/lib/supabase';

type RenderState =
  | 'loading'
  | 'error'
  | 'deeper_pending'
  | 'deeper_candidate'
  | 'no_match'
  | 'match';

type Confidence = 'likely' | 'best_guess' | 'possible';

function getConfidenceTier(c: number): Confidence {
  if (c >= 0.7) return 'likely';
  if (c >= 0.5) return 'best_guess';
  return 'possible';
}

const CONFIDENCE_LABELS: Record<Confidence, string> = {
  likely: 'LIKELY MATCH',
  best_guess: 'BEST GUESS',
  possible: 'POSSIBLE MATCH',
};

const LOADING_MESSAGES = [
  'Reading the label…',
  'Checking our catalog…',
  'Almost there…',
];

export default function ResultScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ imageUris: string }>();
  const imageUri = params.imageUris ?? null;

  const isPro = useProStore((s) => s.isPro);

  const [renderState, setRenderState] = useState<RenderState>('loading');
  const [result, setResult] = useState<IdentifyResult | null>(null);
  const [deeperResult, setDeeperResult] = useState<DeeperResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0]);
  const [describeVisible, setDescribeVisible] = useState(false);
  const [suggestVisible, setSuggestVisible] = useState(false);

  // Undo snackbar state
  const [undoCountdown, setUndoCountdown] = useState(0);
  const undoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const undoCancelledRef = useRef(false);

  // Rotate loading messages
  useEffect(() => {
    if (renderState !== 'loading') return;
    let i = 0;
    const iv = setInterval(() => {
      i = (i + 1) % LOADING_MESSAGES.length;
      setLoadingMsg(LOADING_MESSAGES[i]);
    }, 2200);
    return () => clearInterval(iv);
  }, [renderState]);

  // Run identification on mount
  useEffect(() => {
    if (!imageUri) {
      setErrorMessage('No image provided.');
      setRenderState('error');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await identifyBottle(imageUri);
        if (cancelled) return;
        setResult(res);

        if (res.routeTo === 'confirm_personal') {
          // Route to confirm screen for every scan
          router.replace({
            pathname: '/identify/confirm-personal',
            params: {
              scanId: res.scanId ?? '',
              fragranceId: res.fragranceId ?? '',
              brand: res.displayBrand,
              name: res.displayName,
              concentration: res.displayConcentration ?? '',
              confidence: String(res.confidence),
              imageUri: imageUri ?? '',
            },
          } as any);
          return;
        }

        if (res.fragranceId && res.confidence >= 0.5) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setRenderState('match');
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          setRenderState('no_match');
        }
      } catch (e: any) {
        if (cancelled) return;
        captureException(e, { area: 'identify_bottle' });
        setErrorMessage(e?.message ?? 'Something went wrong.');
        setRenderState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [imageUri]);

  // ── Confirm with undo ──
  const handleConfirm = useCallback(() => {
    if (!result?.fragranceId) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    track(EVENTS.SCAN_CONFIRMED, {
      fragrance_id: result.fragranceId,
      confidence: result.confidence,
    });

    undoCancelledRef.current = false;
    setUndoCountdown(5);

    undoTimerRef.current = setInterval(() => {
      setUndoCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(undoTimerRef.current!);
          if (!undoCancelledRef.current && result.fragranceId) {
            // Mark scan as confirmed
            if (result.scanId) {
              supabase
                .from('scan_images')
                .update({ user_confirmed: true })
                .eq('id', result.scanId)
                .then(() => {});
            }
            router.replace(`/(tabs)/fragrance/${result.fragranceId}` as any);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [result, router]);

  const handleUndo = useCallback(() => {
    undoCancelledRef.current = true;
    if (undoTimerRef.current) clearInterval(undoTimerRef.current);
    setUndoCountdown(0);

    // Refund the scan
    if (result?.scanId) {
      supabase
        .from('scan_images')
        .update({ refunded: true })
        .eq('id', result.scanId)
        .then(() => {});
    }
    track(EVENTS.SCAN_REJECTED, { fragrance_id: result?.fragranceId });
    setRenderState('no_match');
  }, [result]);

  // ── Deeper search ──
  const handleDeeperSearch = useCallback(async () => {
    if (!result) return;

    if (!isPro) {
      const consumed = await hasConsumedFreeDeeperSearch();
      if (consumed) {
        router.push('/paywall' as any);
        return;
      }
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    track(EVENTS.SCAN_DEEPER_STARTED, {});
    setRenderState('deeper_pending');

    try {
      if (!isPro) await markFreeDeeperSearchConsumed();

      const deeper = await findBottleDeeper({
        displayName: result.displayName,
        brand: result.aiBrand,
        name: result.aiName,
        concentration: result.aiConcentration,
        confidence: result.confidence,
        reasoning: result.reasoning,
      });

      track(EVENTS.SCAN_DEEPER_COMPLETED, {
        source: deeper?.source ?? 'null',
        confidence: deeper?.confidence ?? 0,
      });

      if (deeper) {
        setDeeperResult(deeper);
        setRenderState('deeper_candidate');
      } else {
        setRenderState('no_match');
      }
    } catch (e) {
      captureException(e, { area: 'find_deeper' });
      setRenderState('no_match');
    }
  }, [result, isPro, router]);

  const handleDeeperConfirm = useCallback(() => {
    if (!deeperResult) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    if (deeperResult.source === 'catalog' && deeperResult.catalogFragranceId) {
      router.replace(
        `/(tabs)/fragrance/${deeperResult.catalogFragranceId}` as any
      );
    } else {
      // Generated — route to confirm-personal
      router.replace({
        pathname: '/identify/confirm-personal',
        params: {
          scanId: result?.scanId ?? '',
          brand: deeperResult.candidate.brand,
          name: deeperResult.candidate.name,
          concentration: deeperResult.candidate.concentration ?? '',
          confidence: String(deeperResult.confidence),
          imageUri: imageUri ?? '',
        },
      } as any);
    }
  }, [deeperResult, result, imageUri, router]);

  // ── Describe callbacks ──
  const handleDescribeMatch = useCallback(
    (res: IdentifyResult) => {
      setDescribeVisible(false);
      if (res.fragranceId) {
        router.replace(`/(tabs)/fragrance/${res.fragranceId}` as any);
      } else {
        setSuggestVisible(true);
      }
    },
    [router]
  );

  const handleDescribeNoMatch = useCallback(() => {
    setDescribeVisible(false);
    setSuggestVisible(true);
  }, []);

  const tier = result ? getConfidenceTier(result.confidence) : 'possible';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={28} color={COLORS.text} />
        </Pressable>
        <Text style={styles.headerTitle}>PERFUME CONCIERGE</Text>
        <View style={{ width: 28 }} />
      </View>

      {/* ── Loading ── */}
      {renderState === 'loading' && (
        <View style={styles.center}>
          {imageUri && (
            <View style={styles.shimmerWrap}>
              <Image source={{ uri: imageUri }} style={styles.scanImage} />
              <ShimmerOverlay />
            </View>
          )}
          <Text style={styles.loadingTitle}>Identifying your fragrance</Text>
          <Text style={styles.loadingHint}>{loadingMsg}</Text>
        </View>
      )}

      {/* ── Error ── */}
      {renderState === 'error' && (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color={COLORS.danger} />
          <Text style={styles.heroTitle}>Something went wrong</Text>
          <Text style={styles.heroSub}>{errorMessage}</Text>
          <View style={styles.btnCol}>
            <Btn label="Try Again" icon="camera" onPress={() => router.replace('/identify/camera' as any)} />
            <Btn label="Describe Instead" icon="chatbubble-outline" outline onPress={() => setDescribeVisible(true)} />
            <BtnText label="Cancel" onPress={() => router.back()} />
          </View>
        </View>
      )}

      {/* ── Deeper pending ── */}
      {renderState === 'deeper_pending' && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={styles.loadingTitle}>Searching deeper…</Text>
          <Text style={styles.loadingHint}>
            Running a second pass against our catalog
          </Text>
        </View>
      )}

      {/* ── Deeper candidate ── */}
      {renderState === 'deeper_candidate' && deeperResult && (
        <View style={styles.center}>
          <Text style={styles.kickerSmall}>IS THIS IT?</Text>
          <View style={styles.resultCard}>
            <Text style={styles.resultBrand}>
              {deeperResult.candidate.brand.toUpperCase()}
            </Text>
            <Text style={styles.resultName}>
              {deeperResult.candidate.name}
            </Text>
            {deeperResult.candidate.concentration && (
              <Text style={styles.resultConc}>
                {deeperResult.candidate.concentration}
              </Text>
            )}
            <Text style={styles.resultConf}>
              {Math.round(deeperResult.confidence * 100)}% confident
              {deeperResult.source === 'generated' ? ' · AI-assembled' : ''}
            </Text>
          </View>
          <View style={styles.btnCol}>
            <Btn label="Yes, that's it" icon="checkmark-circle" onPress={handleDeeperConfirm} />
            <Btn label="Describe Instead" icon="chatbubble-outline" outline onPress={() => setDescribeVisible(true)} />
            <BtnText label="Try another photo" onPress={() => router.replace('/identify/camera' as any)} />
          </View>
        </View>
      )}

      {/* ── No match ── */}
      {renderState === 'no_match' && (
        <View style={styles.center}>
          {imageUri && (
            <Image source={{ uri: imageUri }} style={styles.resultImage} />
          )}
          <Ionicons name="help-circle-outline" size={48} color={COLORS.muted} />
          <Text style={styles.heroTitle}>Couldn't identify this bottle</Text>
          <Text style={styles.heroSub}>
            Try a clearer photo, describe it in words, or suggest it for our catalog.
          </Text>
          <View style={styles.btnCol}>
            <Btn label="Find This Fragrance" icon="search" onPress={handleDeeperSearch} />
            <Btn label="Describe Instead" icon="chatbubble-outline" outline onPress={() => setDescribeVisible(true)} />
            <Btn
              label="Suggest for Catalog"
              icon="add-circle-outline"
              outline
              onPress={() => setSuggestVisible(true)}
            />
            <BtnText
              label="Try another photo"
              onPress={() => router.replace('/identify/camera' as any)}
            />
          </View>
        </View>
      )}

      {/* ── Match ── */}
      {renderState === 'match' && result && (
        <View style={styles.center}>
          {imageUri && (
            <Image source={{ uri: imageUri }} style={styles.resultImage} />
          )}
          <View
            style={[
              styles.resultCard,
              tier === 'likely' && styles.resultCardLikely,
            ]}
          >
            <Text
              style={[
                styles.kickerSmall,
                tier === 'likely' && { color: COLORS.accent },
              ]}
            >
              {CONFIDENCE_LABELS[tier]}
            </Text>
            <Text style={styles.resultBrand}>
              {result.displayBrand.toUpperCase()}
            </Text>
            <Text style={styles.resultName}>{result.displayName}</Text>
            {result.displayConcentration && (
              <Text style={styles.resultConc}>
                {result.displayConcentration}
              </Text>
            )}
            <Text style={styles.resultConf}>
              {Math.round(result.confidence * 100)}% confident
            </Text>
          </View>

          {undoCountdown > 0 ? (
            <View style={styles.undoBar}>
              <Text style={styles.undoText}>
                Opening in {undoCountdown}s…
              </Text>
              <Pressable onPress={handleUndo}>
                <Text style={styles.undoBtn}>Undo</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={styles.confirmLabel}>Does this look right?</Text>
              <View style={styles.btnCol}>
                <Btn label="Yes, confirm" icon="checkmark-circle" onPress={handleConfirm} />
                <Btn label="Wrong fragrance" icon="close-circle-outline" outline onPress={() => {
                  track(EVENTS.SCAN_REJECTED, { fragrance_id: result.fragranceId });
                  setRenderState('no_match');
                }} />
                <BtnText
                  label="Try another photo"
                  onPress={() => router.replace('/identify/camera' as any)}
                />
              </View>
            </>
          )}
        </View>
      )}

      {/* ── Sheets ── */}
      <DescribeFragranceSheet
        visible={describeVisible}
        onClose={() => setDescribeVisible(false)}
        onMatch={handleDescribeMatch}
        onNoMatch={handleDescribeNoMatch}
      />
      <SuggestFragranceSheet
        visible={suggestVisible}
        onClose={() => setSuggestVisible(false)}
        scanId={result?.scanId}
        prefill={{
          brand: result?.aiBrand,
          name: result?.aiName,
          concentration: result?.aiConcentration,
        }}
      />
    </SafeAreaView>
  );
}

// ── Shared UI components ──

function Btn({
  label,
  icon,
  outline,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  outline?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.btn, outline && styles.btnOutline]}
      onPress={onPress}
    >
      <Ionicons
        name={icon}
        size={16}
        color={outline ? COLORS.accent : COLORS.white}
      />
      <Text
        style={[styles.btnText, outline && { color: COLORS.accent }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function BtnText({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.btnTextWrap} onPress={onPress}>
      <Text style={styles.btnTextLabel}>{label}</Text>
    </Pressable>
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
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -260 + progress.value * 520 }],
  }));
  return (
    <View style={styles.shimmerClip} pointerEvents="none">
      <Animated.View style={[styles.shimmerBar, style]} />
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
  heroTitle: {
    fontFamily: FONTS.serif,
    fontSize: 24,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 30,
  },
  heroSub: {
    ...TYPE.bodySmall,
    color: COLORS.muted,
    textAlign: 'center',
    paddingHorizontal: SPACING.sm,
  },

  // Loading
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
    opacity: 0.5,
    borderRadius: 3,
  },
  loadingTitle: {
    fontFamily: FONTS.serif,
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
  },
  loadingHint: {
    ...TYPE.caption,
    color: COLORS.muted,
    fontStyle: 'italic',
  },

  // Result card
  resultImage: {
    width: 180,
    height: 240,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.md,
  },
  resultCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    alignItems: 'center',
    width: '100%',
  },
  resultCardLikely: {
    borderColor: COLORS.accent,
    borderWidth: 1.5,
  },
  kickerSmall: {
    ...TYPE.eyebrow,
    fontSize: 10,
    color: COLORS.muted,
    marginBottom: 6,
    letterSpacing: 2,
  },
  resultBrand: { ...TYPE.eyebrow, fontSize: 10, marginBottom: 2 },
  resultName: {
    fontFamily: FONTS.serif,
    fontSize: 22,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 28,
  },
  resultConc: {
    ...TYPE.caption,
    color: COLORS.muted,
    marginTop: 2,
  },
  resultConf: {
    ...TYPE.caption,
    color: COLORS.accent,
    marginTop: SPACING.sm,
  },
  confirmLabel: {
    ...TYPE.bodySmall,
    color: COLORS.muted,
    fontStyle: 'italic',
    marginTop: SPACING.sm,
  },

  // Buttons
  btnCol: { gap: SPACING.sm, alignItems: 'center', marginTop: SPACING.sm, width: '100%' },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.xl,
    paddingVertical: 14,
    borderRadius: RADIUS.full,
    minWidth: 240,
    justifyContent: 'center',
  },
  btnOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  btnText: {
    ...TYPE.label,
    color: COLORS.white,
    letterSpacing: 0.5,
  },
  btnTextWrap: { paddingVertical: SPACING.sm },
  btnTextLabel: { ...TYPE.label, color: COLORS.muted, letterSpacing: 0.5 },

  // Undo bar
  undoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 12,
    paddingHorizontal: SPACING.lg,
    width: '100%',
    marginTop: SPACING.md,
  },
  undoText: { ...TYPE.bodySmall, color: COLORS.text },
  undoBtn: {
    ...TYPE.label,
    color: COLORS.accent,
    letterSpacing: 0.5,
  },
});
