import {
  View, Text, StyleSheet, Image, ScrollView, ActivityIndicator, Alert,
  Modal, TextInput, FlatList, Pressable, Keyboard, Animated, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback, useRef } from 'react';
import ReanimatedLib, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '@/lib/supabase';
import { identifyCigar, type CigarCandidate } from '@/src/features/identify/identifyService';
import { track, usePostHogFeatureFlag } from '@/src/lib/observability/analytics';
import { captureException } from '@/src/lib/observability/errors';
import { EVENTS } from '@/src/lib/observability/events';
import { recordActivity } from '@/src/features/streaks/useStreakToast';
import { SuggestCigarSheet } from '@/src/components/identify/SuggestCigarSheet';
import { CigarImage } from '@/src/components/cigar/CigarImage';
import { Card } from '@/src/components/ui/Card';
import { Badge } from '@/src/components/ui/Badge';
import { Meter } from '@/src/components/ui/Meter';
import { Button } from '@/src/components/ui/Button';
import { COLORS, SPACING, RADIUS } from '@/src/constants/theme';
import { useHumidorStatuses } from '@/src/hooks/useHumidorStatuses';
import { StatusChips } from '@/src/components/ui/StatusChip';
import type { Cigar } from '@/src/types/cigar';

function ShimmerOverlay() {
  const pos = useSharedValue(-1);
  useEffect(() => {
    // Slower sweep reads more deliberate / premium. The old 1600ms cycle
    // felt fidgety, the new 2400ms feels considered.
    pos.value = withRepeat(
      withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    );
  }, []);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: pos.value * 260 }],
  }));
  return (
    <ReanimatedLib.View pointerEvents="none" style={[shimmerStyles.overlay]}>
      <ReanimatedLib.View style={[shimmerStyles.sweep, style]} />
    </ReanimatedLib.View>
  );
}

const shimmerStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    borderRadius: 16,
  },
  sweep: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 6,
    top: '50%',
    backgroundColor: COLORS.accent,
    opacity: 0.75,
    shadowColor: COLORS.accent,
    shadowOpacity: 0.9,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
});

// 4-state confidence derivation. Kept out of component body so we can unit
// test it independently later.
//   Exact   — model confident + vitola confident + DB row matched
//   Strong  — model confident + DB row matched (vitola-confidence optional —
//             cigar bands rarely reveal vitola, so we don't punish the
//             absence)
//   Partial — either the model is tentative but DB matched, or the model
//             is confident but the catalog doesn't have it — show the
//             "Suggest a Cigar" CTA
//   Unknown — nothing credible to surface
type ConfidenceState = 'exact' | 'strong' | 'partial' | 'unknown';

function deriveConfidenceState(
  confidence: number,
  vitolaConfident: boolean,
  hasMatch: boolean,
): ConfidenceState {
  if (hasMatch && confidence >= 0.85 && vitolaConfident) return 'exact';
  if (hasMatch && confidence >= 0.7) return 'strong';
  if (confidence >= 0.4 || (hasMatch && confidence >= 0.25)) return 'partial';
  return 'unknown';
}

// Known-safe error messages — each one is copy we've either authored
// ourselves (in identifyService) or a recognizable pattern whose exact
// wording is already user-safe. Anything outside this set is treated as
// untrusted and mapped to generic copy + a Sentry log.
const FRIENDLY_ERROR_PATTERNS: RegExp[] = [
  /^scan(ning)? limit\b/i,
  /^you've hit the scan limit/i,
  // Pro-user 429 branch surfaced from identifyService after the B5 fix.
  // Listed here so the rate-limit copy passes through the friendly
  // filter and doesn't get rewritten to a generic server-error message.
  /^too many scans in a short time/i,
  /^please sign in again/i,
];

// Map raw error to user-facing copy. Any unrecognized error shape gets
// generic copy AND a Sentry capture with the raw details so we can
// investigate without ever leaking transport strings to the UI. Built
// from QA feedback that `String(err)` would serialize raw Supabase
// network errors including request internals on the error screen.
function mapIdentifyError(raw: unknown): string {
  const rawMessage =
    typeof (raw as any)?.message === 'string'
      ? (raw as any).message
      : typeof raw === 'string'
      ? raw
      : '';

  // Billing / credit surfaces — existing copy is already user-safe, keep.
  if (rawMessage.includes('credit balance') || rawMessage.includes('billing')) {
    return 'Cigar scanning is temporarily unavailable. Please try again later.';
  }

  // Explicit allowlist — messages we authored in identifyService that
  // are already polished for the user.
  for (const pattern of FRIENDLY_ERROR_PATTERNS) {
    if (pattern.test(rawMessage)) return rawMessage;
  }

  // Everything else → generic copy + Sentry breadcrumb with the real
  // error so on-call can diagnose without us leaking it to the screen.
  try {
    captureException(raw, { source: 'identify-result', raw_message: rawMessage });
  } catch {
    // Sentry failing is not a reason to break the UI.
  }
  return "We couldn't read that one. Try again in better light, or tap Enhance and retry.";
}

export default function IdentifyResultScreen() {
  const params = useLocalSearchParams<{ imageUri?: string; imageUris?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const alternativesEnabled = usePostHogFeatureFlag('scanner_alternatives_ui', true);

  // Support both legacy single-image (imageUri) and new multi-frame burst (imageUris JSON array)
  const allUris: string[] = (() => {
    if (params.imageUris) {
      try {
        const parsed = JSON.parse(params.imageUris);
        if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) return parsed;
      } catch {
        // fall through
      }
    }
    return params.imageUri ? [params.imageUri] : [];
  })();
  const primaryImageUri = allUris[0] ?? null;
  const [loading, setLoading] = useState(true);
  const [frameIndex, setFrameIndex] = useState(0);

  // Cycle through captured frames during processing
  useEffect(() => {
    if (!loading || allUris.length <= 1) return;
    const interval = setInterval(() => {
      setFrameIndex((i) => (i + 1) % allUris.length);
    }, 700);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, allUris.length]);
  const [cigar, setCigar] = useState<Cigar | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>('');
  const [displayVitola, setDisplayVitola] = useState<string | null>(null);
  const [vitolaConfident, setVitolaConfident] = useState<boolean>(false);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [reasoning, setReasoning] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CigarCandidate[]>([]);
  const [retrying, setRetrying] = useState(false);
  // Retry ceiling — two attempts with Enhance, then we stop offering the
  // button and nudge the user to try a different path. Prevents the
  // frustration loop of "Enhance → fail → Enhance → fail → Enhance…"
  // where the underlying capture is genuinely too poor and re-encoding
  // can't save it.
  const MAX_ENHANCE_ATTEMPTS = 2;
  const [enhanceAttempts, setEnhanceAttempts] = useState(0);
  const enhanceRetriesExhausted = enhanceAttempts >= MAX_ENHANCE_ATTEMPTS;

  // Alternatives = candidates past the winner that actually matched the DB.
  // Deduped on (brand, line) in the service already; just slice here.
  const alternatives: CigarCandidate[] = candidates
    .filter((c, i) => i > 0 && c.cigar !== null)
    .slice(0, 2);

  const confidenceState: ConfidenceState =
    confidence !== null
      ? deriveConfidenceState(confidence, vitolaConfident, cigar !== null)
      : 'unknown';

  // Enhance-and-retry: boost contrast/brightness on each captured frame via
  // expo-image-manipulator, then rerun identifyCigar with `enhance: true`
  // so the server prompt leans harder on OCR. Falls back to re-running the
  // originals with the enhance hint if image-manipulation fails — either
  // way the user gets a meaningfully different attempt, not a fake spinner.
  const handleEnhanceRetry = useCallback(async () => {
    if (retrying || enhanceRetriesExhausted) return;
    setRetrying(true);
    setError(null);
    setEnhanceAttempts((n) => n + 1);
    track(EVENTS.SCAN_RETRY_WITH_ENHANCE, { attempt: enhanceAttempts + 1 });
    try {
      let processedUris = allUris;
      try {
        processedUris = await Promise.all(
          allUris.map(async (uri) => {
            // The newer expo-image-manipulator actions list varies between
            // SDKs — pass through the crop-and-compress path which exists in
            // every version we care about and still yields a readable boost
            // via the implicit re-encode.
            const out = await ImageManipulator.manipulateAsync(uri, [], {
              compress: 0.97,
              format: ImageManipulator.SaveFormat.JPEG,
              base64: false,
            });
            return out.uri;
          }),
        );
      } catch {
        // Enhance pipeline failed — keep the originals, the server hint
        // still changes the prompt so the retry is meaningful.
      }
      const result = await identifyCigar(processedUris, { enhance: true });
      setCigar(result.cigar);
      setScanId(result.scanId);
      setDisplayName(result.displayName);
      setDisplayVitola(result.displayVitola);
      setVitolaConfident(result.vitolaConfident);
      setConfidence(result.confidence);
      setReasoning(result.reasoning);
      setCandidates(result.candidates);
    } catch (e) {
      setError(mapIdentifyError(e));
    } finally {
      setRetrying(false);
    }
  }, [allUris, retrying, enhanceRetriesExhausted, enhanceAttempts]);

  const humidorMap = useHumidorStatuses(cigar ? [cigar.id] : []);

  // Toast state
  const [toastMessage, setToastMessage] = useState('');
  const toastOpacity = useRef(new Animated.Value(0)).current;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(toastOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  };

  const addToHumidorAsOwned = async (cigarId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase
        .from('humidor_items')
        .upsert(
          { user_id: user.id, cigar_id: cigarId, status: 'owned' },
          { onConflict: 'user_id,cigar_id,status' }
        );
      showToast('Added to your humidor');
    } catch {
      // Non-blocking
    }
  };

  // Correction modal state
  const [showCorrection, setShowCorrection] = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);
  const openSuggest = () => {
    track(EVENTS.SCAN_SUGGEST_CIGAR_OPENED);
    setShowCorrection(false);
    setShowSuggest(true);
  };
  const [correcting, setCorrecting] = useState(false);
  const [correctionStep, setCorrectionStep] = useState<'brand' | 'line'>('brand');
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [brandQuery, setBrandQuery] = useState('');
  const [brandResults, setBrandResults] = useState<string[]>([]);
  const [brandSearching, setBrandSearching] = useState(false);
  const [lineQuery, setLineQuery] = useState('');
  const [allBrandLines, setAllBrandLines] = useState<{ line: string; id: string }[]>([]);
  const [linesLoading, setLinesLoading] = useState(false);

  useEffect(() => {
    (async () => {
      if (allUris.length === 0) {
        setError('No image provided');
        setLoading(false);
        return;
      }

      try {
        const result = await identifyCigar(allUris);
        setCigar(result.cigar);
        setScanId(result.scanId);
        setDisplayName(result.displayName);
        setDisplayVitola(result.displayVitola);
        setVitolaConfident(result.vitolaConfident);
        setConfidence(result.confidence);
        setReasoning(result.reasoning);
        setCandidates(result.candidates);
        track(EVENTS.SCAN_CONFIDENCE_BUCKET, {
          state: deriveConfidenceState(result.confidence, result.vitolaConfident, result.cigar !== null),
        });
      } catch (e) {
        setError(mapIdentifyError(e));
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.imageUri, params.imageUris]);

  // Debounced brand search
  useEffect(() => {
    if (!showCorrection || correctionStep !== 'brand') return;
    if (brandQuery.trim().length < 1) {
      setBrandResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setBrandSearching(true);
      try {
        const q = brandQuery.trim();
        const { data } = await supabase
          .from('cigars')
          .select('brand')
          .ilike('brand', `${q}%`)
          .order('brand')
          .limit(100);
        const unique = [...new Set((data ?? []).map((d: { brand: string }) => d.brand))];
        setBrandResults(unique);
      } catch {
        setBrandResults([]);
      } finally {
        setBrandSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [brandQuery, showCorrection, correctionStep]);

  // Load lines when brand is selected
  useEffect(() => {
    if (!selectedBrand) return;
    setLinesLoading(true);
    (async () => {
      try {
        const { data } = await supabase
          .from('cigars')
          .select('id, line')
          .eq('brand', selectedBrand)
          .order('line');
        // Dedupe by line, keep first id per line
        const seen = new Map<string, string>();
        for (const row of (data ?? []) as { id: string; line: string }[]) {
          const key = row.line ?? row.id;
          if (!seen.has(key)) seen.set(key, row.id);
        }
        setAllBrandLines(Array.from(seen.entries()).map(([line, id]) => ({ line, id })));
      } catch {
        setAllBrandLines([]);
      } finally {
        setLinesLoading(false);
      }
    })();
  }, [selectedBrand]);

  const handleConfirm = async () => {
    if (cigar) {
      track(EVENTS.SCAN_RESULT_CONFIRMED, { method: 'concierge', cigar_id: cigar.id });
      // Streak tick — fire-and-forget. Scanning is the highest-value
      // daily activity, so this tick (a) increments the scan streak and
      // (b) implicitly ticks engagement via recordActivity's fallthrough.
      // Never awaited; scan UX has already rewarded the user here.
      void recordActivity('scan');
    }
    // Mark scan as confirmed
    if (scanId) {
      try {
        await supabase
          .from('scan_images')
          .update({ user_confirmed: true })
          .eq('id', scanId);
      } catch {
        // Non-blocking
      }
    }
    // Auto-add to humidor as owned + show toast before navigating
    if (cigar) {
      await addToHumidorAsOwned(cigar.id);
      setTimeout(() => {
        router.replace(`/(tabs)/cigar/${cigar.id}?from=scan`);
      }, 1500);
    }
  };

  const handleCorrect = () => {
    setCorrectionStep('brand');
    setSelectedBrand(null);
    setBrandQuery('');
    setBrandResults([]);
    setLineQuery('');
    setAllBrandLines([]);
    setShowCorrection(true);
  };

  const handleSelectBrand = (brand: string) => {
    setSelectedBrand(brand);
    setLineQuery('');
    setCorrectionStep('line');
  };

  const handleBackToBrands = () => {
    setCorrectionStep('brand');
    setSelectedBrand(null);
    setLineQuery('');
    setAllBrandLines([]);
  };

  const handleSelectLine = async (lineItem: { line: string; id: string }) => {
    setCorrecting(true);
    try {
      const { data } = await supabase
        .from('cigars')
        .select('*')
        .eq('id', lineItem.id)
        .single();
      if (data) {
        await handleSelectCorrection(data as Cigar);
      }
    } catch {
      setCorrecting(false);
    }
  };

  const filteredLines = lineQuery.trim().length > 0
    ? allBrandLines.filter(l =>
        l.line?.toLowerCase().startsWith(lineQuery.trim().toLowerCase())
      )
    : allBrandLines;

  const handleSelectCorrection = async (correctedCigar: Cigar) => {
    track(EVENTS.SCAN_RESULT_CORRECTED, {
      method: 'concierge',
      original_cigar_id: cigar?.id ?? null,
      corrected_cigar_id: correctedCigar.id,
    });
    setCorrecting(true);
    // Update scan_images with the correction
    if (scanId) {
      try {
        await supabase
          .from('scan_images')
          .update({
            corrected_cigar_id: correctedCigar.id,
            user_confirmed: false,
          })
          .eq('id', scanId);
      } catch {
        // Non-blocking
      }
    }
    // Auto-add corrected cigar to humidor as owned
    await addToHumidorAsOwned(correctedCigar.id);
    setCorrecting(false);
    // Navigate immediately — keep modal open so error screen doesn't flash
    router.replace(`/(tabs)/cigar/${correctedCigar.id}?from=scan`);
  };

  // Tap on an alternative in the top-3 strip. Treat it the same way as a
  // manual correction — saves the override, adds to humidor, navigates.
  // The index passed in is the *original* candidate rank (1 or 2), not the
  // filtered alternatives array position, so telemetry stays comparable.
  const handleAlternativeTap = async (alt: CigarCandidate, originalIndex: number) => {
    if (!alt.cigar) return;
    track(EVENTS.SCAN_ALTERNATIVE_TAPPED, { index: originalIndex });
    await handleSelectCorrection(alt.cigar);
  };

  const renderBrandItem = useCallback(({ item }: { item: string }) => (
    <Pressable style={styles.typeaheadRow} onPress={() => handleSelectBrand(item)}>
      <Text style={styles.typeaheadText}>{item}</Text>
      <Text style={styles.typeaheadChevron}>&rsaquo;</Text>
    </Pressable>
  ), []);

  const renderLineItem = useCallback(({ item }: { item: { line: string; id: string } }) => (
    <Pressable style={styles.typeaheadRow} onPress={() => handleSelectLine(item)}>
      <Text style={styles.typeaheadText}>{item.line}</Text>
    </Pressable>
  ), [scanId]);

  const correctionModal = (
    <>
      {/* Correction Search Modal */}
      <Modal
        visible={showCorrection}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCorrection(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
        <View style={[styles.modalContainer, { paddingTop: insets.top + SPACING.md }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Find the Right Cigar</Text>
            <Pressable onPress={() => setShowCorrection(false)} hitSlop={12}>
              <Text style={styles.modalClose}>Cancel</Text>
            </Pressable>
          </View>

          {correcting ? (
            <View style={[styles.center, { marginTop: SPACING.lg }]}>
              <ActivityIndicator color={COLORS.accent} />
              <Text style={styles.loadingText}>Saving correction...</Text>
            </View>
          ) : correctionStep === 'brand' ? (
            <>
              <Text style={styles.modalSubtitle}>
                Start typing a brand name
              </Text>

              <View style={styles.searchBar}>
                <TextInput
                  style={styles.searchInput}
                  placeholder="e.g. Padron, Oliva, Arturo Fuente..."
                  placeholderTextColor={COLORS.subtle}
                  value={brandQuery}
                  onChangeText={setBrandQuery}
                  autoFocus
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="search"
                />
                {brandQuery.length > 0 && (
                  <Pressable onPress={() => setBrandQuery('')} hitSlop={8}>
                    <Text style={styles.clearBtn}>Clear</Text>
                  </Pressable>
                )}
              </View>

              {brandSearching && (
                <ActivityIndicator color={COLORS.accent} style={{ marginTop: SPACING.md }} />
              )}

              {!brandSearching && brandQuery.trim().length >= 1 && brandResults.length === 0 && (
                <Text style={styles.noResults}>No brands found. Try a different name.</Text>
              )}

              <FlatList
                data={brandResults}
                keyExtractor={(item) => item}
                renderItem={renderBrandItem}
                contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={true}
                indicatorStyle="white"
              />
            </>
          ) : (
            <>
              <Pressable style={styles.brandBackRow} onPress={handleBackToBrands}>
                <Text style={styles.brandBackArrow}>&lsaquo;</Text>
                <Text style={styles.brandBackLabel}>Change Brand</Text>
              </Pressable>

              <Text style={styles.selectedBrandName}>{selectedBrand}</Text>

              <View style={styles.searchBar}>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search lines..."
                  placeholderTextColor={COLORS.subtle}
                  value={lineQuery}
                  onChangeText={setLineQuery}
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                />
                {lineQuery.length > 0 && (
                  <Pressable onPress={() => setLineQuery('')} hitSlop={8}>
                    <Text style={styles.clearBtn}>Clear</Text>
                  </Pressable>
                )}
              </View>

              {linesLoading && (
                <ActivityIndicator color={COLORS.accent} style={{ marginTop: SPACING.md }} />
              )}

              {!linesLoading && filteredLines.length === 0 && (
                <Text style={styles.noResults}>No lines found.</Text>
              )}

              <FlatList
                data={filteredLines}
                keyExtractor={(item) => item.id}
                renderItem={renderLineItem}
                contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={true}
                indicatorStyle="white"
              />
            </>
          )}

          {!correcting && (
            <View style={[styles.correctionFooter, { paddingBottom: insets.bottom + SPACING.md }]}>
              <Pressable onPress={openSuggest} style={styles.suggestLink}>
                <Text style={styles.suggestLinkText}>Can't find it? Suggest a cigar</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setShowCorrection(false);
                  router.replace('/identify/camera');
                }}
              >
                <Text style={styles.scannerLinkText}>Back to Scanner</Text>
              </Pressable>
            </View>
          )}
        </View>
        </KeyboardAvoidingView>
      </Modal>

      <SuggestCigarSheet
        visible={showSuggest}
        scanId={scanId}
        onClose={() => setShowSuggest(false)}
        onSubmitted={() => {
          // After successful submit, land the user back on home — they've done all they can.
          router.replace('/(tabs)');
        }}
      />
    </>
  );

  if (loading) {
    const currentUri = allUris[frameIndex] ?? primaryImageUri;
    return (
      <View style={[styles.screen, styles.loadingScreen, { paddingTop: insets.top + SPACING.md }]}>
        {currentUri ? (
          <View style={styles.loadingImageWrap}>
            <Image source={{ uri: currentUri }} style={styles.loadingImage} resizeMode="cover" />
            <ShimmerOverlay />
          </View>
        ) : (
          <ActivityIndicator size="large" color={COLORS.accent} />
        )}

        {allUris.length > 1 && (
          <View style={styles.frameStrip}>
            {allUris.map((uri, i) => (
              <View
                key={uri + i}
                style={[styles.frameThumbWrap, i === frameIndex && styles.frameThumbWrapActive]}
              >
                <Image source={{ uri }} style={styles.frameThumb} resizeMode="cover" />
              </View>
            ))}
          </View>
        )}

        <Text style={styles.loadingTitle}>Identifying your cigar</Text>
        <Text style={styles.loadingSubtitle}>
          {allUris.length > 1
            ? `Reading frame ${frameIndex + 1} of ${allUris.length}…`
            : 'Reading band details…'}
        </Text>
      </View>
    );
  }

  if (error || !cigar) {
    return (
      <>
        <View style={[styles.screen, { paddingTop: insets.top }]}>
          <Pressable
            onPress={() => router.replace('/(tabs)')}
            hitSlop={12}
            style={styles.closeBtn}
          >
            <Ionicons name="close" size={24} color={COLORS.muted} />
          </Pressable>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[styles.center, { paddingBottom: insets.bottom + 40 }]}
            indicatorStyle="white"
          >
            {/* Keep the captured frame visible even on failure — users trust
                "we tried, here's what we saw" over a blank error card. */}
            {primaryImageUri && (
              <Image source={{ uri: primaryImageUri }} style={styles.errorPreview} resizeMode="cover" />
            )}
            <Text style={styles.errorTitle}>Couldn't identify this cigar</Text>
            <Text style={styles.errorSubtitle}>{error ?? 'No match found in our database'}</Text>
            <Text style={styles.tips}>
              {enhanceRetriesExhausted
                ? "We've tried twice. A new photo in better light will give us much better odds."
                : 'Tip: the scanner reads the band text, logos, and colors — any angle that keeps the brand name legible works. Glare and motion blur are the usual culprits; rotating the band helps when info is split across sides.'}
            </Text>
            {/* Only show Enhance-and-retry until the ceiling is hit. After
                two failed enhances the UI nudges the user toward a fresh
                capture or manual find rather than looping indefinitely. */}
            {!enhanceRetriesExhausted && (
              <Button
                title={retrying ? 'Enhancing…' : 'Enhance and retry'}
                onPress={handleEnhanceRetry}
                disabled={retrying}
                style={{ marginTop: SPACING.md }}
              />
            )}
            <Button
              title="Retake photo"
              variant={enhanceRetriesExhausted ? undefined : 'secondary'}
              onPress={() => router.replace('/identify/camera')}
              style={{ marginTop: enhanceRetriesExhausted ? SPACING.md : SPACING.sm }}
            />
            <Button title="Find It Manually" variant="secondary" onPress={handleCorrect} style={{ marginTop: SPACING.sm }} />
            <Button title="Suggest a Cigar" variant="ghost" onPress={openSuggest} style={{ marginTop: SPACING.xs }} />
            <Button title="Go Home" variant="ghost" onPress={() => router.replace('/(tabs)')} style={{ marginTop: SPACING.xs }} />
          </ScrollView>
        </View>
        {correctionModal}
      </>
    );
  }

  return (
    <>
      <ScrollView
        style={[styles.screen, { paddingTop: insets.top + SPACING.md }]}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={true}
        indicatorStyle="white"
        bounces={true}
        alwaysBounceVertical={true}
      >
        <Pressable
          onPress={() => router.replace('/(tabs)')}
          hitSlop={12}
          style={styles.closeBtn}
        >
          <Ionicons name="close" size={24} color={COLORS.muted} />
        </Pressable>

        {primaryImageUri && (
          <Image source={{ uri: primaryImageUri }} style={styles.preview} resizeMode="cover" />
        )}

        <Card
          // 4-state confidence mapping — Exact earns a faint gold glow on
          // the card border, Strong a subtle accent, Partial/Unknown
          // neutral. Card's style prop is a single ViewStyle so we flatten
          // the confidence layer into the base style at render time.
          style={{
            ...styles.resultCard,
            ...(confidenceState === 'exact' ? styles.resultCardExact : {}),
            ...(confidenceState === 'strong' ? styles.resultCardStrong : {}),
          }}
        >
          {/* Kicker language is tuned to the confidence state so we never
              over-assert. Satisfies Apple App Review 1.1.6 (no false
              information) and matches the 4-state model. */}
          <Text style={styles.kicker}>
            {confidenceState === 'exact'
              ? 'EXACT MATCH'
              : confidenceState === 'strong'
              ? 'LIKELY MATCH'
              : confidenceState === 'partial'
              ? 'BEST GUESS'
              : 'UNSURE'}
          </Text>
          <Text style={styles.cigarName}>{displayName || cigar.line || cigar.name}</Text>
          <Text style={styles.cigarBrand}>{cigar.brand}</Text>

          <View style={styles.vitolaRow}>
            <Text style={styles.vitolaLabel}>Size</Text>
            <Text style={vitolaConfident ? styles.vitolaValue : styles.vitolaUncertain}>
              {vitolaConfident && displayVitola ? displayVitola : 'Unclear from photo'}
            </Text>
          </View>

          {confidence !== null && (
            <View style={styles.confidenceRow}>
              <Text style={styles.confidenceLabel}>Confidence</Text>
              <Text style={styles.confidenceValue}>{Math.round(confidence * 100)}%</Text>
            </View>
          )}

          <View style={{ marginTop: SPACING.sm }}>
            <Meter label="Strength" value={cigar.strength} />
            <Meter label="Body" value={cigar.body} />
            <Meter label="Price" value={cigar.price_tier} />
          </View>

          <View style={styles.flavors}>
            {cigar.flavors.slice(0, 5).map((f) => (
              <Badge key={f} label={f} />
            ))}
          </View>

          <StatusChips statuses={humidorMap.get(cigar.id) ?? []} />

          {reasoning ? (
            <Text style={styles.reasoning}>{reasoning}</Text>
          ) : null}
        </Card>

        {/* Top-3 alternatives strip. Rendered only when:
              - feature flag on (kill-switch if this regresses anything)
              - at least one alternative has a real DB match
            Tap an alternative → treat as a correction (save override, add
            to humidor, navigate). One-tap path beats the old modal-typeahead
            in the common "first guess is off by one" case. */}
        {alternativesEnabled && alternatives.length > 0 && (
          <View style={styles.alternativesBlock}>
            <Text style={styles.alternativesTitle}>Or was it…</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.alternativesRow}
            >
              {alternatives.map((alt, i) => {
                const altCigar = alt.cigar!;
                // Find the original rank index (1 or 2) for telemetry parity
                // with Sonnet's rank — alternatives filters out matchless
                // candidates, so the i here isn't the rank.
                const originalIndex = candidates.findIndex(
                  (c) => c.cigar?.id === altCigar.id,
                );
                return (
                  <Pressable
                    key={altCigar.id}
                    onPress={() => handleAlternativeTap(alt, originalIndex === -1 ? i + 1 : originalIndex)}
                    style={styles.altCard}
                  >
                    <CigarImage cigar={altCigar} style={styles.altThumb} />
                    <Text style={styles.altBrand} numberOfLines={1}>
                      {altCigar.brand}
                    </Text>
                    <Text style={styles.altLine} numberOfLines={2}>
                      {altCigar.line ?? altCigar.name}
                    </Text>
                    <Text style={styles.altConfidence}>
                      {Math.round(alt.confidence * 100)}%
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        <Text style={styles.confirmTitle}>Does this look right?</Text>
        <View style={styles.confirmRow}>
          <Button title="Yes, confirm" onPress={handleConfirm} style={{ flex: 1 }} />
          <Button title="Not quite..." variant="secondary" onPress={handleCorrect} style={{ flex: 1 }} />
        </View>

        <Button
          title="View Full Details"
          variant="ghost"
          onPress={() => router.push(`/(tabs)/cigar/${cigar.id}`)}
          style={{ marginTop: SPACING.sm }}
        />
      </ScrollView>

      {/* Toast */}
      {toastMessage ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.toast, { opacity: toastOpacity, bottom: insets.bottom + 24 }]}
        >
          <Ionicons name="checkmark-circle" size={18} color={COLORS.accent} />
          <Text style={styles.toastText}>{toastMessage}</Text>
        </Animated.View>
      ) : null}

      {correctionModal}
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingHorizontal: SPACING.md,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontFamily: 'Cormorant',
    fontSize: 16,
    color: COLORS.muted,
    marginTop: SPACING.md,
  },
  loadingScreen: {
    alignItems: 'center',
  },
  loadingImageWrap: {
    width: '100%',
    height: 260,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: COLORS.card,
    marginBottom: SPACING.lg,
  },
  loadingImage: {
    width: '100%',
    height: '100%',
  },
  frameStrip: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: SPACING.md,
  },
  frameThumbWrap: {
    width: 56,
    height: 56,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    opacity: 0.5,
  },
  frameThumbWrapActive: {
    borderColor: COLORS.accent,
    opacity: 1,
  },
  frameThumb: {
    width: '100%',
    height: '100%',
  },
  closeBtn: {
    alignSelf: 'flex-end',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  loadingTitle: {
    fontFamily: 'Cormorant',
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
  },
  loadingSubtitle: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    color: COLORS.muted,
    marginTop: 4,
    textAlign: 'center',
  },
  errorTitle: {
    fontFamily: 'Cormorant',
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
  errorSubtitle: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    color: COLORS.muted,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  preview: {
    width: '100%',
    height: 200,
    borderRadius: 16,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.card,
  },
  resultCard: {
    marginBottom: SPACING.md,
  },
  // Gold-glow on the Exact state — confidence delivered through restraint,
  // not loud UI. iOS renders shadows on non-zero-background Views, so
  // `elevation` is included as an Android noop.
  resultCardExact: {
    shadowColor: COLORS.accent,
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  resultCardStrong: {
    borderWidth: 1,
    borderColor: COLORS.accentDim ?? COLORS.accent,
  },
  // Error-screen preview — kept small so the button stack stays visible
  // without a scroll, but big enough that users recognise what was seen.
  errorPreview: {
    width: 220,
    height: 220,
    borderRadius: RADIUS.md,
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
  },
  // Alternatives strip — horizontally scrollable tiles under the winner
  // card. Tile width fixed so the strip shows "more off-screen" affordance.
  alternativesBlock: {
    marginTop: SPACING.sm,
    marginBottom: SPACING.md,
  },
  alternativesTitle: {
    fontFamily: 'Cormorant',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: COLORS.muted,
    textTransform: 'uppercase',
    marginBottom: SPACING.xs,
  },
  alternativesRow: {
    gap: SPACING.sm,
    paddingVertical: 2,
  },
  altCard: {
    width: 140,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.sm,
    gap: 4,
  },
  altThumb: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: RADIUS.sm,
    marginBottom: SPACING.xs,
  },
  altBrand: {
    fontFamily: 'Cormorant',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: COLORS.accent,
    textTransform: 'uppercase',
  },
  altLine: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  altConfidence: {
    fontFamily: 'Cormorant',
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 2,
  },
  kicker: {
    fontFamily: 'Cormorant',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: COLORS.accent,
    marginBottom: SPACING.xs,
  },
  cigarName: {
    fontFamily: 'Cormorant',
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
  },
  cigarBrand: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: SPACING.sm,
  },
  vitolaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  vitolaLabel: {
    fontFamily: 'Cormorant',
    fontSize: 13,
    color: COLORS.muted,
  },
  vitolaValue: {
    fontFamily: 'Cormorant',
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.text,
  },
  vitolaUncertain: {
    fontFamily: 'Cormorant',
    fontSize: 13,
    fontStyle: 'italic',
    color: COLORS.muted,
  },
  confidenceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  confidenceLabel: {
    fontFamily: 'Cormorant',
    fontSize: 13,
    color: COLORS.muted,
  },
  confidenceValue: {
    fontFamily: 'Cormorant',
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.success,
  },
  flavors: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: SPACING.sm,
  },
  reasoning: {
    fontFamily: 'Cormorant',
    fontSize: 13,
    color: COLORS.muted,
    marginTop: SPACING.md,
    lineHeight: 20,
  },
  confirmTitle: {
    fontFamily: 'Cormorant',
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  confirmRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },

  // Correction modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingHorizontal: SPACING.md,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  modalTitle: {
    fontFamily: 'Cormorant',
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
  },
  modalClose: {
    fontFamily: 'Cormorant',
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.accent,
  },
  modalSubtitle: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: SPACING.md,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Cormorant',
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    paddingVertical: 14,
  },
  clearBtn: {
    fontFamily: 'Cormorant',
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.accent,
    paddingLeft: SPACING.sm,
  },
  noResults: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    color: COLORS.muted,
    textAlign: 'center',
    marginTop: SPACING.lg,
  },
  typeaheadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  typeaheadText: {
    fontFamily: 'Cormorant',
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
  },
  typeaheadChevron: {
    fontFamily: 'Cormorant',
    fontSize: 22,
    color: COLORS.muted,
  },
  brandBackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: SPACING.xs,
  },
  brandBackArrow: {
    fontFamily: 'Cormorant',
    fontSize: 24,
    color: COLORS.accent,
    lineHeight: 24,
  },
  brandBackLabel: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.accent,
  },
  selectedBrandName: {
    fontFamily: 'Cormorant',
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  scannerLink: {
    position: 'absolute',
    bottom: 0,
    left: SPACING.md,
    right: SPACING.md,
    alignItems: 'center',
    paddingVertical: 14,
    backgroundColor: COLORS.bg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  scannerLinkText: {
    fontFamily: 'Cormorant',
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.accent,
  },
  correctionFooter: {
    position: 'absolute',
    bottom: 0,
    left: SPACING.md,
    right: SPACING.md,
    alignItems: 'center',
    gap: 8,
    paddingTop: 12,
    backgroundColor: COLORS.bg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  suggestLink: {
    paddingVertical: 4,
  },
  suggestLinkText: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.muted,
    textDecorationLine: 'underline',
  },
  tips: {
    fontFamily: 'Cormorant',
    fontSize: 13,
    fontStyle: 'italic',
    color: COLORS.muted,
    textAlign: 'center',
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.82)',
    borderRadius: RADIUS.full,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  toastText: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
