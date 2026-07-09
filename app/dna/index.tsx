import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING, TYPE, FONTS, RADIUS } from '@/src/constants/theme';
import { useCatalogStore, type Fragrance } from '@/src/stores/useCatalogStore';
import { useOnboardingStore } from '@/src/stores/useOnboardingStore';
import { useDnaPickerStore } from '@/src/stores/useDnaPickerStore';
import { useDnaPickerEnabled, useDnaV3ArchetypesEnabled } from '@/src/features/dna/killSwitch';
import { FirstRunFlow } from '@/src/components/onboarding/FirstRunFlow';
import {
  buildPickerList,
  PICKER_GRID_SIZE,
  MAX_PICKS,
  type PickerCandidate,
} from '@/src/features/quiz/pickerGrid';
import { deriveFragranceDNA } from '@/src/features/dna/deriveDna';
import { deriveDnaFromAnswers } from '@/src/features/dna/deriveDnaFromAnswers';
import {
  rankWithRelaxation,
  rankBuyableMatches,
  type RankedDnaRec,
  type BuyableRankResult,
} from '@/src/features/dna/score';
import type { DnaCatalogFragrance, DnaPick, FragranceDNA } from '@/src/features/dna/types';
import { useQuizStore } from '@/src/stores/useQuizStore';
import { ReadingState } from '@/src/components/dna/ReadingState';
import { DnaRevealScreen } from '@/src/components/dna/DnaRevealScreen';
import { useTasteProfileStore } from '@/src/stores/useTasteProfileStore';
import { useRetailerLinksStore } from '@/src/stores/useRetailerLinksStore';
import { useDnaPickStreamStore } from '@/src/stores/useDnaPickStreamStore';
import { track, EVENTS } from '@/src/lib/observability';

type Step = 'loading' | 'grid' | 'reading' | 'reveal' | 'fallback';

/** Minimum visual duration of the "Reading your palate" beat (compute is instant). */
const READING_MIN_MS = 1400;

export default function DnaPickerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const pickerEnabled = useDnaPickerEnabled();
  // Resolve the V3 archetype flag while the user is in the picker so the sync
  // cache (v3Flag.ts) is settled by compute time. The hook's value isn't read
  // here — deriveFragranceDNA reads the cache directly.
  useDnaV3ArchetypesEnabled();
  const hasExistingDna = useTasteProfileStore((s) => !!s.dna);
  const completeOnboarding = useOnboardingStore((s) => s.complete);
  const retakeMode = useOnboardingStore((s) => s.retakeMode);
  const endRetake = useOnboardingStore((s) => s.endRetake);
  const fetchPickerCandidates = useCatalogStore((s) => s.fetchPickerCandidates);

  const selectedIds = useDnaPickerStore((s) => s.selectedIds);
  const favoriteId = useDnaPickerStore((s) => s.favoriteId);
  const toggleSelect = useDnaPickerStore((s) => s.toggleSelect);
  const addHardNo = useDnaPickerStore((s) => s.addHardNo);
  const setFavorite = useDnaPickerStore((s) => s.setFavorite);
  const resetPicker = useDnaPickerStore((s) => s.reset);

  const hardNoIds = useDnaPickerStore((s) => s.hardNoIds);
  const searchPickCache = useDnaPickerStore((s) => s.searchPickCache);

  const [step, setStep] = useState<Step>('loading');
  const [pool, setPool] = useState<PickerCandidate[]>([]);
  // Full greedy-ordered recognizable list; we lazy-reveal `visibleCount` of it.
  const [list, setList] = useState<PickerCandidate[]>([]);
  const [visibleCount, setVisibleCount] = useState(PICKER_GRID_SIZE);
  const [dna, setDna] = useState<FragranceDNA | null>(null);
  const [recs, setRecs] = useState<RankedDnaRec[]>([]);
  const [hero, setHero] = useState<BuyableRankResult | null>(null);

  // Fresh start every time the front door opens.
  useEffect(() => {
    resetPicker();
  }, [resetPicker]);

  // Load the candidate pool and build the full ordered list once.
  useEffect(() => {
    let alive = true;
    (async () => {
      const candidates = (await fetchPickerCandidates(3)) as unknown as PickerCandidate[];
      if (!alive) return;
      const ordered = buildPickerList(candidates);
      setPool(candidates);
      setList(ordered);
      // Preload the first batch so the required first screen doesn't pop-in.
      Image.prefetch(ordered.slice(0, PICKER_GRID_SIZE).map((c) => c.image_url).filter(Boolean));
      // Warm the retailer-link index NOW (fire-and-forget) while the user picks
      // tiles, so the buyable-match ranking at compute time awaits an already-
      // resolved load instead of paying the full pagination cost at the reveal.
      void useRetailerLinksStore.getState().load();
      setStep(ordered.length > 0 ? 'grid' : 'fallback');
    })();
    return () => {
      alive = false;
    };
  }, [fetchPickerCandidates]);

  // Remote kill-switch → drop to the question fallback.
  useEffect(() => {
    if (!pickerEnabled) setStep('fallback');
  }, [pickerEnabled]);

  // Commit a freshly-derived DNA to the durable store. First run → commit
  // immediately (so Today is seeded even if the user backgrounds during the
  // reveal). Retake → write to a DRAFT and leave the live DNA untouched, so the
  // re-viewable "My DNA" home keeps showing the OLD archetype until the user
  // finishes the new reveal (atomic retake — readers never see a half state).
  const commitDerived = useCallback((computed: FragranceDNA) => {
    const store = useTasteProfileStore.getState();
    if (store.dna) store.setDraft(computed);
    else store.setDna(computed);
  }, []);

  const finishOnboarding = useCallback(() => {
    // Promote any pending retake draft → live DNA (no-op on first run).
    useTasteProfileStore.getState().commitDraft();
    endRetake();
    completeOnboarding();
    router.replace('/(tabs)');
  }, [completeOnboarding, endRetake, router]);

  // Abort an in-progress retake: drop the draft, leave the live DNA untouched,
  // and return to the You tab. Onboarding's no-back front door provides this
  // explicit escape only in retake mode (swipe-back stays off for the flow).
  const cancelRetake = useCallback(() => {
    useTasteProfileStore.getState().retake();
    endRetake();
    router.replace('/(tabs)');
  }, [endRetake, router]);

  // Compute the affiliate-first top match for the reveal (DNA flow v2 M2). Awaits
  // the FULL retailer-link load before ranking (Mark Z's load-before-rank
  // contract: a half-loaded index silently demotes buyable bottles to the
  // no-buyable fallback). Gates ONLY on loaded===true; on any load failure
  // (offline / demo mode / mid-pagination blip) it degrades to a top-fit,
  // no-buy fallback hero rather than ranking against a partial index. Stashes the
  // result both locally (this screen's reveal) and in the taste store (so the
  // canonical page + /dna/matches read the same ranking).
  const computeBuyableHero = useCallback(
    async (computed: FragranceDNA, recPool: DnaCatalogFragrance[]): Promise<void> => {
      await useRetailerLinksStore.getState().load();
      const loaded = useRetailerLinksStore.getState().loaded;
      let result: BuyableRankResult;
      if (loaded) {
        result = rankBuyableMatches(
          recPool,
          computed,
          (f) => useRetailerLinksStore.getState().getBuyable(f.id),
        );
      } else {
        const top = rankWithRelaxation(recPool, computed).recs[0];
        result = {
          hero: top
            ? { fragrance: top.fragrance, score: top.score, reasons: top.reasons, buyable: null }
            : null,
          matches: [],
          fallbackUsed: true,
        };
      }
      if (result.fallbackUsed) {
        track(EVENTS.DNA_TOP_MATCH_NO_BUYABLE, {
          source: computed.source,
          links_loaded: loaded,
          pool_size: recPool.length,
        });
      }
      setHero(result);
      useTasteProfileStore.getState().setCelebrateHero(result);
    },
    [],
  );

  // S3 — pre-compute the DNA the instant the user leaves the picker, then cover
  // the (instant) compute with the "Reading your palate" beat. Completion-gated:
  // we transition to the reveal once compute is done AND the min beat elapses,
  // so the reveal lands as a moment but never hangs.
  const startCompute = useCallback(() => {
    setStep('reading');
    const startedAt = Date.now();

    // Resolve picker ids → catalog fragrances (every Fragrance satisfies the
    // DnaCatalogFragrance structural subset the engine reads). The offered pool
    // is merged with the search-pick cache (bottles picked via catalog search,
    // M4) — without the merge, any pick not in the offered pool was silently
    // dropped here and never reached the DNA (the compute-lookup trap).
    const byId = new Map<string, PickerCandidate>();
    for (const f of pool) byId.set(f.id, f);
    for (const f of Object.values(searchPickCache)) byId.set(f.id, f);

    // Every picker selection is a pure TASTE signal: relation 'like'. The user is
    // telling us what they're drawn to, not cataloguing bottles they own. 'like'
    // feeds the DNA at full weight (pickWeight treats any non-'want' as 1.0) but
    // is deliberately NOT seeded into the wardrobe. This replaces the old refine
    // step whose 'own' default silently wrote phantom owned bottles into the
    // wardrobe (corrupting deriveWardrobe). The wardrobe is populated through
    // explicit add paths (scan, manual add, detail "Add to Wardrobe"), not here.
    const picks: DnaPick[] = selectedIds
      .map((id) => byId.get(id))
      .filter((f): f is PickerCandidate => !!f)
      .map((f) => ({
        fragrance: f as unknown as DnaCatalogFragrance,
        relation: 'like',
        favorite: favoriteId === f.id,
      }));

    const avoided = hardNoIds
      .map((id) => byId.get(id))
      .filter((f): f is PickerCandidate => !!f)
      .map((f) => f as unknown as DnaCatalogFragrance);

    // The full offered pool is the reference for relative trait scoring — it's
    // what makes WHICH bottles the user picked (vs everything they were shown)
    // actually move the archetype, instead of everyone landing crowd-pleaser.
    const referencePool = pool.map((f) => f as unknown as DnaCatalogFragrance);
    const { dna: computed, events } = deriveFragranceDNA({ picks, referencePool, avoided, source: 'picker' });
    if (events.includes('dna_compute_failed')) {
      track(EVENTS.DNA_COMPUTE_FAILED, { pick_count: picks.length });
    }

    // First-match pool: every recognizable candidate the user didn't pick or reject.
    const exclude = new Set([...selectedIds, ...hardNoIds]);
    const recPool = pool
      .filter((f) => !exclude.has(f.id))
      .map((f) => f as unknown as DnaCatalogFragrance);
    const { recs: ranked } = rankWithRelaxation(recPool, computed);
    if (ranked.length === 0) {
      track(EVENTS.DNA_FIRST_REC_EMPTY_POOL, { source: 'picker', pool_size: recPool.length });
    }

    setDna(computed);
    setRecs(ranked);

    // Commit to the durable store the instant it's derived (synchronous, so
    // Today is seeded even offline; a debounced Supabase mirror trails it). On
    // a retake this lands in a draft and commits atomically when the user
    // finishes the reveal.
    commitDerived(computed);

    // Capture the privacy-clean pick-stream for later cohort training (M10).
    useDnaPickStreamStore.getState().recordRun({ seeds: computed.seeds, source: computed.source });

    // Rank the affiliate-first top match, THEN reveal — gated on both the hero
    // compute and the min reading beat so the reveal never shows an empty card
    // that pops in a beat later.
    void computeBuyableHero(computed, recPool).finally(() => {
      const wait = Math.max(0, READING_MIN_MS - (Date.now() - startedAt));
      setTimeout(() => setStep('reveal'), wait);
    });
  }, [pool, searchPickCache, selectedIds, favoriteId, hardNoIds, commitDerived, computeBuyableHero]);

  // S1b — the non-recognizer / kill-switch path. The 3 seed answers (already in
  // useQuizStore from FirstRunFlow) choose representative seeds and run through
  // the SAME orchestrator, so the question path emits the identical v2 envelope.
  const handleFallbackComplete = useCallback(() => {
    setStep('reading');
    const startedAt = Date.now();

    const answers = useQuizStore.getState().answers;
    const poolFrags = pool.map((f) => f as unknown as DnaCatalogFragrance);
    const { dna: computed, events } = deriveDnaFromAnswers(answers, poolFrags);
    if (events.includes('dna_compute_failed')) {
      track(EVENTS.DNA_COMPUTE_FAILED, { source: 'question_fallback' });
    }

    const { recs: ranked } = rankWithRelaxation(poolFrags, computed);
    if (ranked.length === 0) {
      track(EVENTS.DNA_FIRST_REC_EMPTY_POOL, { source: 'question_fallback', pool_size: poolFrags.length });
    }

    setDna(computed);
    setRecs(ranked);
    commitDerived(computed);
    useDnaPickStreamStore.getState().recordRun({ seeds: computed.seeds, source: computed.source });

    // Question-fallback path has no excluded picks: the whole pool is rankable.
    void computeBuyableHero(computed, poolFrags).finally(() => {
      const wait = Math.max(0, READING_MIN_MS - (Date.now() - startedAt));
      setTimeout(() => setStep('reveal'), wait);
    });
  }, [pool, commitDerived, computeBuyableHero]);

  // Continuing from the reveal opens the top match's full detail page: finish
  // onboarding (free — the activation spine, never paywalled), land in the app,
  // then push the detail on top one frame later so the push isn't dropped on the
  // pre-swap navigator (replacing the root stack + pushing in the same tick
  // races — the push hits the pre-swap navigator and is silently dropped).
  const handleRecOpen = useCallback(
    (id: string) => {
      useTasteProfileStore.getState().commitDraft();
      endRetake();
      completeOnboarding();
      router.replace('/(tabs)');
      requestAnimationFrame(() => {
        router.push(`/fragrance/${id}`);
      });
    },
    [completeOnboarding, endRetake, router],
  );

  // Lazy-reveal the next batch as the user nears the bottom — the whole
  // recognizable pool is reachable by scrolling, no reshuffle needed.
  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (visibleCount >= list.length) return;
      const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
      const distanceToBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
      if (distanceToBottom < 500) {
        const next = Math.min(visibleCount + PICKER_GRID_SIZE, list.length);
        Image.prefetch(list.slice(visibleCount, next).map((c) => c.image_url).filter(Boolean));
        setVisibleCount(next);
      }
    },
    [visibleCount, list],
  );

  const handleTap = useCallback(
    (id: string) => {
      // Cap selections at MAX_PICKS — block (with a warning buzz) only when
      // adding a NEW pick past the ceiling; de-selecting always works.
      if (!selectedIds.includes(id) && selectedIds.length >= MAX_PICKS) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      toggleSelect(id);
    },
    [selectedIds, toggleSelect],
  );

  const handleLongPress = useCallback(
    (id: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      addHardNo(id);
      // Drop the rejected tile from the list entirely.
      setList((l) => l.filter((c) => c.id !== id));
    },
    [addHardNo],
  );

  const handleFavorite = useCallback(
    (id: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setFavorite(favoriteId === id ? null : id);
    },
    [favoriteId, setFavorite],
  );

  const selectedCount = selectedIds.length;
  const COLS = 3;
  const gap = SPACING.sm;
  const tileW = (width - SPACING.lg * 2 - gap * (COLS - 1)) / COLS;

  const visible = useMemo(() => list.slice(0, visibleCount), [list, visibleCount]);

  if (step === 'fallback') {
    return (
      <FirstRunFlow
        visible
        onQuizComplete={handleFallbackComplete}
        onDone={finishOnboarding}
      />
    );
  }

  if (step === 'reading') {
    return <ReadingState />;
  }

  if (step === 'reveal' && dna) {
    // Prefer the monetizable top match (hero) for the forward CTA + detail open;
    // fall back to the first fit-rec, then to simply finishing onboarding.
    const heroId = hero?.hero?.fragrance.id ?? recs[0]?.fragrance.id ?? null;
    return (
      <DnaRevealScreen
        dna={dna}
        hero={hero}
        // Continue / card tap opens the top match's full detail page directly
        // (onboarding completes, lands in the app with detail on top). No
        // separate "first match" interstitial — it was redundant with the home
        // DNA card and its label read wrong on a retake.
        onContinue={() => (heroId ? handleRecOpen(heroId) : finishOnboarding())}
        onViewDetails={(id) => handleRecOpen(id)}
        onSeeMoreMatches={() => router.push('/dna/matches')}
      />
    );
  }

  if (step === 'loading') {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.accent} />
        </View>
      </SafeAreaView>
    );
  }

  // ── S1 grid (the required front door) ────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.gridHeader}>
        {retakeMode && (
          <Pressable
            onPress={cancelRetake}
            hitSlop={12}
            style={styles.cancelRetake}
            accessibilityLabel="Cancel retake"
            testID="dna-retake-cancel"
          >
            <Ionicons name="close" size={24} color={COLORS.muted} />
          </Pressable>
        )}
        <Text style={styles.cursive}>{hasExistingDna ? 'retake' : "let's begin"}</Text>
        <Text style={styles.title}>Pick the ones you love</Text>
        <Text style={styles.sub}>
          {selectedCount === 0
            ? 'Scroll and tap up to five you recognize and love. Three makes this sharp.'
            : selectedCount === 1
              ? 'Nice. One or two more makes this sharper.'
              : selectedCount >= MAX_PICKS
                ? `Five picked — that's the max. Continue when ready.`
                : `${selectedCount} picked. Add a few more, or continue.`}
        </Text>
      </View>

      <ScrollView
        key="dna-grid-scroll"
        contentContainerStyle={[styles.grid, { paddingBottom: SPACING.xl }]}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={64}
        testID="dna-picker-grid"
      >
        {visible.map((f) => {
          const isSel = selectedIds.includes(f.id);
          const isFav = favoriteId === f.id;
          return (
            <Pressable
              key={f.id}
              testID="dna-tile"
              onPress={() => handleTap(f.id)}
              onLongPress={() => handleLongPress(f.id)}
              delayLongPress={350}
              style={[styles.tile, { width: tileW }, isSel && styles.tileSel]}
              accessibilityLabel={`${f.brand} ${f.name}`}
            >
              <Image source={{ uri: f.image_url }} style={styles.tileImg} contentFit="cover" />
              <Text style={styles.tileBrand} numberOfLines={1}>{f.brand}</Text>
              <Text style={styles.tileName} numberOfLines={1}>{f.name}</Text>

              {isSel && (
                <View style={styles.checkBadge}>
                  <Ionicons name="checkmark" size={13} color={COLORS.white} />
                </View>
              )}
              {isSel && (
                <Pressable
                  testID="dna-tile-favorite"
                  onPress={() => handleFavorite(f.id)}
                  hitSlop={8}
                  style={styles.favCorner}
                  accessibilityLabel="Mark favorite"
                >
                  <Ionicons
                    name={isFav ? 'star' : 'star-outline'}
                    size={16}
                    color={isFav ? COLORS.accent : COLORS.white}
                  />
                </Pressable>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.escapes}>
        <Pressable onPress={() => setStep('fallback')} hitSlop={8} style={styles.escapeBtn} testID="dna-new-to-fragrance">
          <Text style={styles.escapeText} numberOfLines={1}>New to fragrance?</Text>
        </Pressable>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + SPACING.sm }]}>
        <Pressable
          style={[styles.cta, selectedCount === 0 && styles.ctaDisabled]}
          disabled={selectedCount === 0}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            startCompute();
          }}
          testID="dna-picker-continue"
        >
          <Text style={styles.ctaText}>
            {selectedCount === 0 ? 'Pick at least one' : 'Read my Fragrance DNA'}
          </Text>
          {selectedCount > 0 && <Ionicons name="arrow-forward" size={15} color={COLORS.white} />}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  gridHeader: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.sm },
  cancelRetake: { alignSelf: 'flex-end', padding: 2, marginBottom: -8 },
  cursive: {
    fontFamily: 'PinyonScript_400Regular',
    fontSize: 30,
    color: COLORS.accent,
    lineHeight: 44,
    paddingLeft: 4,
  },
  title: {
    fontFamily: FONTS.serif,
    fontSize: 28,
    fontWeight: '600',
    color: COLORS.text,
    lineHeight: 34,
  },
  sub: { ...TYPE.bodySmall, color: COLORS.muted, marginTop: 6, lineHeight: 20 },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
  },
  tile: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 6,
    overflow: 'hidden',
  },
  tileSel: { borderColor: COLORS.accent, borderWidth: 2 },
  tileImg: {
    width: '100%',
    aspectRatio: 0.82,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.blushSoft,
  },
  tileBrand: { ...TYPE.caption, marginTop: 5, color: COLORS.muted },
  tileName: { fontFamily: FONTS.serif, fontSize: 13, fontWeight: '600', color: COLORS.text },
  checkBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favCorner: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  escapes: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  escapeBtn: { flexShrink: 1 },
  escapeText: { ...TYPE.bodySmall, color: COLORS.accent, textDecorationLine: 'underline' },

  footer: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.accent,
    paddingVertical: 15,
    borderRadius: RADIUS.full,
  },
  ctaDisabled: { backgroundColor: COLORS.muted, opacity: 0.5 },
  ctaText: { ...TYPE.label, color: COLORS.white, fontSize: 14, letterSpacing: 1 },
});
