import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef, Component } from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, Image, Dimensions, Alert, ActivityIndicator } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS } from 'react-native-reanimated';
import { Stack, useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, TYPE, FONTS, RADIUS } from '@/src/constants/theme';
import { NotePyramid } from '@/src/components/fragrance/NotePyramid';
import { AccordChip } from '@/src/components/fragrance/AccordChip';
import { PerfBar } from '@/src/components/fragrance/PerfBar';
import { FragranceCard } from '@/src/components/fragrance/FragranceCard';
import { AddToWardrobeSheet } from '@/src/components/sheets/AddToWardrobeSheet';
import { LogWearSheet } from '@/src/components/sheets/LogWearSheet';
import { FragranceNotesSheet } from '@/src/components/sheets/FragranceNotesSheet';
import { ReviewSection } from '@/src/components/fragrance/ReviewSection';
import { DupeList } from '@/src/components/fragrance/DupeList';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { handleAffiliateClick } from '@/src/lib/affiliate';
import * as WebBrowser from 'expo-web-browser';
import { CelebritySection } from '@/src/components/fragrance/CelebritySection';
import { LayeringSection } from '@/src/components/fragrance/LayeringSection';
import { ComplimentsSection } from '@/src/components/fragrance/ComplimentsSection';
import {
  useCatalogStore,
  getFragranceFromStore,
  type Fragrance,
  type DupeResult,
  type SimilarResult,
} from '@/src/stores/useCatalogStore';
import { useWardrobeStore } from '@/src/stores/useWardrobeStore';
import { useCompareStore, COMPARE_MAX } from '@/src/stores/useCompareStore';
import { useWearLogStore, type WearLog } from '@/src/stores/useWearLogStore';
import { useFragranceNotesStore } from '@/src/stores/useFragranceNotesStore';
import { useProStore } from '@/src/stores/useProStore';
import { useTasteProfileStore } from '@/src/stores/useTasteProfileStore';
import { routeDnaCta, ctaForKind } from '@/src/features/dna/ctaRouting';
import { track, EVENTS } from '@/src/lib/observability';

const { width: SCREEN_W } = Dimensions.get('window');
const HERO_HEIGHT = SCREEN_W * 1.05;

/**
 * Fragrance detail page — the canonical view of a single fragrance.
 *
 * Pulls from the mock catalog. Real version reads from Supabase + the
 * recommendation engine for "similar" + "dupes" sections.
 */
/** Auto-generate a 2-sentence "About this fragrance" blurb from catalog data. */
function buildAboutCopy(f: Fragrance): string {
  const accord1 = f.top_accords[0] ?? '';
  const accord2 = f.top_accords[1] ?? '';
  const family = f.fragrance_family?.toLowerCase() ?? 'fragrance';
  const note1 = f.top_notes[0] ?? '';
  const note2 = f.top_notes[1] ?? '';
  const longevity = f.community_longevity;
  const sillage = f.community_sillage;
  const longevityDesc = longevity >= 3.5 ? 'long-lasting' : longevity >= 2 ? 'moderate longevity' : 'light-wearing';
  const sillageDesc = sillage >= 3.5 ? 'strong projection' : sillage >= 2 ? 'moderate sillage' : 'skin-close sillage';
  const line1 = `${f.name} is a ${family} built around ${accord1}${accord2 ? ` and ${accord2}` : ''}.`;
  const line2 = note1 && note2
    ? `${longevityDesc.charAt(0).toUpperCase() + longevityDesc.slice(1)} with ${sillageDesc}, opening with ${note1} and ${note2}.`
    : `${longevityDesc.charAt(0).toUpperCase() + longevityDesc.slice(1)} with ${sillageDesc}.`;
  return `${line1} ${line2}`;
}

// ── Error boundary ────────────────────────────────────────────────────────────
// Catches any render-time exception in the detail screen and shows a graceful
// "go back" fallback instead of a white screen. Also logs the error so we can
// track down the root cause without needing a debug build.
class DetailErrorBoundary extends Component<
  { children: React.ReactNode; onReset: () => void },
  { error: Error | null }
> {
  constructor(props: any) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: any) {
    console.error('[FragranceDetail] render error:', error.message, error.stack, info?.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FAF6F0', gap: 16, padding: 32 }}>
          <Text style={{ color: '#2A1F18', fontSize: 16, fontWeight: '600', textAlign: 'center' }}>Something went wrong loading this fragrance.</Text>
          <Text style={{ color: '#9a8478', fontSize: 11, textAlign: 'center' }}>{this.state.error.message}</Text>
          <Pressable
            onPress={() => { this.setState({ error: null }); this.props.onReset(); }}
            style={{ backgroundColor: '#B8924B', borderRadius: 20, paddingHorizontal: 24, paddingVertical: 10 }}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>Go Back</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

function FragranceDetailScreen() {
  const { id, from, openLogWear, intent } = useLocalSearchParams<{ id: string; from?: string; openLogWear?: string; intent?: string }>();
  const router = useRouter();
  // Fragrance lookup: synchronous cache hit if the store already has it
  // (FragranceCard tap from a list pre-cached it). Otherwise async fetch.
  const fetchById = useCatalogStore((s) => s.fetchById);
  const compareIds = useCompareStore((s) => s.ids);
  const toggleCompare = useCompareStore((s) => s.toggle);
  const inCompare = !!id && compareIds.includes(id);
  const fetchDupes = useCatalogStore((s) => s.fetchDupes);
  const fetchDupeCount = useCatalogStore((s) => s.fetchDupeCount);
  const fetchCommunityDupes = useCatalogStore((s) => s.fetchCommunityDupes);
  const fetchSimilars = useCatalogStore((s) => s.fetchSimilars);
  const [fragrance, setFragrance] = useState<Fragrance | undefined>(() =>
    getFragranceFromStore(id ?? ''),
  );
  // Loading flag distinguishes "haven't tried yet" from "tried and got nothing".
  // Without this, the not-found screen renders for one frame on every cold
  // open of a detail page that hasn't been cached yet.
  const [lookupAttempted, setLookupAttempted] = useState(() => !!getFragranceFromStore(id ?? ''));
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    // Always try a fetch — even if the cache hit, this no-ops via the
    // store's in-flight + cache de-dupe.
    fetchById(id).then((row) => {
      if (cancelled) return;
      if (row) setFragrance(row);
      setLookupAttempted(true);
      if (!row && __DEV__) {
        console.warn(`[fragrance-detail] fetchById('${id}') returned undefined — id not in catalog`);
      }
    });
    return () => { cancelled = true; };
  }, [id, fetchById]);

  // Budget Dupes — server-computed, slug-keyed, freemium. get_dupes returns the
  // top FREE_DUPE_LIMIT closest dupes for non-Pro (all for Pro); the public
  // count drives the locked footer ("N more dupes — unlock with Pro").
  const [dupes, setDupes] = useState<DupeResult[]>([]);
  const [dupeCount, setDupeCount] = useState(0);
  // Scroll plumbing so the "Find the dupe" CTA actually jumps to the Budget
  // Dupes section (its down-arrow promises movement — a dead tap is worse than
  // no CTA). scrollRef drives the scroll; dupeSectionY caches the section's
  // measured Y offset from onLayout.
  const scrollRef = useRef<ScrollView>(null);
  const dupeSectionY = useRef(0);
  const scrollToDupes = useCallback(() => {
    scrollRef.current?.scrollTo({ y: Math.max(0, dupeSectionY.current - 12), animated: true });
  }, []);
  useEffect(() => {
    if (!id) { setDupes([]); setDupeCount(0); return; }
    let cancelled = false;
    fetchDupes(id).then((rows) => { if (!cancelled) setDupes(rows); });
    fetchDupeCount(id).then((n) => { if (!cancelled) setDupeCount(n); });
    return () => { cancelled = true; };
  }, [id, fetchDupes, fetchDupeCount]);

  // Community Dupes — the crowd-consensus fallback, shown ONLY when there is no
  // verified (Budget) dupe. Opinion-only, fully visible, explicitly unverified.
  const [communityDupes, setCommunityDupes] = useState<DupeResult[]>([]);
  useEffect(() => {
    // Wait for the verified count to resolve; only fetch community when it's 0,
    // so we never render both surfaces for the same original.
    if (!id || dupeCount > 0) { setCommunityDupes([]); return; }
    let cancelled = false;
    fetchCommunityDupes(id).then((rows) => { if (!cancelled) setCommunityDupes(rows); });
    return () => { cancelled = true; };
  }, [id, dupeCount, fetchCommunityDupes]);

  // "Smells Like" similars — server-computed via get_similars (joins UUID->slug).
  const [similar, setSimilar] = useState<SimilarResult[]>([]);
  useEffect(() => {
    if (!id) { setSimilar([]); return; }
    let cancelled = false;
    fetchSimilars(id).then((rows) => { if (!cancelled) setSimilar(rows); });
    return () => { cancelled = true; };
  }, [id, fetchSimilars]);

  const [wardrobeSheetOpen, setWardrobeSheetOpen] = useState(false);
  const [wardrobeInitStatus, setWardrobeInitStatus] = useState<'have' | 'want'>('have');
  const [wearSheetOpen, setWearSheetOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<WearLog | null>(null);
  const [notesSheetOpen, setNotesSheetOpen] = useState(false);
  const isPro = useProStore((s) => s.isPro);

  // Trait-routed buyer CTA (M6). An explicit `intent` route param (carried from
  // the first rec) wins; otherwise route off the live DNA's strongest buyer
  // trait. Null when the user has no DNA yet (pre-onboarding deep link).
  const liveDna = useTasteProfileStore((s) => s.dna);
  const buyerCta = useMemo(() => {
    let cta;
    if (intent === 'dupe' || intent === 'original' || intent === 'sample') {
      cta = ctaForKind(intent);
    } else {
      cta = liveDna ? routeDnaCta(liveDna.traits.values) : null;
    }
    // Never promise a dupe we don't have. The "Find the dupe" CTA points down to
    // the Budget Dupes section, which only renders when dupeCount > 0 — so if
    // there's no verified dupe, fall back to the safe sample CTA. dupeCount
    // starts at 0 and resolves async, so a dupe-having bottle briefly shows the
    // sample fallback then upgrades to the dupe CTA: it under-promises, never lies.
    if (cta?.kind === 'dupe' && dupeCount === 0) return ctaForKind('sample');
    return cta;
  }, [intent, liveDna, dupeCount]);

  // Auto-open LogWearSheet when navigated with openLogWear=true (e.g. from Today nudge).
  useEffect(() => {
    if (openLogWear === 'true') setWearSheetOpen(true);
  }, [openLogWear]);

  // Live state from the persisted stores so the CTAs reflect reality.
  // Read raw arrays/maps (stable Zustand references) and derive inside useMemo
  // — calling store methods like forFragrance() inside a selector returns a new
  // array every render and causes infinite re-render loops.
  const wardrobeItems = useWardrobeStore((s) => s.items);
  const addToWardrobe = useWardrobeStore((s) => s.add);
  const allLogs = useWearLogStore((s) => s.logs);
  const removeLog = useWearLogStore((s) => s.remove);
  const allNotes = useFragranceNotesStore((s) => s.notes);

  const inWardrobe = useMemo(
    () => fragrance ? wardrobeItems.find((i) => i.fragrance_id === fragrance.id) : undefined,
    [wardrobeItems, fragrance],
  );
  const wearLogs = useMemo(
    () => fragrance
      ? allLogs.filter((l) => l.fragrance_id === fragrance.id).sort((a, b) => b.worn_on.localeCompare(a.worn_on))
      : [],
    [allLogs, fragrance],
  );
  const fragranceNote = useMemo(
    () => fragrance ? (allNotes[fragrance.id] ?? null) : null,
    [allNotes, fragrance],
  );

  // "Similar in your wardrobe" — Jaccard on top notes between viewed fragrance and owned items.
  const similarInWardrobe = useMemo(() => {
    if (!fragrance) return [];
    const myNotes = new Set([...fragrance.top_notes, ...fragrance.heart_notes, ...fragrance.base_notes].map((n) => n.toLowerCase()));
    if (myNotes.size === 0) return [];

    return wardrobeItems
      .filter((i) => i.fragrance_id !== fragrance.id)
      .map((i) => {
        const f = getFragranceFromStore(i.fragrance_id);
        if (!f) return null;
        const theirNotes = new Set([...f.top_notes, ...f.heart_notes, ...f.base_notes].map((n) => n.toLowerCase()));
        const intersection = [...myNotes].filter((n) => theirNotes.has(n)).length;
        const union = new Set([...myNotes, ...theirNotes]).size;
        const jaccard = union > 0 ? intersection / union : 0;
        return { fragrance: f, jaccard };
      })
      .filter((x): x is { fragrance: Fragrance; jaccard: number } => x !== null && x.jaccard > 0.15)
      .sort((a, b) => b.jaccard - a.jaccard)
      .slice(0, 5)
      .map((x) => x.fragrance);
  }, [fragrance, wardrobeItems]);

  // ── Hooks that previously lived after the !fragrance guard ──────────
  // React requires all hooks to be called unconditionally (same order every
  // render). Moving them here fixes the "Rendered more hooks than during the
  // previous render" crash that produced a white screen on cache-miss navigations.
  const [hasCelebrities, setHasCelebrities] = useState(false);
  const [hasReviews, setHasReviews] = useState(false);
  const [hasLayering, setHasLayering] = useState(false);
  const [hasCompliments, setHasCompliments] = useState(false);

  // Stable callbacks — inline `() => setSomeState(true)` recreated every render
  // causes child components' useCallback(load, [onHasData]) to re-run their
  // Supabase queries on every parent re-render (7-8 re-renders per page open
  // = 21+ extra queries and a re-render cascade). useCallback breaks the cycle.
  const onHasCelebrities = useCallback(() => setHasCelebrities(true), []);
  const onHasReviews = useCallback(() => setHasReviews(true), []);
  const onHasLayering = useCallback(() => setHasLayering(true), []);
  const onHasCompliments = useCallback(() => setHasCompliments(true), []);

  const [retailerLinks, setRetailerLinks] = useState<{ retailer: string; url: string; price_cents: number | null }[]>([]);
  useEffect(() => {
    if (!isSupabaseConfigured || !id) return;
    setRetailerLinks([]);
    supabase
      .from('fragrance_retailer_links')
      .select('retailer, url, price_cents, fragrances!inner(slug)')
      .eq('fragrances.slug', id)
      .then(({ data, error }) => {
        if (error) { console.warn('[retailer-links]', error.message); return; }
        if (data?.length) {
          setRetailerLinks(data.map(({ retailer, url, price_cents }) => ({ retailer, url, price_cents })));
          WebBrowser.warmUpAsync().catch(() => {});
        }
      });
  }, [id]);

  const translateX = useSharedValue(0);
  // Reset BEFORE first paint — useEffect fires after paint so the screen
  // would flash white for one frame. useLayoutEffect runs synchronously
  // before the native layer commits the first frame.
  // Reset on mount AND when id changes — Expo Router may reuse this screen
  // instance when navigating between detail pages (params update, no remount),
  // so empty deps [] would leave translateX at SCREEN_W from a previous swipe.
  // Belt-and-suspenders: reset translateX every time this screen gains focus.
  // The swipe-back gesture animates translateX to SCREEN_W then calls router.back().
  // Expo Router reuses this tab-route component — if the user returns to this
  // fragrance (same or different id), translateX is still at SCREEN_W → white screen.
  // useFocusEffect fires synchronously on focus, before the first paint commit.
  useFocusEffect(useCallback(() => { translateX.value = 0; }, []));
  // Belt #2: also reset when id param changes (e.g. tapping a similar fragrance link).
  useLayoutEffect(() => { translateX.value = 0; }, [id]);

  const swipeAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // Stable back handler + gesture — RNGH requires gestures to be stable across
  // renders. Recreating Gesture.Pan() on every render (which happened when it
  // was defined after the guard) forces RNGH to re-attach the handler on every
  // state update, which can corrupt gesture state after several navigations.
  // Quiz results live in the root stack (outside the tab navigator), so a plain
  // router.back() from this tabs-nested detail screen pops to the Today tab
  // instead of returning to the quiz. Route back explicitly when we came from
  // there. (Mirrors the from==='wardrobe' post-add flow below.)
  const goBack = useCallback(() => {
    if (from === 'quiz') { router.replace('/quiz/results'); return; }
    router.back();
  }, [router, from]);
  const swipeBack = useMemo(() =>
    Gesture.Pan()
      .activeOffsetX(15)
      .failOffsetY([-15, 15])
      .onUpdate((e) => {
        if (e.translationX > 0) translateX.value = e.translationX;
      })
      .onEnd((e) => {
        const THRESHOLD = SCREEN_W * 0.35;
        if (e.translationX > THRESHOLD || e.velocityX > 800) {
          translateX.value = withTiming(SCREEN_W, { duration: 180 }, () => {
            // Reset BEFORE navigating back so if the user returns to this screen
            // (same id, no id change), translateX starts at 0 not SCREEN_W.
            translateX.value = 0;
            runOnJS(goBack)();
          });
        } else {
          translateX.value = withSpring(0, { damping: 20, stiffness: 300 });
        }
      }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [goBack]);

  const handleWearLogLongPress = (log: WearLog) => {
    Alert.alert(prettyWearDate(log.worn_on), 'What would you like to do?', [
      {
        text: 'Edit',
        onPress: () => { setEditingLog(log); setWearSheetOpen(true); },
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Delete wear entry?', 'This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => removeLog(log.id) },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  if (!fragrance) {
    // Distinguish "still fetching" from "tried and got nothing." Without
    // this the screen flashes "Fragrance not found" for one frame on
    // every cold-open detail page before the async fetch completes.
    if (!lookupAttempted) {
      return (
        <View style={styles.notFound}>
          <ActivityIndicator color={COLORS.accent} />
        </View>
      );
    }
    return (
      <View style={styles.notFound}>
        <Text style={styles.notFoundText}>Fragrance not found.</Text>
        {__DEV__ && id && (
          <Text style={[styles.notFoundText, { fontSize: 11, opacity: 0.6 }]}>
            [dev] id: {id}
          </Text>
        )}
        <Pressable onPress={() => router.back()} style={styles.notFoundBtn}>
          <Text style={styles.notFoundBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const headlinePrice = (fragrance.retail_msrp_usd_cents / 100).toFixed(0);

  return (
    <GestureDetector gesture={swipeBack}>
    <Animated.View style={[styles.safe, swipeAnimStyle]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView ref={scrollRef} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Image source={{ uri: fragrance.image_url }} style={styles.heroImage} />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.28)', 'rgba(0,0,0,0.62)']}
            locations={[0.4, 0.72, 1]}
            style={styles.heroScrim}
            pointerEvents="none"
          />
          <Pressable
            style={styles.heartBtn}
            onPress={() => {
              // If already in wardrobe, open in edit mode; otherwise add as want
              if (!inWardrobe) setWardrobeInitStatus('want');
              setWardrobeSheetOpen(true);
            }}
          >
            <Ionicons
              name={inWardrobe ? 'heart' : 'heart-outline'}
              size={22}
              color={inWardrobe ? COLORS.accent : COLORS.white}
            />
          </Pressable>

          <View style={styles.heroContent}>
            <Text style={styles.heroBrand}>{fragrance.brand.toUpperCase()}</Text>
            <Text
              style={styles.heroName}
              numberOfLines={3}
              adjustsFontSizeToFit
              minimumFontScale={0.72}
            >{fragrance.name}</Text>
            <View style={styles.heroMeta}>
              <Text style={styles.heroMetaText}>{prettyConcentration(fragrance.concentration)}</Text>
              <Text style={styles.heroMetaDot}>·</Text>
              <Text style={styles.heroMetaText}>{fragrance.fragrance_family}</Text>
              <Text style={styles.heroMetaDot}>·</Text>
              <Text style={styles.heroMetaText}>{fragrance.release_year}</Text>
            </View>
          </View>

        </View>

        {/* ── Action Rail — Buy / Add to Wardrobe / Log a Wear ── */}
        <View style={styles.actionRail}>
          {/* Row 1: Buy — full width */}
          <Pressable
            style={({ pressed }) => [
              styles.actionBtnBuyFull,
              retailerLinks.length === 0 && styles.actionBtnDisabled,
              pressed && { opacity: 0.75 },
            ]}
            disabled={retailerLinks.length === 0}
            onPress={() => retailerLinks.length > 0 && handleAffiliateClick({
              fragrance_id: id,
              retailer: retailerLinks[0].retailer,
              url: retailerLinks[0].url,
              price_cents: retailerLinks[0].price_cents,
              source_screen: 'fragrance_detail_rail',
            })}
          >
            <Ionicons name="bag-outline" size={16} color={retailerLinks.length > 0 ? COLORS.white : COLORS.muted} />
            <Text style={[styles.actionBtnText, retailerLinks.length === 0 && styles.actionBtnTextMuted]}>
              {retailerLinks.length > 0
                ? `Buy from ${retailerLinks[0].retailer}${retailerLinks[0].price_cents ? ` · $${(retailerLinks[0].price_cents / 100).toFixed(0)}` : ''}`
                : 'No retailer link yet'}
            </Text>
          </Pressable>

          {/* Row 2: Wardrobe + Log a Wear */}
          <View style={styles.actionRow2}>
            <Pressable
              style={({ pressed }) => [styles.actionBtnHalf, styles.actionBtnSecondary, pressed && { opacity: 0.75 }]}
              onPress={() => { setWardrobeInitStatus('have'); setWardrobeSheetOpen(true); }}
              accessibilityLabel={inWardrobe ? 'In Wardrobe' : 'Add to Wardrobe'}
            >
              <Ionicons
                name={inWardrobe ? 'checkmark-circle' : 'rose-outline'}
                size={15}
                color={inWardrobe ? COLORS.success : COLORS.text}
              />
              <Text style={[styles.actionBtnText, styles.actionBtnTextDark]}>
                {inWardrobe ? 'In Wardrobe' : 'Add to Wardrobe'}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.actionBtnHalf, styles.actionBtnSecondary, pressed && { opacity: 0.75 }]}
              onPress={() => setWearSheetOpen(true)}
              accessibilityLabel="Log a Wear"
            >
              <Ionicons name="bookmark-outline" size={15} color={COLORS.text} />
              <Text style={[styles.actionBtnText, styles.actionBtnTextDark]}>Log a Wear</Text>
            </Pressable>
          </View>

          {/* Row 3: Compare toggle + open tray */}
          <View style={styles.actionRow2}>
            <Pressable
              style={({ pressed }) => [styles.actionBtnHalf, styles.actionBtnSecondary, inCompare && styles.actionBtnCompareOn, pressed && { opacity: 0.75 }]}
              onPress={() => {
                const ok = toggleCompare(id);
                if (!ok) Alert.alert('Compare full', `You can compare up to ${COMPARE_MAX} at once.`);
              }}
              accessibilityLabel={inCompare ? 'Remove from compare' : 'Add to compare'}
            >
              <Ionicons name={inCompare ? 'checkmark-circle' : 'git-compare-outline'} size={15} color={inCompare ? COLORS.success : COLORS.text} />
              <Text style={[styles.actionBtnText, styles.actionBtnTextDark]}>
                {inCompare ? 'In Compare' : 'Compare'}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.actionBtnHalf, styles.actionBtnSecondary, compareIds.length < 2 && styles.actionBtnDisabled, pressed && { opacity: 0.75 }]}
              onPress={() => {
                if (compareIds.length < 2) {
                  Alert.alert(
                    'Add one more to compare',
                    'Tap “Compare” on at least two fragrances, then “View” opens them side-by-side.',
                  );
                  return;
                }
                router.push('/compare' as any);
              }}
              accessibilityLabel="Open comparison"
            >
              <Ionicons name="albums-outline" size={15} color={compareIds.length < 2 ? COLORS.muted : COLORS.text} />
              <Text style={[styles.actionBtnText, compareIds.length < 2 ? styles.actionBtnTextMuted : styles.actionBtnTextDark]}>
                View ({compareIds.length})
              </Text>
            </Pressable>
          </View>
        </View>

        {/* M6: trait-routed buyer strip. Same bottle, same reasons for everyone
            — only this strip changes by buyer trait (dupe / original / sample).
            For the value-hunter it points down to the Budget Dupes; for the
            luxury/explorer buyer it's a direct buy/sample tap (affiliate). */}
        {buyerCta && (
          <Pressable
            style={styles.buyerStrip}
            testID="dna-routed-cta"
            accessibilityLabel={buyerCta.label}
            disabled={buyerCta.kind !== 'dupe' && retailerLinks.length === 0}
            onPress={() => {
              track(EVENTS.DNA_CTA_TAPPED, { kind: buyerCta.kind, fragrance_id: id, surface: 'fragrance_detail' });
              if (buyerCta.kind === 'dupe') {
                // The down-arrow promises movement — jump to the Budget Dupes
                // section below. It only renders when dupeCount > 0, which is
                // exactly when this CTA shows the dupe kind, so the target exists.
                scrollToDupes();
              } else if (retailerLinks.length > 0) {
                handleAffiliateClick({
                  fragrance_id: id,
                  retailer: retailerLinks[0].retailer,
                  url: retailerLinks[0].url,
                  price_cents: retailerLinks[0].price_cents,
                  source_screen: 'dna_routed_cta',
                });
              }
            }}
          >
            <Ionicons
              name={buyerCta.kind === 'dupe' ? 'pricetags-outline' : buyerCta.kind === 'sample' ? 'flask-outline' : 'diamond-outline'}
              size={18}
              color={COLORS.accent}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.buyerStripLabel} testID={`dna-routed-cta-${buyerCta.kind}`}>{buyerCta.label}</Text>
              <Text style={styles.buyerStripSub}>{buyerCta.sub}</Text>
            </View>
            <Ionicons
              name={buyerCta.kind === 'dupe' ? 'arrow-down' : 'arrow-forward'}
              size={16}
              color={COLORS.muted}
            />
          </Pressable>
        )}

        {wearLogs.length > 0 && (
          <View style={styles.lastWornRow}>
            <Ionicons name="time-outline" size={14} color={COLORS.muted} />
            <Text style={styles.lastWornText}>Last worn {prettyWearDate(wearLogs[0].worn_on)}</Text>
          </View>
        )}

        {/* R13: About this fragrance — top 3 accords + auto-generated identity copy */}
        {fragrance.top_accords.length > 0 && (
          <Section title="About this fragrance" cursive="identity">
            <View style={styles.aboutCard}>
              <View style={styles.aboutAccords}>
                {fragrance.top_accords.slice(0, 3).map((a) => (
                  <View key={a} style={styles.aboutChip}>
                    <Text style={styles.aboutChipText}>{a.replace('-', ' ')}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.aboutCopy}>{buildAboutCopy(fragrance)}</Text>
            </View>
          </Section>
        )}

        {/* R14: Budget Dupes — object-anchored to THIS fragrance, surfaced high
            (right after identity) as the headline "spend less, smell similar"
            hook. Everyone sees the top closest dupe (match % + savings); the
            rest are gated behind a locked Pro footer. Hidden only when the
            catalog genuinely has no dupes for this scent. */}
        {dupeCount > 0 && (
          <View onLayout={(e) => { dupeSectionY.current = e.nativeEvent.layout.y; }}>
            <Section title="Budget Dupes" cursive="spend less, smell similar" testID="budget-dupes">
              <DupeList
                dupes={dupes}
                loading={dupes.length === 0 && dupeCount > 0}
                lockedCount={isPro ? 0 : Math.max(0, dupeCount - dupes.length)}
                onUnlock={() => router.push('/paywall')}
              />
            </Section>
          </View>
        )}

        {/* Community Dupes — the crowd-consensus fallback. Rendered ONLY when
            there's no verified Budget Dupe (dupeCount === 0, enforced by the
            fetch effect) so the two never compete. Explicitly framed as
            unverified community opinion, with no Pro gate (goodwill/coverage). */}
        {dupeCount === 0 && communityDupes.length > 0 && (
          <Section title="Community Dupes" cursive="what the crowd says">
            <View style={styles.communityDisclaimer}>
              <Ionicons name="people-outline" size={13} color={COLORS.muted} />
              <Text style={styles.communityDisclaimerText}>
                Unverified — these are community comparisons, not confirmed matches. Tastes vary; sample before you buy.
              </Text>
            </View>
            <DupeList dupes={communityDupes} />
          </Section>
        )}

        {(fragrance.top_notes.length > 0 || fragrance.heart_notes.length > 0 || fragrance.base_notes.length > 0) && (
          <Section title="Notes" cursive="composition">
            <NotePyramid
              top_notes={fragrance.top_notes}
              heart_notes={fragrance.heart_notes}
              base_notes={fragrance.base_notes}
            />
          </Section>
        )}

        {fragrance.top_accords.length > 0 && (
          <Section title="Accords" cursive="character">
            <View style={styles.accordWrap}>
              {fragrance.top_accords.map((a) => (
                <AccordChip key={a} label={a} intensity={fragrance.accord_intensity[a] ?? 3} />
              ))}
            </View>
          </Section>
        )}

        {/* Only render when the DB actually had performance data. Bottles with
            all-null community_* get neutral 3.0 defaults from the store (so the
            rec engine never sees NaN) — rendering those would be fabricated
            "moderate" bars + fake 50/50/50 scores. has_community_data is
            undefined for mock/custom fragrances → treated as "show". */}
        {(fragrance.has_community_data ?? true) &&
          (fragrance.community_longevity > 0 || fragrance.community_sillage > 0 || fragrance.community_projection > 0) && (
          <Section title="Performance" cursive="how it wears">
            <View style={styles.perfCard}>
              <PerfBar label="Longevity" value={fragrance.community_longevity} />
              <PerfBar label="Sillage" value={fragrance.community_sillage} />
              <PerfBar label="Projection" value={fragrance.community_projection} />
              <View style={styles.scoreRow}>
                <ScoreTile label="Compliments" value={fragrance.compliment_score} />
                <ScoreTile label="Versatility" value={fragrance.versatility_score} />
                <ScoreTile label="Office Safe" value={fragrance.office_safe_score} />
              </View>
            </View>
          </Section>
        )}

        {hasCelebrities && (
          <Section title="Who Wears This" cursive="famous fans">
            <CelebritySection fragranceId={id} onHasData={onHasCelebrities} />
          </Section>
        )}

        {/* Always mount so onHasData fires; display:none hides until data arrives */}
        <View style={hasReviews ? undefined : { display: 'none' }}>
          <Section title="Community Reviews" cursive="what others think">
            <ReviewSection fragranceId={id} onHasData={onHasReviews} />
          </Section>
        </View>

        {similar.length > 0 && (
          <Section title="Smells Like" cursive="discover similar">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
              {similar.map((f) => <FragranceCard key={f.id} fragrance={f} variant="compact" />)}
            </ScrollView>
          </Section>
        )}

        {/* Similar in your wardrobe — Jaccard on notes */}
        {similarInWardrobe.length > 0 && (
          <Section title="Similar in Your Wardrobe" cursive="you own these">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
              {similarInWardrobe.map((f) => <FragranceCard key={f.id} fragrance={f} variant="compact" />)}
            </ScrollView>
          </Section>
        )}

        {(fragrance.retail_msrp_usd_cents > 0 || retailerLinks.length > 0) && <Section title="Pricing" cursive="where to buy">
          <View style={styles.priceCard}>
            {fragrance.retail_msrp_usd_cents > 0 && (
              <View style={styles.priceRow}>
                <View>
                  <Text style={styles.priceLabel}>Retail · 50ml</Text>
                  <Text style={styles.priceValue}>${headlinePrice}</Text>
                </View>
                <View style={styles.priceTier}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <View key={i} style={[styles.priceDot, i < fragrance.price_tier && styles.priceDotActive]} />
                  ))}
                  <Text style={styles.priceTierLabel}>Tier {fragrance.price_tier}</Text>
                </View>
              </View>
            )}
            {retailerLinks.length > 0 && (
              <>
                {fragrance.retail_msrp_usd_cents > 0 && <View style={styles.priceDivider} />}
                <View style={styles.retailerList}>
                  {retailerLinks.map((link, i) => (
                    <Pressable
                      key={i}
                      style={({ pressed }) => [styles.retailerRow, pressed && { opacity: 0.6 }]}
                      onPress={() => handleAffiliateClick({
                        fragrance_id: id,
                        retailer: link.retailer,
                        url: link.url,
                        price_cents: link.price_cents,
                        source_screen: 'fragrance_detail',
                      })}
                    >
                      <Text style={styles.retailerName}>{link.retailer}</Text>
                      {link.price_cents != null && (
                        <Text style={styles.retailerPrice}>${(link.price_cents / 100).toFixed(0)}</Text>
                      )}
                      <Ionicons name="open-outline" size={12} color={COLORS.muted} />
                    </Pressable>
                  ))}
                  <Text style={styles.affiliateDisclosure}>We may earn a commission from purchases.</Text>
                </View>
              </>
            )}
          </View>
        </Section>}

        {/* F6: Private per-fragrance notes */}
        <Section title="My Notes" cursive="private journal">
          <Pressable style={styles.notesCard} onPress={() => setNotesSheetOpen(true)}>
            {fragranceNote && (fragranceNote.body || fragranceNote.occasion_prefs.length > 0 || fragranceNote.layering_logs.length > 0) ? (
              <View style={styles.notesPreview}>
                {fragranceNote.body ? (
                  <Text style={styles.notesBody} numberOfLines={3}>{fragranceNote.body}</Text>
                ) : null}
                {fragranceNote.occasion_prefs.length > 0 && (
                  <View style={styles.notesChipRow}>
                    {fragranceNote.occasion_prefs.slice(0, 4).map((o) => (
                      <View key={o} style={styles.notesChip}>
                        <Text style={styles.notesChipText}>{o}</Text>
                      </View>
                    ))}
                    {fragranceNote.occasion_prefs.length > 4 && (
                      <Text style={styles.notesChipMore}>+{fragranceNote.occasion_prefs.length - 4}</Text>
                    )}
                  </View>
                )}
                {fragranceNote.layering_logs.length > 0 && (
                  <Text style={styles.notesLayeringHint}>
                    {fragranceNote.layering_logs.length} layering combo{fragranceNote.layering_logs.length > 1 ? 's' : ''} saved
                  </Text>
                )}
                <View style={styles.notesEditRow}>
                  <Ionicons name="create-outline" size={14} color={COLORS.accent} />
                  <Text style={styles.notesEditText}>Edit notes</Text>
                </View>
              </View>
            ) : (
              <View style={styles.notesEmpty}>
                <Ionicons name="journal-outline" size={22} color={COLORS.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.notesEmptyTitle}>Add your private notes</Text>
                  <Text style={styles.notesEmptyBody}>Occasions, weather, skin performance, layering combos</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={COLORS.muted} />
              </View>
            )}
          </Pressable>
        </Section>

        {/* Wear log preview — shows up only if the user has logged this
            fragrance before. Encourages re-engagement and shows the data
            captured by the LogWearSheet is being put to use. */}
        {wearLogs.length > 0 && (
          <Section title="Your Wears" cursive={`${wearLogs.length} logged`}>
            <View style={styles.wearList}>
              {wearLogs.slice(0, 5).map((w) => (
                <Pressable
                  key={w.id}
                  style={styles.wearRow}
                  onLongPress={() => handleWearLogLongPress(w)}
                  delayLongPress={400}
                >
                  <Ionicons name="bookmark" size={14} color={COLORS.accent} />
                  <Text style={styles.wearDate}>{prettyWearDate(w.worn_on)}</Text>
                  {w.occasion && <Text style={styles.wearMeta}>· {w.occasion}</Text>}
                  {w.rating != null && (
                    <View style={styles.wearStars}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Ionicons
                          key={i}
                          name={i < w.rating! ? 'star' : 'star-outline'}
                          size={11}
                          color={COLORS.accent}
                        />
                      ))}
                    </View>
                  )}
                  <Ionicons name="ellipsis-horizontal" size={14} color={COLORS.border} style={{ marginLeft: 'auto' }} />
                </Pressable>
              ))}
              {wearLogs.length > 5 && (
                <View style={styles.wearMore}>
                  <Text style={styles.wearMoreText}>+{wearLogs.length - 5} more wears</Text>
                </View>
              )}
            </View>
          </Section>
        )}

        <View style={hasLayering ? undefined : { display: 'none' }}>
          <Section title="Layering" cursive="pair it up">
            <LayeringSection fragranceId={id} onHasData={onHasLayering} />
          </Section>
        </View>

        <View style={hasCompliments ? undefined : { display: 'none' }}>
          <Section title="Compliments" cursive="what they said">
            <ComplimentsSection fragranceId={id} onHasData={onHasCompliments} />
          </Section>
        </View>

        <View style={styles.ctaWrap}>
          {inWardrobe ? (
            <Pressable
              style={[styles.cta, styles.ctaInWardrobe]}
              onPress={() => { setWardrobeInitStatus('have'); setWardrobeSheetOpen(true); }}
              accessibilityLabel="In Your Wardrobe"
            >
              <Ionicons name="checkmark-circle" size={18} color={COLORS.white} style={{ marginRight: 8 }} />
              <Text style={styles.ctaText}>In Your Wardrobe</Text>
            </Pressable>
          ) : (
            <Pressable
              style={styles.cta}
              onPress={() => { setWardrobeInitStatus('have'); setWardrobeSheetOpen(true); }}
              accessibilityLabel="Add to Wardrobe"
            >
              <Ionicons name="rose" size={16} color={COLORS.white} style={{ marginRight: 8 }} />
              <Text style={styles.ctaText}>Add to Wardrobe</Text>
            </Pressable>
          )}
          <Pressable style={styles.secondaryCta} onPress={() => setWearSheetOpen(true)} accessibilityLabel="Log a Wear">
            <Ionicons name="bookmark-outline" size={16} color={COLORS.text} style={{ marginRight: 8 }} />
            <Text style={styles.secondaryCtaText}>Log a Wear</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Fixed back button — outside ScrollView so always visible regardless of scroll depth */}
      <Pressable style={styles.backBtn} onPress={goBack} accessibilityLabel="Back">
        <Ionicons name="chevron-back" size={26} color={COLORS.white} />
      </Pressable>

      <AddToWardrobeSheet
        visible={wardrobeSheetOpen}
        fragrance={fragrance}
        initialStatus={wardrobeInitStatus}
        editItem={inWardrobe ?? null}
        onClose={() => setWardrobeSheetOpen(false)}
        onSaved={() => {
          setWardrobeSheetOpen(false);
          // If user arrived here via the wardrobe "+" flow, navigate back to
          // the wardrobe tab so they see the item they just added.
          if (from === 'wardrobe') router.replace('/(tabs)/wardrobe');
        }}
      />
      <LogWearSheet
        visible={wearSheetOpen}
        fragrance={fragrance}
        editLog={editingLog}
        onClose={() => { setWearSheetOpen(false); setEditingLog(null); }}
        onSaved={() => {
          // Auto-add to wardrobe as 'tested' when the user logs a wear for a
          // fragrance they haven't added yet. This ensures the fragrance shows
          // up in the wardrobe "Tried" filter (which filters by wear count > 0).
          if (!inWardrobe && fragrance && !editingLog) {
            addToWardrobe({ fragrance_id: fragrance.id, status: 'tested', unit_type: 'sample', size_ml: 0, remaining_ml: 0 });
          }
        }}
      />
      <FragranceNotesSheet
        visible={notesSheetOpen}
        fragrance={fragrance}
        onClose={() => setNotesSheetOpen(false)}
      />
    </Animated.View>
    </GestureDetector>
  );
}

export default function FragranceDetailScreenWithBoundary() {
  const router = useRouter();
  return (
    <DetailErrorBoundary onReset={() => router.back()}>
      <FragranceDetailScreen />
    </DetailErrorBoundary>
  );
}

function prettyWearDate(iso: string): string {
  // "2026-04-25" → "Apr 25" / "today" / "yesterday"
  // Use local date arithmetic to avoid UTC-offset bugs near midnight.
  const localToday = new Date().toLocaleDateString('en-CA'); // "YYYY-MM-DD" in local tz
  if (iso === localToday) return 'today';
  const d = new Date(iso + 'T00:00:00');
  const prevDay = new Date(); prevDay.setDate(prevDay.getDate() - 1);
  if (iso === prevDay.toLocaleDateString('en-CA')) return 'yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function Section({ title, cursive, children, testID }: { title: string; cursive?: string; children: React.ReactNode; testID?: string }) {
  return (
    <View style={styles.section} testID={testID}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {cursive && <Text style={styles.sectionCursive}>{cursive}</Text>}
      </View>
      {children}
    </View>
  );
}

function ScoreTile({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.scoreTile}>
      <Text style={styles.scoreValue}>{Math.round(value * 100)}</Text>
      <Text style={styles.scoreLabel}>{label}</Text>
    </View>
  );
}

function prettyConcentration(c: string): string {
  return ({ parfum: 'Parfum', edp: 'Eau de Parfum', edt: 'Eau de Toilette', cologne: 'Cologne', extrait: 'Extrait' } as any)[c] ?? c;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  container: { paddingBottom: SPACING.xxl * 1.5 },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg, gap: SPACING.lg },
  notFoundText: { ...TYPE.body },
  notFoundBtn: { backgroundColor: COLORS.accent, paddingHorizontal: SPACING.xl, paddingVertical: 12, borderRadius: RADIUS.full },
  notFoundBtnText: { color: COLORS.white, fontWeight: '600' },

  actionRail: {
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  actionBtnBuyFull: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 14,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.accent,
  },
  actionRow2: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  actionBtnHalf: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: RADIUS.full,
  },
  actionBtnSecondary: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  actionBtnDisabled: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  actionBtnCompareOn: {
    borderColor: COLORS.success,
  },
  actionBtnText: {
    ...TYPE.label,
    fontSize: 12,
    letterSpacing: 0.5,
    color: COLORS.white,
  },
  actionBtnTextMuted: {
    color: COLORS.muted,
  },
  actionBtnTextDark: {
    color: COLORS.text,
  },

  hero: {
    width: SCREEN_W, height: HERO_HEIGHT,
    backgroundColor: COLORS.card2,
    overflow: 'hidden',
  },
  heroImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  heroScrim: { ...StyleSheet.absoluteFillObject },
  backBtn: {
    position: 'absolute', top: 56, left: SPACING.lg,
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.32)',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 10,
  },
  heartBtn: {
    position: 'absolute', top: 56, right: SPACING.lg,
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.32)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroContent: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: SPACING.lg },
  heroBrand: { ...TYPE.eyebrow, color: COLORS.accentSoft, marginBottom: 6 },
  heroName: { fontFamily: FONTS.serif, fontWeight: '700', fontSize: 30, color: COLORS.white, lineHeight: 36, marginBottom: SPACING.sm },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroMetaText: { ...TYPE.caption, color: COLORS.white, opacity: 0.9 },
  heroMetaDot: { color: COLORS.white, opacity: 0.6 },
  lastWornRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.md,
  },
  lastWornText: { ...TYPE.caption, color: COLORS.muted },

  buyerStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.accent,
    backgroundColor: COLORS.blushSoft,
  },
  buyerStripLabel: { ...TYPE.label, fontSize: 14, color: COLORS.text },
  buyerStripSub: { ...TYPE.caption, color: COLORS.muted, marginTop: 1 },

  section: { paddingHorizontal: SPACING.lg, marginTop: SPACING.xl },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: SPACING.md },
  sectionTitle: { ...TYPE.heading },
  sectionCursive: { fontFamily: 'PinyonScript_400Regular', fontSize: 22, color: COLORS.accent, lineHeight: 34, paddingLeft: 6 },
  hScroll: { paddingRight: SPACING.lg },

  accordWrap: {
    flexDirection: 'row', flexWrap: 'wrap',
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.lg,
  },

  perfCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.lg,
  },
  scoreRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  scoreTile: {
    flex: 1, alignItems: 'center', padding: SPACING.md,
    backgroundColor: COLORS.card2,
    borderRadius: RADIUS.md,
  },
  scoreValue: { fontFamily: FONTS.serif, fontSize: 28, fontWeight: '700', color: COLORS.accent, lineHeight: 34 },
  scoreLabel: { ...TYPE.eyebrow, fontSize: 9, marginTop: 2, textAlign: 'center' },

  priceCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.lg,
  },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  priceLabel: { ...TYPE.eyebrow, marginBottom: 4 },
  priceValue: { fontFamily: FONTS.serif, fontSize: 32, fontWeight: '700', color: COLORS.text, lineHeight: 36 },
  priceTier: { alignItems: 'flex-end', gap: 6 },
  priceDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.border, marginLeft: 4 },
  priceDotActive: { backgroundColor: COLORS.accent },
  priceTierLabel: { ...TYPE.caption, marginTop: 4 },
  priceDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.md },
  priceFootnote: { ...TYPE.bodySmall, color: COLORS.muted, fontStyle: 'italic' },
  retailerList: { gap: 8 },
  retailerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  retailerName: { ...TYPE.label, fontSize: 13, color: COLORS.text, flex: 1 },
  retailerPrice: { ...TYPE.body, fontSize: 15, fontWeight: '600', color: COLORS.accent },
  affiliateDisclosure: { ...TYPE.caption, fontSize: 9, color: COLORS.subtle, marginTop: 6, fontStyle: 'italic' },

  ctaWrap: { paddingHorizontal: SPACING.lg, marginTop: SPACING.xl, gap: SPACING.sm },
  cta: {
    backgroundColor: COLORS.accent,
    paddingVertical: 16,
    borderRadius: RADIUS.full,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  ctaInWardrobe: { backgroundColor: COLORS.success },
  ctaText: { ...TYPE.label, color: COLORS.white, letterSpacing: 2 },
  wearList: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
    paddingVertical: 6,
  },
  wearRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: SPACING.md, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  wearDate: { ...TYPE.body, fontWeight: '600' },
  wearMeta: { ...TYPE.bodySmall },
  wearStars: { flexDirection: 'row', gap: 1 },
  wearMore: { paddingHorizontal: SPACING.md, paddingVertical: 8 },
  wearMoreText: { ...TYPE.caption, color: COLORS.muted, fontStyle: 'italic' },
  secondaryCta: {
    backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.border,
    paddingVertical: 16, borderRadius: RADIUS.full,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  secondaryCtaText: { ...TYPE.label, letterSpacing: 1.5 },
  sectionTeaser: { ...TYPE.bodySmall, color: COLORS.subtle, fontStyle: 'italic' },

  // R13: About this fragrance
  aboutCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.lg,
    gap: SPACING.md,
    marginRight: SPACING.lg,
  },
  aboutAccords: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  aboutChip: {
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.blushSoft,
    borderWidth: 1, borderColor: COLORS.accent,
  },
  aboutChipText: { ...TYPE.label, fontSize: 12, color: COLORS.accent, letterSpacing: 0.5 },
  aboutCopy: { ...TYPE.bodySmall, color: COLORS.muted, lineHeight: 20, fontStyle: 'italic' },

  communityDisclaimer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginBottom: SPACING.sm,
  },
  communityDisclaimerText: {
    ...TYPE.bodySmall,
    flex: 1,
    color: COLORS.muted,
    lineHeight: 17,
    fontStyle: 'italic',
  },

  notesCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.lg,
  },
  notesEmpty: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  notesEmptyTitle: { ...TYPE.body, fontWeight: '600', marginBottom: 2 },
  notesEmptyBody: { ...TYPE.bodySmall, color: COLORS.muted },
  notesPreview: { gap: SPACING.sm },
  notesBody: { ...TYPE.body, lineHeight: 22 },
  notesChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  notesChip: {
    paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: COLORS.accentSoft,
    borderRadius: RADIUS.full,
  },
  notesChipText: { fontSize: 11, color: COLORS.burgundy, fontWeight: '600', letterSpacing: 0.3 },
  notesChipMore: { ...TYPE.caption, color: COLORS.muted, alignSelf: 'center' },
  notesLayeringHint: { ...TYPE.bodySmall, color: COLORS.muted, fontStyle: 'italic' },
  notesEditRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  notesEditText: { ...TYPE.caption, color: COLORS.accent, fontWeight: '600' },
});
