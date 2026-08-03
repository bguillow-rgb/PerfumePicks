import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
  KeyboardAvoidingView,
  Keyboard,
  BackHandler,
  Platform,
  Animated,
  Easing,
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
import { PickerSearch, type ResultOrigin } from '@/src/components/dna/PickerSearch';
import { buildDnaPicks } from '@/src/features/dna/pickerSearch';
import { requestEnrichment } from '@/src/features/dna/enrichRequests';

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
  const searchPickedIds = useDnaPickerStore((s) => s.searchPickedIds);
  const pinned = useDnaPickerStore((s) => s.pinned);
  const pickFromSearch = useDnaPickerStore((s) => s.pickFromSearch);

  const [step, setStep] = useState<Step>('loading');
  const [pool, setPool] = useState<PickerCandidate[]>([]);
  // Full greedy-ordered recognizable list; we lazy-reveal `visibleCount` of it.
  const [list, setList] = useState<PickerCandidate[]>([]);
  const [visibleCount, setVisibleCount] = useState(PICKER_GRID_SIZE);
  const [dna, setDna] = useState<FragranceDNA | null>(null);
  const [recs, setRecs] = useState<RankedDnaRec[]>([]);
  const [hero, setHero] = useState<BuyableRankResult | null>(null);

  // ── Picker search ("bring your own bottle", M4) view state ─────────────────
  const [searchOpen, setSearchOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The docking flight: a searched tile lifts off the shelf and settles into
  // slot 0 of the grid (~280ms translate+scale) with the gold brought-in ring.
  const [dockFlight, setDockFlight] = useState<PickerCandidate | null>(null);
  const dockAnim = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const dockScale = useRef(new Animated.Value(0.6)).current;
  const gridWrapRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Fresh start every time the front door opens — the store reset also clears
  // searchPickCache, searchPickedIds, and pinned; the search field itself is
  // component state and starts collapsed/empty.
  useEffect(() => {
    resetPicker();
    setSearchOpen(false);
  }, [resetPicker]);

  // Don't leave a toast timer running after unmount.
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

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
    // Search-sourced picks additionally carry the deliberate weight
    // (SEARCH_DELIBERATE_WEIGHT × favorite) as an explicit pick.weight —
    // resolvePickWeight uses it verbatim (see buildDnaPicks).
    const picks: DnaPick[] = buildDnaPicks({ selectedIds, favoriteId, searchPickedIds, byId });

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
  }, [pool, searchPickCache, selectedIds, favoriteId, searchPickedIds, hardNoIds, commitDerived, computeBuyableHero]);

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
    (id: string, from?: string) => {
      useTasteProfileStore.getState().commitDraft();
      endRetake();
      completeOnboarding();
      router.replace('/(tabs)');
      requestAnimationFrame(() => {
        // `from=dna_reveal` tags the top-match open so the destination can fire
        // the dupe moment at peak intent (Lever 1 handoff).
        router.push(from ? `/fragrance/${id}?from=${from}` : `/fragrance/${id}`);
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
  // Approximate rendered tile height (image aspect 0.82 + labels + padding) —
  // used only to scroll a dupe's existing tile into view.
  const tileH = tileW / 0.82 + 51;

  // Pinned (search-docked) tiles are PREPENDED to the visible slice and are
  // never dropped by the lazy reveal — they aren't part of `list`, so
  // visibleCount can't cut them. Defensive de-dupe in case a pinned bottle
  // ever appears in the offered list (dupes are promoted, not pinned).
  const visible = useMemo(() => {
    const slice = list.slice(0, visibleCount);
    if (pinned.length === 0) return slice;
    const pinnedIds = new Set(pinned.map((p) => p.id));
    return [...pinned, ...slice.filter((f) => !pinnedIds.has(f.id))];
  }, [list, visibleCount, pinned]);

  // ── Picker search ("bring your own bottle", M4) ─────────────────────────────

  const showToast = useCallback(
    (msg: string) => {
      setToast(msg);
      toastOpacity.stopAnimation();
      if (toastTimer.current) clearTimeout(toastTimer.current);
      Animated.timing(toastOpacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      toastTimer.current = setTimeout(() => {
        Animated.timing(toastOpacity, { toValue: 0, duration: 350, useNativeDriver: true }).start(
          () => setToast(null),
        );
      }, 2200);
    },
    [toastOpacity],
  );

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    track(EVENTS.SEARCH_OPENED, { pick_count: selectedIds.length });
  }, [selectedIds.length]);

  // Collapse clears the query/shelf (inside PickerSearch), keeps every pick.
  const closeSearch = useCallback(() => {
    Keyboard.dismiss();
    setSearchOpen(false);
  }, []);

  // Back collapses search FIRST — never exits onboarding. Android hardware
  // back; on iOS the flow has no back affordance except the retake ✕, which
  // gets the same collapse-first treatment below.
  useEffect(() => {
    if (!searchOpen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeSearch();
      return true;
    });
    return () => sub.remove();
  }, [searchOpen, closeSearch]);

  /** Scroll the grid so the tile for `id` is on screen (dupe-promotion case). */
  const scrollToTile = useCallback(
    (id: string) => {
      const pinnedIds = new Set(pinned.map((p) => p.id));
      const listIdx = list.findIndex((c) => c.id === id && !pinnedIds.has(c.id));
      // Make sure the tile is actually mounted before scrolling to it.
      if (listIdx >= 0 && listIdx + pinned.length >= visibleCount) {
        setVisibleCount(Math.min(listIdx + pinned.length + PICKER_GRID_SIZE, list.length));
      }
      const displayIdx = listIdx >= 0 ? pinned.length + listIdx : 0;
      const row = Math.floor(displayIdx / COLS);
      const y = Math.max(0, SPACING.sm + row * (tileH + gap) - tileH / 2);
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ y, animated: true }));
    },
    [list, pinned, visibleCount, tileH, gap],
  );

  /** The docking: fly the picked tile from the shelf into slot 0 of the grid. */
  const runDockFlight = useCallback(
    (f: PickerCandidate, origin: ResultOrigin | null) => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      if (!origin) return; // no measurable origin → tile simply appears pinned
      gridWrapRef.current?.measureInWindow((gx, gy) => {
        const target = { x: gx + SPACING.lg, y: gy + SPACING.sm };
        dockAnim.setValue({ x: origin.x - tileW / 2, y: origin.y - tileW / 2 });
        dockScale.setValue(0.6);
        setDockFlight(f);
        Animated.parallel([
          Animated.timing(dockAnim, {
            toValue: target,
            duration: 280,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(dockScale, {
            toValue: 1,
            duration: 280,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]).start(() => setDockFlight(null));
      });
    },
    [dockAnim, dockScale, tileW],
  );

  const handleSearchPick = useCallback(
    (f: PickerCandidate, origin: ResultOrigin | null) => {
      const inGrid = list.some((c) => c.id === f.id);
      const outcome = pickFromSearch(f, inGrid);
      track(EVENTS.SEARCH_RESULT_PICKED, { fragrance_id: f.id, in_grid: inGrid, outcome });
      switch (outcome) {
        case 'max':
          // Cap guard: warning buzz, no dock; query stays editable.
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          showToast('Five is the max. Remove one to add this.');
          return;
        case 'promoted':
          // Dupe of a grid tile: no second tile — select the existing one
          // (gold ring = promoted to deliberate weight) and bring it on screen.
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          closeSearch();
          scrollToTile(f.id);
          showToast('Already on your wall. Selected it for you.');
          return;
        case 'docked':
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          closeSearch();
          runDockFlight(f, origin);
          return;
        case 'noop':
          // Already selected + already gold — just show them the tile.
          closeSearch();
          scrollToTile(f.id);
          return;
      }
    },
    [list, pickFromSearch, showToast, closeSearch, scrollToTile, runDockFlight],
  );

  const handleEnrichRequest = useCallback(
    (f: PickerCandidate) => {
      track(EVENTS.SEARCH_ENRICH_REQUESTED, { fragrance_id: f.id });
      void requestEnrichment(f.id);
      showToast(`Noted. We'll prioritize ${f.name}.`);
    },
    [showToast],
  );

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
        onContinue={() => (heroId ? handleRecOpen(heroId, 'dna_reveal') : finishOnboarding())}
        onViewDetails={(id) => handleRecOpen(id)}
        onSeeMoreMatches={() => router.push('/dna/matches')}
        // Back returns to the picker to adjust picks. Selections persist (the
        // store isn't reset here), and it can't escape onboarding — the grid's
        // cancel ✕ stays retake-only.
        onBack={() => setStep('grid')}
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
      {/* KeyboardAvoidingView keeps the footer CTA visible + tappable above the
          keyboard while the search field is focused (mobile-UX audit rule). */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <View style={styles.gridHeader}>
        {retakeMode && (
          <Pressable
            // Back collapses search first — the ✕ only cancels the retake once
            // the search field is already closed.
            onPress={searchOpen ? closeSearch : cancelRetake}
            hitSlop={12}
            style={styles.cancelRetake}
            accessibilityLabel={searchOpen ? 'Close search' : 'Cancel retake'}
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
                ? `Five picked, that's the max. Continue when ready.`
                : `${selectedCount} picked. Add a few more, or continue.`}
        </Text>
        <PickerSearch
          open={searchOpen}
          onOpen={openSearch}
          onClose={closeSearch}
          onPick={handleSearchPick}
          onEnrichRequest={handleEnrichRequest}
        />
      </View>

      <View style={styles.flex} ref={gridWrapRef} collapsable={false}>
      <ScrollView
        key="dna-grid-scroll"
        ref={scrollRef}
        contentContainerStyle={[styles.grid, { paddingBottom: SPACING.xl }]}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={64}
        keyboardShouldPersistTaps="handled"
        testID="dna-picker-grid"
      >
        {visible.map((f, idx) => {
          const isSel = selectedIds.includes(f.id);
          const isFav = favoriteId === f.id;
          const isPinned = idx < pinned.length;
          // Gold "brought-in" ring: search-sourced picks only, while selected.
          // Inset + distinct from the flush accent tileSel border on grid picks.
          const isGold = isSel && searchPickedIds.includes(f.id);
          return (
            <Pressable
              key={f.id}
              testID={isPinned ? 'dna-tile-pinned' : 'dna-tile'}
              onPress={() => handleTap(f.id)}
              onLongPress={isPinned ? undefined : () => handleLongPress(f.id)}
              delayLongPress={350}
              style={[
                styles.tile,
                { width: tileW },
                isSel && !isGold && styles.tileSel,
                // Deselected brought-in bottle: stays pinned, reads dormant.
                isPinned && !isSel && styles.tileGhost,
              ]}
              accessibilityLabel={`${f.brand} ${f.name}`}
            >
              <Image source={{ uri: f.image_url }} style={styles.tileImg} contentFit="cover" />
              <Text style={styles.tileBrand} numberOfLines={1}>{f.brand}</Text>
              <Text style={styles.tileName} numberOfLines={1}>{f.name}</Text>

              {isGold && <View pointerEvents="none" style={styles.tileGoldRing} testID="dna-tile-gold-ring" />}
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
      </View>

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
      </KeyboardAvoidingView>

      {/* The docking flight: the picked tile lifting off the shelf into slot 0. */}
      {dockFlight && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.dockFlight,
            { width: tileW },
            { transform: [...dockAnim.getTranslateTransform(), { scale: dockScale }] },
          ]}
        >
          <Image source={{ uri: dockFlight.image_url }} style={styles.tileImg} contentFit="cover" />
          <View pointerEvents="none" style={styles.tileGoldRing} />
        </Animated.View>
      )}

      {/* Quiet toast — max-picks warning, dupe promotion, enrich "Noted". */}
      {toast && (
        <Animated.View
          pointerEvents="none"
          style={[styles.toast, { opacity: toastOpacity, bottom: insets.bottom + 96 }]}
          testID="dna-search-toast"
        >
          <Text style={styles.toastText}>{toast}</Text>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  flex: { flex: 1 },
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
  // Gold "brought-in" ring (search-sourced picks): thin INSET ring, visibly
  // distinct from the flush tileSel border — the mark of the bottle you brought.
  tileGoldRing: {
    position: 'absolute',
    top: 2,
    left: 2,
    right: 2,
    bottom: 2,
    borderWidth: 2,
    borderColor: COLORS.accent,
    borderRadius: RADIUS.md - 2,
  },
  // Deselected search-docked tile: stays pinned for the session, greyed.
  tileGhost: { opacity: 0.45 },
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

  // The docking flight overlay (window coordinates — translate via dockAnim).
  dockFlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 6,
    overflow: 'hidden',
  },

  toast: {
    position: 'absolute',
    left: SPACING.lg,
    right: SPACING.lg,
    backgroundColor: COLORS.overlay,
    borderRadius: RADIUS.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  toastText: { ...TYPE.bodySmall, color: COLORS.white, textAlign: 'center' },
});
