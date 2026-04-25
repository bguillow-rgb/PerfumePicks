import {
  View, Text, StyleSheet, Image, ScrollView, ActivityIndicator, Alert,
  Modal, TextInput, FlatList, Pressable, Keyboard, Animated,
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
import { supabase } from '@/lib/supabase';
import { identifyCigar } from '@/src/features/identify/identifyService';
import { Card } from '@/src/components/ui/Card';
import { Badge } from '@/src/components/ui/Badge';
import { Meter } from '@/src/components/ui/Meter';
import { Button } from '@/src/components/ui/Button';
import { COLORS, SPACING, FONTS, RADIUS } from '@/src/constants/theme';
import { useHumidorStatuses } from '@/src/hooks/useHumidorStatuses';
import { StatusChips } from '@/src/components/ui/StatusChip';
import type { Cigar } from '@/src/types/cigar';

function ShimmerOverlay() {
  const pos = useSharedValue(-1);
  useEffect(() => {
    pos.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
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

export default function IdentifyResultScreen() {
  const params = useLocalSearchParams<{ imageUri?: string; imageUris?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

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
      } catch (e: any) {
        const msg = e?.message ?? 'Failed to identify cigar';
        if (msg.includes('credit balance') || msg.includes('billing')) {
          setError('Cigar scanning is temporarily unavailable. Please try again later.');
        } else {
          setError(msg);
        }
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
            <Pressable
              style={[styles.scannerLink, { marginBottom: insets.bottom + SPACING.md }]}
              onPress={() => {
                setShowCorrection(false);
                router.replace('/identify/camera');
              }}
            >
              <Text style={styles.scannerLinkText}>Back to Scanner</Text>
            </Pressable>
          )}
        </View>
      </Modal>
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
          <View style={[styles.center, { flex: 1 }]}>
            <Text style={styles.errorTitle}>Couldn't identify this cigar</Text>
            <Text style={styles.errorSubtitle}>{error ?? 'No match found in our database'}</Text>
            <Button title="Find It Manually" onPress={handleCorrect} style={{ marginTop: SPACING.md }} />
            <Button title="Try Again" variant="secondary" onPress={() => router.replace('/identify/camera')} style={{ marginTop: SPACING.sm }} />
            <Button title="Go Home" variant="ghost" onPress={() => router.replace('/(tabs)')} style={{ marginTop: SPACING.sm }} />
          </View>
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

        <Card style={styles.resultCard}>
          <Text style={styles.kicker}>IDENTIFIED</Text>
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

        <Text style={styles.confirmTitle}>Is this correct?</Text>
        <View style={styles.confirmRow}>
          <Button title="Yes, that's it!" onPress={handleConfirm} style={{ flex: 1 }} />
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
        <Animated.View style={[styles.toast, { opacity: toastOpacity, bottom: insets.bottom + 24 }]}>
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
  toast: {
    position: 'absolute',
    left: SPACING.lg,
    right: SPACING.lg,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingVertical: 12,
    paddingHorizontal: SPACING.md,
    alignItems: 'center',
  },
  toastText: {
    fontFamily: 'Cormorant',
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.bg,
  },
});
