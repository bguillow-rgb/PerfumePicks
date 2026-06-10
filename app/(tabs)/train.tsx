import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Dimensions, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
  useAnimatedReaction,
  type SharedValue,
} from 'react-native-reanimated';
import { COLORS, SPACING, TYPE, FONTS, RADIUS } from '@/src/constants/theme';
import { useCatalogStore, type Fragrance } from '@/src/stores/useCatalogStore';
import { useSwipeStore, FREE_DAILY_SWIPE_LIMIT } from '@/src/stores/useSwipeStore';
import { useProStore } from '@/src/stores/useProStore';
import { recomputeTasteProfile } from '@/src/lib/sync/useAppSync';

/**
 * Train My Nose — swipe right to love, down to like, left to pass.
 *
 * Each swipe feeds the user's taste profile so home-screen recommendations
 * sharpen over time. Session state is local; swipes are persisted to
 * useSwipeStore after each commit.
 */

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_W * 0.32;
const SWIPE_DOWN_THRESHOLD = SCREEN_H * 0.28;
const MAX_ROTATE_DEG = 12;
const LIKE_COLOR = '#C4788A';
const LOVE_COLOR = '#E53935';
const CARD_IMAGE_H = Math.round(SCREEN_W * 0.54); // shrunk image — info panel gets the rest
const PAGE_SIZE = 500;
const PREFETCH_AT = 80;

interface SessionStats {
  loved: number;
  liked: number;
  passed: number;
}

// App is feminine-focused — masculine excluded from all surfaces.
type GenderFilter = 'all' | 'feminine' | 'unisex';
const GENDER_CYCLE: GenderFilter[] = ['all', 'feminine', 'unisex'];
const GENDER_LABEL: Record<GenderFilter, string> = {
  all: 'All', feminine: 'For Her', unisex: 'Unisex',
};

/**
 * TrainScreen — outer shell only. Handles the pre-session state (Intro,
 * daily-limit check). All Reanimated hooks live in SwipeSession below so
 * they are only initialised when the user explicitly starts a session.
 *
 * Why this matters: useSharedValue + useAnimatedReaction register native
 * UI-thread worklets on first mount. When the Train tab is lazily mounted
 * for the very first time, this initialisation blocks the initial React
 * paint and the tab shows blank for several seconds before Intro appears.
 * Moving the heavy hooks into a child component that only mounts on "Begin"
 * makes the Intro render instant.
 */
export default function TrainScreen() {
  const router = useRouter();
  const [started, setStarted] = useState(false);

  const isPro = useProStore((s) => s.isPro);
  const dailySwipeCount = useSwipeStore((s) => s.dailySwipeCount);
  const dailySwipeDate = useSwipeStore((s) => s.dailySwipeDate);
  const today = new Date().toLocaleDateString('en-CA');

  const dailyLimitReached = useMemo(() => {
    if (isPro) return false;
    return dailySwipeDate === today && dailySwipeCount >= FREE_DAILY_SWIPE_LIMIT;
  }, [isPro, dailySwipeCount, dailySwipeDate, today]);

  if (!started) {
    return (
      <Intro
        onStart={() => setStarted(true)}
        onClose={() => router.navigate('/')}
        dailyLimitReached={dailyLimitReached}
        onUpgrade={() => router.push('/paywall')}
        onViewProfile={() => router.push('/taste-profile' as any)}
      />
    );
  }

  return (
    <SwipeSession
      isPro={isPro}
      dailyLimitReached={dailyLimitReached}
      onExit={() => setStarted(false)}
      onUpgrade={() => router.push('/paywall')}
    />
  );
}

/** All Reanimated hooks + session state. Only mounts after "Begin a Session". */
function SwipeSession({ isPro, dailyLimitReached, onExit, onUpgrade }: {
  isPro: boolean;
  dailyLimitReached: boolean;
  onExit: () => void;
  onUpgrade: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [stats, setStats] = useState<SessionStats>({ loved: 0, liked: 0, passed: 0 });
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('all');
  const [lastAction, setLastAction] = useState<'pass' | 'like' | 'love' | null>(null);
  const [liveDir, setLiveDir] = useState<'none' | 'left' | 'right' | 'down'>('none');
  const [exitModalVisible, setExitModalVisible] = useState(false);
  const [sessionSavedVisible, setSessionSavedVisible] = useState(false);
  const [accordToast, setAccordToast] = useState<string | null>(null);
  const accordToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reanimated shared values — only created when session is active
  const sharedDragX = useSharedValue(0);
  const sharedDragY = useSharedValue(0);

  useAnimatedReaction(
    () => {
      const x = sharedDragX.value;
      const y = sharedDragY.value;
      if (y > SWIPE_DOWN_THRESHOLD * 0.35) return 'down' as const;
      if (x > SWIPE_THRESHOLD * 0.35) return 'right' as const;
      if (x < -SWIPE_THRESHOLD * 0.35) return 'left' as const;
      return 'none' as const;
    },
    (cur, prev) => { if (cur !== prev) runOnJS(setLiveDir)(cur); },
  );

  const recordToStore = useSwipeStore((s) => s.record);
  const dailySwipeCount = useSwipeStore((s) => s.dailySwipeCount);
  const dailySwipeDate = useSwipeStore((s) => s.dailySwipeDate);
  const today = new Date().toLocaleDateString('en-CA');
  const usedToday = dailySwipeDate === today ? dailySwipeCount : 0;

  const fetchEnriched = useCatalogStore((s) => s.fetchEnriched);

  // ── Paginated deck ────────────────────────────────────────────────────────
  const [deck, setDeck] = useState<Fragrance[]>([]);
  const [deckReady, setDeckReady] = useState(false);
  const [deckError, setDeckError] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const prefetchingRef = useRef(false);
  const nextPageRef = useRef(0);
  const [restartKey, setRestartKey] = useState(0);

  const loadPage = useCallback(async (pageNum: number, genders: string[]) => {
    if (prefetchingRef.current) return;
    prefetchingRef.current = true;
    if (pageNum > 0) setLoadingMore(true);
    try {
      const rows = await fetchEnriched(PAGE_SIZE, pageNum * PAGE_SIZE, genders);
      if (rows.length < PAGE_SIZE) setHasMore(false);
      // Snapshot already-swiped at fetch time — in-session swipes don't affect deck ordering
      const snapshot = useSwipeStore.getState().swipes;
      if (pageNum === 0) {
        if (!rows.length) { setDeckError(true); setDeckReady(true); return; }
        setDeck(shuffle(rows.filter((f) => !snapshot[f.id])));
        setDeckReady(true);
      } else {
        setDeck((prev) => {
          const existing = new Set(prev.map((f) => f.id));
          return [...prev, ...shuffle(rows.filter((f) => !snapshot[f.id] && !existing.has(f.id)))];
        });
      }
      nextPageRef.current = pageNum + 1;
    } catch {
      if (pageNum === 0) { setDeckError(true); setDeckReady(true); }
    } finally {
      prefetchingRef.current = false;
      setLoadingMore(false);
    }
  }, [fetchEnriched]);

  // Reset + load page 0 on mount, gender filter change, or restart
  useEffect(() => {
    setDeck([]);
    setDeckReady(false);
    setDeckError(false);
    setHasMore(true);
    nextPageRef.current = 0;
    prefetchingRef.current = false;
    setIndex(0);
    const genders = genderFilter === 'all' ? ['feminine', 'unisex'] : [genderFilter];
    loadPage(0, genders);
  // restartKey intentionally triggers a fresh load when session restarts
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genderFilter, restartKey]);

  // Prefetch next page when approaching the end of current deck
  useEffect(() => {
    if (!deckReady || !hasMore || prefetchingRef.current) return;
    if (index >= deck.length - PREFETCH_AT) {
      const genders = genderFilter === 'all' ? ['feminine', 'unisex'] : [genderFilter];
      loadPage(nextPageRef.current, genders);
    }
  }, [index, deck.length, deckReady, hasMore, genderFilter, loadPage]);
  // ─────────────────────────────────────────────────────────────────────────

  const recordSwipe = useCallback((dir: 'left' | 'right' | 'down', fragrance?: Fragrance) => {
    const action: 'pass' | 'like' | 'love' = dir === 'right' ? 'love' : dir === 'down' ? 'like' : 'pass';
    setLastAction(action);
    setLiveDir('none');
    sharedDragX.value = 0;
    sharedDragY.value = 0;
    setTimeout(() => setLastAction(null), 450);
    setStats((s) => {
      if (dir === 'right') return { ...s, loved: s.loved + 1 };
      if (dir === 'down')  return { ...s, liked: s.liked + 1 };
      return { ...s, passed: s.passed + 1 };
    });
    setIndex((i) => i + 1);
    Haptics.impactAsync(
      dir === 'right' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
    );
    if (fragrance) {
      // Left swipe is a neutral "pass", not a rejection — record it as 'skip'
      // (unweighted in the taste profile) so skipping undecided scents doesn't
      // train the engine to avoid those notes.
      const storeAction = dir === 'right' ? 'love' : dir === 'down' ? 'like' : 'skip';
      recordToStore(fragrance.id, storeAction);
      // Accord feedback toast — only for positive swipes, shows top accord
      if (dir !== 'left' && fragrance.top_accords?.[0]) {
        const accord = fragrance.top_accords[0];
        setAccordToast(accord);
        if (accordToastTimer.current) clearTimeout(accordToastTimer.current);
        accordToastTimer.current = setTimeout(() => setAccordToast(null), 1800);
      }
    }
  }, [recordToStore]);

  const handleClose = useCallback(() => {
    if (index > 0) {
      setExitModalVisible(true);
    } else {
      onExit();
    }
  }, [index, onExit]);

  const endSessionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (endSessionTimer.current) clearTimeout(endSessionTimer.current);
    if (accordToastTimer.current) clearTimeout(accordToastTimer.current);
  }, []);

  const handleEndSession = useCallback(() => {
    // Recompute the taste profile from this session's swipes so the profile
    // screen and recommendations reflect them (fire-and-forget; upsert is async).
    recomputeTasteProfile().catch(() => {});
    setSessionSavedVisible(true);
    endSessionTimer.current = setTimeout(() => {
      setSessionSavedVisible(false);
      onExit();
    }, 2200);
  }, [onExit]);

  if (!deckReady) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.headerRow}>
          <Pressable onPress={onExit}>
            <Ionicons name="close" size={26} color={COLORS.text} />
          </Pressable>
          <Text style={styles.eyebrow}>TASTE SESSION</Text>
          <View style={{ width: 26 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={COLORS.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (deckError) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.headerRow}>
          <Pressable onPress={onExit}>
            <Ionicons name="close" size={26} color={COLORS.text} />
          </Pressable>
          <Text style={styles.eyebrow}>TASTE SESSION</Text>
          <View style={{ width: 26 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl, gap: SPACING.lg }}>
          <Ionicons name="wifi-outline" size={40} color={COLORS.muted} />
          <Text style={[styles.summaryHeadline, { fontSize: 22 }]}>Couldn't load fragrances</Text>
          <Text style={[styles.body, { marginBottom: 0 }]}>Check your connection and try again.</Text>
          <Pressable style={styles.cta} onPress={() => {
            setDeckError(false);
            loadPage(0, genderFilter === 'all' ? ['feminine', 'unisex'] : [genderFilter]);
          }}>
            <Text style={styles.ctaText}>Try Again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const atEnd = index >= deck.length;
  const done = atEnd && !hasMore;
  const waitingForMore = atEnd && (hasMore || loadingMore);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>

      {/* Exit confirmation modal */}
      <Modal visible={exitModalVisible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.exitModal}>
            <Text style={styles.exitModalTitle}>
              You loved {stats.loved} and liked {stats.liked} so far.
            </Text>
            <Text style={styles.exitModalBody}>Exit and save your progress, or keep going?</Text>
            <Pressable
              style={styles.exitModalBtnPrimary}
              onPress={() => {
                setExitModalVisible(false);
                handleEndSession();
              }}
            >
              <Text style={styles.exitModalBtnPrimaryText}>Save & Exit</Text>
            </Pressable>
            <Pressable
              style={styles.exitModalBtnSecondary}
              onPress={() => setExitModalVisible(false)}
            >
              <Text style={styles.exitModalBtnSecondaryText}>Keep Going</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <View style={styles.headerRow}>
        <Pressable onPress={handleClose} accessibilityLabel="Close session">
          <Ionicons name="close" size={26} color={COLORS.text} />
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.eyebrow}>TASTE SESSION</Text>
          {!done && (
            <Text style={styles.counter}>
              {isPro
                ? `${index} swipes this session`
                : `${usedToday} / ${FREE_DAILY_SWIPE_LIMIT} swipes today`}
            </Text>
          )}
        </View>
        <Pressable
          style={[styles.genderPill, genderFilter !== 'all' && styles.genderPillActive]}
          onPress={() => {
            const next = GENDER_CYCLE[(GENDER_CYCLE.indexOf(genderFilter) + 1) % GENDER_CYCLE.length];
            setGenderFilter(next);
          }}
        >
          <Text style={[styles.genderPillText, genderFilter !== 'all' && styles.genderPillTextActive]}>
            {GENDER_LABEL[genderFilter]}
          </Text>
        </Pressable>
      </View>

      {done ? (
        <SessionSummary
          stats={stats}
          onRestart={() => {
            setStats({ loved: 0, liked: 0, passed: 0 });
            setRestartKey((k) => k + 1);
          }}
        />
      ) : waitingForMore ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md }}>
          <ActivityIndicator color={COLORS.accent} />
          <Text style={styles.counter}>Loading more fragrances…</Text>
        </View>
      ) : dailyLimitReached ? (
        <DailyLimitReached onUpgrade={onUpgrade} onBack={onExit} />
      ) : (
        <View style={styles.deckArea}>
          {deck[index + 1] && (
            <BackgroundCard fragrance={deck[index + 1]} />
          )}
          {deck[index] && (
            <SwipeCard
              key={deck[index].id}
              fragrance={deck[index]}
              onCommit={recordSwipe}
              sharedDragX={sharedDragX}
              sharedDragY={sharedDragY}
              showHints={index < 3}
            />
          )}

          <View style={styles.actionRow}>
            <View style={styles.actionItem}>
              <ActionButton
                tone="pass"
                onPress={() => recordSwipe('left', deck[index])}
                lit={liveDir === 'left' || lastAction === 'pass'}
                anyActive={liveDir !== 'none'}
              />
              <Text style={[styles.actionLabel, styles.actionLabelPass, (liveDir === 'left' || lastAction === 'pass') && styles.actionLabelLit, liveDir !== 'none' && liveDir !== 'left' && styles.actionLabelDim]}>Pass</Text>
            </View>
            <View style={styles.actionItem}>
              <ActionButton
                tone="like"
                onPress={() => recordSwipe('down', deck[index])}
                lit={liveDir === 'down' || lastAction === 'like'}
                anyActive={liveDir !== 'none'}
              />
              <Text style={[styles.actionLabel, styles.actionLabelLike, (liveDir === 'down' || lastAction === 'like') && styles.actionLabelLit, liveDir !== 'none' && liveDir !== 'down' && styles.actionLabelDim]}>Like</Text>
            </View>
            <View style={styles.actionItem}>
              <ActionButton
                tone="love"
                onPress={() => recordSwipe('right', deck[index])}
                lit={liveDir === 'right' || lastAction === 'love'}
                anyActive={liveDir !== 'none'}
              />
              <Text style={[styles.actionLabel, styles.actionLabelLove, (liveDir === 'right' || lastAction === 'love') && styles.actionLabelLit, liveDir !== 'none' && liveDir !== 'right' && styles.actionLabelDim]}>Love</Text>
            </View>
          </View>
          <Pressable onPress={handleEndSession} style={styles.endSessionBtn} hitSlop={8}>
            <Text style={styles.endSessionText}>End Session</Text>
          </Pressable>
        </View>
      )}
      {accordToast && (
        <View style={styles.accordToast} pointerEvents="none">
          <Text style={styles.accordToastText}>{accordToast} added to your taste ✓</Text>
        </View>
      )}
      {sessionSavedVisible && (
        <View style={styles.savedToast} pointerEvents="none">
          <Text style={styles.savedToastText}>Session saved — your taste profile just got sharper. Come back anytime to keep training.</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

function Intro({ onStart, onClose, dailyLimitReached, onUpgrade, onViewProfile }: {
  onStart: () => void;
  onClose: () => void;
  dailyLimitReached: boolean;
  onUpgrade: () => void;
  onViewProfile: () => void;
}) {
  const swipesMap = useSwipeStore((s) => s.swipes);
  const signalCount = Object.keys(swipesMap).length;
  const isReturning = signalCount > 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.introCloseRow}>
        <Pressable onPress={onClose} hitSlop={12}>
          <Ionicons name="close" size={26} color={COLORS.muted} />
        </Pressable>
      </View>
      <View style={styles.introContainer}>
        <View style={styles.iconCircle}>
          <Ionicons name="sparkles" size={36} color={COLORS.accent} />
        </View>
        <Text style={styles.eyebrow}>TRAIN MY NOSE</Text>
        {isReturning ? (
          <Text style={styles.headline}>
            Your taste is <Text style={styles.italic}>sharpening</Text>.
          </Text>
        ) : (
          <Text style={styles.headline}>
            Teach us what you <Text style={styles.italic}>love</Text>.
          </Text>
        )}

        {/* 3-outcome value prop row */}
        <View style={styles.outcomesRow}>
          <View style={styles.outcomeItem}>
            <Ionicons name="water-outline" size={22} color={COLORS.accent} />
            <Text style={styles.outcomeLabel}>Wear Today{'\n'}sharpens</Text>
          </View>
          <View style={styles.outcomeSep} />
          <View style={styles.outcomeItem}>
            <Ionicons name="search-outline" size={22} color={COLORS.accent} />
            <Text style={styles.outcomeLabel}>Discover{'\n'}improves</Text>
          </View>
          <View style={styles.outcomeSep} />
          <View style={styles.outcomeItem}>
            <Ionicons name="flask-outline" size={22} color={COLORS.accent} />
            <Text style={styles.outcomeLabel}>Quiz gets{'\n'}smarter</Text>
          </View>
        </View>

        {isReturning ? (
          <View style={styles.signalRow}>
            <Ionicons name="pulse-outline" size={12} color={COLORS.accent} />
            <Text style={styles.signalText}>
              {signalCount} signal{signalCount !== 1 ? 's' : ''} training your taste
            </Text>
          </View>
        ) : (
          <Text style={styles.body}>
            Swipe right on fragrances that intrigue you, left on those that don't.
          </Text>
        )}

        {dailyLimitReached ? (
          <>
            <Text style={styles.body}>
              You get <Text style={styles.italic}>10 free swipes a day</Text> — you've used today's.
              They reset tomorrow, free. Go Pro for unlimited swipes anytime.
            </Text>
            <Pressable style={[styles.cta, { backgroundColor: COLORS.text }]} onPress={onUpgrade}>
              <Text style={styles.ctaText}>Unlock Unlimited Swipes</Text>
            </Pressable>
            <Pressable onPress={onClose} hitSlop={8} style={styles.tasteProfileLink}>
              <Text style={styles.tasteProfileLinkText}>Maybe tomorrow</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable style={styles.cta} onPress={onStart}>
              <Text style={styles.ctaText}>Begin a Session</Text>
            </Pressable>
            <Text style={styles.footnote}>10 free swipes / day · Unlimited with Pro</Text>
          </>
        )}

        {isReturning && (
          <Pressable onPress={onViewProfile} style={styles.tasteProfileLink} hitSlop={8}>
            <Text style={styles.tasteProfileLinkText}>See your taste profile →</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

function DailyLimitReached({ onUpgrade, onBack }: { onUpgrade: () => void; onBack: () => void }) {
  return (
    <View style={styles.summaryWrap}>
      <View style={styles.iconCircle}>
        <Ionicons name="lock-closed" size={28} color={COLORS.accent} />
      </View>
      <Text style={styles.eyebrow}>DAILY LIMIT REACHED</Text>
      <Text style={styles.summaryHeadline}>You've used your 10 free swipes today.</Text>
      <Text style={styles.summaryBody}>
        Upgrade to <Text style={styles.italic}>Pro</Text> for unlimited daily swipes and sharper taste profile results.
      </Text>
      <Pressable style={[styles.cta, { backgroundColor: COLORS.text }]} onPress={onUpgrade}>
        <Text style={styles.ctaText}>Unlock Pro</Text>
      </Pressable>
      <Pressable onPress={onBack} style={{ paddingVertical: SPACING.md }}>
        <Text style={{ ...TYPE.label, color: COLORS.muted, letterSpacing: 1 }}>Back</Text>
      </Pressable>
    </View>
  );
}

// ─── Card helpers ────────────────────────────────────────────────────────────

function formatFamily(family: string): string {
  return family.split(/[-_\s]+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function cardOccasion(f: Fragrance): string | null {
  const fam = (f.fragrance_family ?? '').toLowerCase();
  if (fam.includes('citrus') || fam.includes('aquatic') || fam.includes('fresh') || fam.includes('green')) return 'Daytime';
  if (f.office_safe_score >= 0.65) return 'Office-friendly';
  if (fam.includes('oriental') || fam.includes('gourmand') || fam.includes('amber')) return 'Evening';
  if (f.community_sillage > 3.2) return 'Makes an entrance';
  if (f.compliment_score > 0.70) return 'Gets compliments';
  return null;
}

function ScoreDots({ score }: { score: number }) {
  const filled = Math.round(Math.min(Math.max(score, 0), 5));
  return (
    <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center' }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={[dotStyle.dot, i < filled && dotStyle.filled]} />
      ))}
    </View>
  );
}

const dotStyle = StyleSheet.create({
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.border },
  filled: { backgroundColor: COLORS.accent },
});

// R12: showHints prop — visible on first 3 cards, then removed
function SwipeCard({ fragrance, onCommit, sharedDragX, sharedDragY, showHints }: {
  fragrance: Fragrance;
  onCommit: (dir: 'left' | 'right' | 'down', fragrance: Fragrance) => void;
  sharedDragX: SharedValue<number>;
  sharedDragY: SharedValue<number>;
  showHints?: boolean;
}) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  const pan = Gesture.Pan()
    .onStart(() => {
      startX.value = translateX.value;
      startY.value = translateY.value;
    })
    .onUpdate((e) => {
      translateX.value = startX.value + e.translationX;
      const yDamp = e.translationY > 0 ? 0.9 : 0.3;
      translateY.value = startY.value + e.translationY * yDamp;
      sharedDragX.value = translateX.value;
      sharedDragY.value = translateY.value;
    })
    .onEnd((e) => {
      const flingedDown = e.velocityY > 800 && Math.abs(e.velocityX) < 400;
      const pastDown = translateY.value > SWIPE_DOWN_THRESHOLD && Math.abs(translateX.value) < SCREEN_W * 0.3;
      const flingedH = Math.abs(e.velocityX) > 600 && Math.abs(e.velocityX) > Math.abs(e.velocityY);
      const past = Math.abs(translateX.value) > SWIPE_THRESHOLD;

      if (pastDown || flingedDown) {
        translateY.value = withTiming(SCREEN_H * 1.4, { duration: 260 }, () => {
          runOnJS(onCommit)('down', fragrance);
        });
        translateX.value = withTiming(translateX.value * 0.3, { duration: 260 });
      } else if (past || flingedH) {
        const dir = translateX.value > 0 ? 'right' : 'left';
        const exitX = (dir === 'right' ? 1 : -1) * SCREEN_W * 1.4;
        translateX.value = withTiming(exitX, { duration: 250 }, () => {
          runOnJS(onCommit)(dir, fragrance);
        });
        translateY.value = withTiming(translateY.value + 80, { duration: 250 });
      } else {
        translateX.value = withSpring(0, { damping: 14, stiffness: 140 });
        translateY.value = withSpring(0, { damping: 14, stiffness: 140 });
        sharedDragX.value = withSpring(0, { damping: 14, stiffness: 140 });
        sharedDragY.value = withSpring(0, { damping: 14, stiffness: 140 });
      }
    });

  const cardStyle = useAnimatedStyle(() => {
    const rot = interpolate(
      translateX.value,
      [-SCREEN_W, 0, SCREEN_W],
      [-MAX_ROTATE_DEG, 0, MAX_ROTATE_DEG],
      Extrapolation.CLAMP,
    );
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotate: `${rot}deg` },
      ],
    };
  });

  const loveBadgeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, SWIPE_THRESHOLD * 0.5, SWIPE_THRESHOLD], [0, 0.6, 1], Extrapolation.CLAMP),
  }));
  const passBadgeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-SWIPE_THRESHOLD, -SWIPE_THRESHOLD * 0.5, 0], [1, 0.6, 0], Extrapolation.CLAMP),
  }));
  const likeBadgeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateY.value,
      [0, SWIPE_DOWN_THRESHOLD * 0.4, SWIPE_DOWN_THRESHOLD],
      [0, 0.6, 1],
      Extrapolation.CLAMP,
    ),
  }));

  const occasion = cardOccasion(fragrance);

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.card, cardStyle]}>

        {/* ── Image section ── */}
        <View style={styles.cardImageSection}>
          <Image source={{ uri: fragrance.image_url }} style={styles.cardImageFill} resizeMode="cover" />
          <View style={styles.cardOverlay} />

          {/* Badges */}
          <Animated.View style={[styles.badge, styles.badgeLove, loveBadgeStyle]}>
            <Text style={styles.badgeLoveText}>love</Text>
          </Animated.View>
          <Animated.View style={[styles.badgeLikeWrap, likeBadgeStyle]}>
            <View style={[styles.badge, styles.badgeLike]}>
              <Text style={styles.badgeLikeText}>like</Text>
            </View>
          </Animated.View>
          <Animated.View style={[styles.badge, styles.badgePass, passBadgeStyle]}>
            <Text style={styles.badgePassText}>pass</Text>
          </Animated.View>

          {/* Directional hints — first 3 cards only */}
          {showHints && (
            <>
              <View style={hintCard.leftWrap}><Text style={hintCard.text}>← Pass</Text></View>
              <View style={hintCard.rightWrap}><Text style={hintCard.text}>Love →</Text></View>
              <View style={hintCard.bottomWrap}><Text style={hintCard.text}>↓ Like</Text></View>
            </>
          )}
        </View>

        {/* ── Info panel ── */}
        <View style={styles.cardInfo}>
          {/* Brand · Family + Price tier */}
          <View style={styles.cardInfoHeader}>
            <Text style={styles.cardInfoBrand} numberOfLines={1}>
              {fragrance.brand.toUpperCase()}
              {fragrance.fragrance_family ? (
                <Text style={styles.cardInfoFamily}>
                  {' · '}{formatFamily(fragrance.fragrance_family).toUpperCase()}
                </Text>
              ) : null}
            </Text>
            <Text style={styles.cardInfoPrice}>
              {'$'.repeat(Math.min(fragrance.price_tier ?? 0, 4))}
            </Text>
          </View>

          {/* Name */}
          <Text style={styles.cardInfoName} numberOfLines={2}>{fragrance.name}</Text>

          {/* Accord chips */}
          {fragrance.top_accords.length > 0 && (
            <View style={styles.cardInfoAccords}>
              {fragrance.top_accords.slice(0, 3).map((a) => (
                <View key={a} style={styles.cardInfoChip}>
                  <Text style={styles.cardInfoChipText}>{a.replace(/-/g, ' ')}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Longevity + Sillage + Occasion */}
          <View style={styles.cardInfoStats}>
            <View style={styles.cardInfoStatGroup}>
              <ScoreDots score={fragrance.community_longevity} />
              <Text style={styles.cardInfoStatLabel}>lasts</Text>
            </View>
            <View style={styles.cardInfoStatSep} />
            <View style={styles.cardInfoStatGroup}>
              <ScoreDots score={fragrance.community_sillage} />
              <Text style={styles.cardInfoStatLabel}>sillage</Text>
            </View>
            {occasion && (
              <>
                <View style={styles.cardInfoStatSep} />
                <Text style={styles.cardInfoOccasion}>{occasion}</Text>
              </>
            )}
          </View>
        </View>

      </Animated.View>
    </GestureDetector>
  );
}

function BackgroundCard({ fragrance }: { fragrance: Fragrance }) {
  return (
    <View style={[styles.card, styles.cardBehind]} pointerEvents="none">
      <View style={styles.cardImageSection}>
        <Image source={{ uri: fragrance.image_url }} style={styles.cardImageFill} resizeMode="cover" />
        <View style={styles.cardOverlay} />
      </View>
      <View style={styles.cardInfo} />
    </View>
  );
}

function ActionButton({ tone, onPress, lit = false, anyActive = false }: {
  tone: 'pass' | 'like' | 'love';
  onPress: () => void;
  lit?: boolean;
  anyActive?: boolean;
}) {
  const dimmed = anyActive && !lit;
  const config = {
    pass: {
      icon: 'close' as const,
      baseStyle: styles.actionPass,
      litStyle: styles.actionPassActive,
      color: lit ? COLORS.white : dimmed ? COLORS.subtle : COLORS.danger,
    },
    like: {
      icon: 'bookmark-outline' as const,
      baseStyle: styles.actionLike,
      litStyle: styles.actionLikeActive,
      color: lit ? COLORS.white : dimmed ? COLORS.subtle : LIKE_COLOR,
    },
    love: {
      icon: 'heart' as const,
      baseStyle: styles.actionLove,
      litStyle: styles.actionLoveActive,
      color: COLORS.white,
    },
  }[tone];
  const label = tone === 'pass' ? 'Pass' : tone === 'like' ? 'Like' : 'Love';
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      style={[
        styles.actionBtn,
        config.baseStyle,
        lit && config.litStyle,
        lit && styles.actionBtnLit,
        dimmed && styles.actionBtnDimmed,
      ]}
    >
      <Ionicons name={config.icon} size={lit ? 30 : 26} color={config.color} />
    </Pressable>
  );
}

function SessionSummary({ stats, onRestart }: { stats: SessionStats; onRestart: () => void }) {
  return (
    <View style={styles.summaryWrap}>
      <Text style={styles.eyebrow}>SESSION COMPLETE</Text>
      <Text style={styles.summaryHeadline}>Your taste is sharpening.</Text>
      <View style={styles.summaryStatsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.loved}</Text>
          <Text style={styles.statLabel}>loved</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: LIKE_COLOR }]}>{stats.liked}</Text>
          <Text style={styles.statLabel}>liked</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: COLORS.muted }]}>{stats.passed}</Text>
          <Text style={styles.statLabel}>passed</Text>
        </View>
      </View>
      <Text style={styles.summaryBody}>
        Your <Text style={styles.italic}>Wear Today</Text> pick on the home screen will start reflecting these signals.
      </Text>
      <Pressable style={[styles.cta, { backgroundColor: COLORS.accent }]} onPress={onRestart}>
        <Text style={styles.ctaText}>Another Session</Text>
      </Pressable>
    </View>
  );
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// R12: card hint label styles
const hintCard = StyleSheet.create({
  leftWrap: { position: 'absolute', left: 14, top: 0, bottom: 0, justifyContent: 'center' },
  rightWrap: { position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' },
  bottomWrap: { position: 'absolute', bottom: 14, left: 0, right: 0, alignItems: 'center' },
  text: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontFamily: FONTS.serif,
    fontWeight: '600',
    letterSpacing: 1,
  },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  introCloseRow: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    alignItems: 'flex-start',
  },
  introContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  iconCircle: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.accent,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  eyebrow: { ...TYPE.eyebrow, marginBottom: SPACING.md, textAlign: 'center' },
  headline: {
    fontFamily: FONTS.serif, fontSize: 32, color: COLORS.text,
    textAlign: 'center', marginBottom: SPACING.md, lineHeight: 38, fontWeight: '600',
  },
  italic: { fontStyle: 'italic', color: COLORS.accent, fontFamily: 'CormorantGaramond_400Regular_Italic' },
  body: {
    ...TYPE.body, textAlign: 'center', color: COLORS.muted,
    marginBottom: SPACING.xl, paddingHorizontal: SPACING.md,
  },
  cta: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.xxl,
    paddingVertical: 16,
    borderRadius: RADIUS.full,
    marginBottom: SPACING.sm,
  },
  ctaText: { ...TYPE.label, color: COLORS.white, letterSpacing: 2 },
  footnote: { ...TYPE.caption, marginTop: 4 },

  // Intro — 3-outcome value prop row
  outcomesRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 0,
    marginBottom: SPACING.lg,
    marginTop: SPACING.xs,
    paddingHorizontal: SPACING.md,
  },
  outcomeItem: {
    flex: 1,
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: 4,
  },
  outcomeLabel: {
    ...TYPE.caption,
    fontSize: 11,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 15,
  },
  outcomeSep: {
    width: 1,
    height: 36,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginTop: 4,
  },
  signalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: SPACING.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  signalText: {
    ...TYPE.caption,
    fontSize: 12,
    color: COLORS.accent,
  },
  tasteProfileLink: {
    marginTop: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  tasteProfileLinkText: {
    ...TYPE.label,
    fontSize: 12,
    color: COLORS.accent,
    letterSpacing: 0.3,
    textDecorationLine: 'underline',
  },

  // R11: overlay + exit modal
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  exitModal: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    width: '100%',
    alignItems: 'center',
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  exitModalTitle: {
    fontFamily: FONTS.serif,
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
  },
  exitModalBody: {
    ...TYPE.bodySmall,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: SPACING.xs,
  },
  exitModalBtnPrimary: {
    width: '100%',
    paddingVertical: 13,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  exitModalBtnPrimaryText: { ...TYPE.label, color: COLORS.white, fontSize: 13, letterSpacing: 1 },
  exitModalBtnSecondary: { width: '100%', paddingVertical: 10, alignItems: 'center' },
  exitModalBtnSecondaryText: { ...TYPE.label, color: COLORS.muted, fontSize: 12, letterSpacing: 0.5 },

  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
  },
  counter: { ...TYPE.caption, textAlign: 'center', marginTop: 2 },
  genderPill: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: RADIUS.full,
    borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  genderPillActive: { backgroundColor: COLORS.text, borderColor: COLORS.text },
  genderPillText: { ...TYPE.label, color: COLORS.muted, fontSize: 13 },
  genderPillTextActive: { color: COLORS.bg },

  deckArea: { flex: 1, alignItems: 'center', justifyContent: 'flex-start' },

  card: {
    position: 'absolute',
    top: 0,
    width: SCREEN_W - SPACING.xl * 2,
    height: SCREEN_W * 1.25,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    backgroundColor: COLORS.card,
    shadowColor: COLORS.black,
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  cardBehind: { transform: [{ scale: 0.96 }], opacity: 0.6 },

  // ── Image section (top portion, shrunk) ──
  cardImageSection: {
    width: '100%',
    height: CARD_IMAGE_H,
    overflow: 'hidden',
  },
  cardImageFill: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  cardOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(42,31,24,0.35)',
  },

  // ── Info panel (solid background) ──
  cardInfo: {
    flex: 1,
    backgroundColor: COLORS.card,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.sm,
    gap: 5,
  },
  cardInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  cardInfoBrand: {
    ...TYPE.eyebrow,
    fontSize: 9,
    color: COLORS.muted,
    flex: 1,
  },
  cardInfoFamily: {
    color: COLORS.accent,
  },
  cardInfoPrice: {
    ...TYPE.eyebrow,
    fontSize: 10,
    color: COLORS.accent,
    letterSpacing: 0,
  },
  cardInfoName: {
    fontFamily: FONTS.serif,
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
    lineHeight: 24,
  },
  cardInfoAccords: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 1,
  },
  cardInfoChip: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.blushSoft,
    borderWidth: 1,
    borderColor: COLORS.blush,
  },
  cardInfoChipText: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.accent,
    letterSpacing: 0.2,
  },
  cardInfoNote: {
    ...TYPE.bodySmall,
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  cardInfoNoteLabel: {
    color: COLORS.accent,
    fontWeight: '600',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  cardInfoStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  cardInfoStatGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  cardInfoStatLabel: {
    ...TYPE.caption,
    fontSize: 10,
    color: COLORS.muted,
  },
  cardInfoStatSep: {
    width: 1,
    height: 12,
    backgroundColor: COLORS.border,
  },
  cardInfoOccasion: {
    ...TYPE.caption,
    fontSize: 10,
    color: COLORS.accent,
    fontStyle: 'italic',
  },

  badge: {
    position: 'absolute',
    top: 28,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    borderWidth: 4,
  },
  badgeLove: { right: 20, borderColor: COLORS.success, backgroundColor: 'rgba(255,255,255,0.96)', transform: [{ rotate: '-10deg' }] },
  badgeLoveText: { fontFamily: FONTS.serif, fontSize: 40, fontWeight: '800', color: COLORS.success, letterSpacing: 3 },
  badgeLikeWrap: { position: 'absolute', top: 28, left: 0, right: 0, alignItems: 'center' },
  badgeLike: { borderColor: LIKE_COLOR, backgroundColor: 'rgba(255,255,255,0.96)', transform: [{ rotate: '-2deg' }] },
  badgeLikeText: { fontFamily: FONTS.serif, fontSize: 40, fontWeight: '800', color: LIKE_COLOR, letterSpacing: 3 },
  badgePass: { left: 20, borderColor: COLORS.danger, backgroundColor: 'rgba(255,255,255,0.96)', transform: [{ rotate: '10deg' }] },
  badgePassText: { fontFamily: FONTS.serif, fontSize: 40, fontWeight: '800', color: COLORS.danger, letterSpacing: 3 },

  actionRow: {
    position: 'absolute',
    bottom: 90,
    left: 0, right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
  },
  actionItem: { alignItems: 'center', gap: 8 },
  actionLabel: {
    fontSize: 13, fontWeight: '700', letterSpacing: 1,
    textTransform: 'uppercase',
  },
  actionLabelPass: { color: COLORS.danger },
  actionLabelLike: { color: LIKE_COLOR },
  actionLabelLove: { color: LOVE_COLOR },
  actionLabelLit: { opacity: 1 },
  actionLabelDim: { opacity: 0.25 },
  actionBtn: {
    width: 60, height: 60, borderRadius: 30,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: COLORS.black,
    shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  actionBtnLit: { transform: [{ scale: 1.14 }] },
  actionBtnDimmed: { opacity: 0.28 },
  actionPass: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  actionPassActive: { backgroundColor: COLORS.danger, borderColor: COLORS.danger },
  actionLike: { backgroundColor: COLORS.card, borderWidth: 1.5, borderColor: LIKE_COLOR },
  actionLikeActive: { backgroundColor: LIKE_COLOR, borderColor: LIKE_COLOR },
  actionLove: { backgroundColor: LOVE_COLOR },
  actionLoveActive: { backgroundColor: '#C62828', shadowOpacity: 0.45, shadowRadius: 16 },
  hint: {
    position: 'absolute', bottom: 56,
    ...TYPE.caption, color: COLORS.muted,
  },
  endSessionBtn: {
    position: 'absolute', bottom: 16,
    alignSelf: 'center',
    paddingHorizontal: 16, paddingVertical: 6,
  },
  endSessionText: {
    ...TYPE.caption, color: COLORS.muted, fontSize: 12,
    textDecorationLine: 'underline',
  },
  accordToast: {
    position: 'absolute', bottom: 140, alignSelf: 'center',
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.full, paddingVertical: 8, paddingHorizontal: 18,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  accordToastText: {
    ...TYPE.label, color: COLORS.white, fontSize: 12, letterSpacing: 0.5,
  },
  savedToast: {
    position: 'absolute', bottom: 80, left: 20, right: 20,
    backgroundColor: COLORS.text,
    borderRadius: 12, paddingVertical: 14, paddingHorizontal: 18,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  savedToastText: {
    ...TYPE.caption, color: COLORS.white, textAlign: 'center', lineHeight: 18,
  },

  summaryWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl, gap: SPACING.lg },
  summaryHeadline: { fontFamily: FONTS.serif, fontSize: 30, fontWeight: '600', color: COLORS.text, textAlign: 'center' },
  summaryStatsRow: { flexDirection: 'row', gap: SPACING.lg },
  statCard: {
    width: 100, paddingVertical: SPACING.lg, paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center',
  },
  statValue: { fontFamily: FONTS.serif, fontSize: 40, fontWeight: '700', color: COLORS.accent, lineHeight: 46 },
  statLabel: { fontFamily: FONTS.body, fontSize: 11, fontWeight: '600', color: COLORS.muted, marginTop: 6, textTransform: 'uppercase' },
  summaryBody: { ...TYPE.body, color: COLORS.muted, textAlign: 'center', paddingHorizontal: SPACING.md },
});
