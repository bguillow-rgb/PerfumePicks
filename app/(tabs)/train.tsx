import { useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Dimensions, ActivityIndicator } from 'react-native';
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

/**
 * Train My Nose — swipe right to like, left to pass.
 *
 * Each swipe should feed the user's taste profile (liked_notes,
 * preferred_accords) so home-screen recommendations sharpen over time.
 * For the demo build we just track local state and show a session summary.
 *
 * Built with reanimated + gesture-handler so we control the spring physics
 * and the rotation feel directly. The threshold (40% of screen width) was
 * chosen so a flick commits but a hesitant drag snaps back.
 */

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_W * 0.32;
const SWIPE_DOWN_THRESHOLD = SCREEN_H * 0.28;
const MAX_ROTATE_DEG = 12;
const LIKE_COLOR = '#C4788A'; // blush rose for down-swipe like

interface SessionStats {
  loved: number;
  liked: number;
  passed: number;
}

type GenderFilter = 'all' | 'feminine' | 'masculine' | 'unisex';
const GENDER_CYCLE: GenderFilter[] = ['all', 'feminine', 'unisex', 'masculine'];
const GENDER_LABEL: Record<GenderFilter, string> = {
  all: 'All', feminine: 'For Her', masculine: 'For Him', unisex: 'Unisex',
};

export default function TrainScreen() {
  const router = useRouter();
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [stats, setStats] = useState<SessionStats>({ loved: 0, liked: 0, passed: 0 });
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('all');
  const [lastAction, setLastAction] = useState<'pass' | 'like' | 'love' | null>(null);
  const [liveDir, setLiveDir] = useState<'none' | 'left' | 'right' | 'down'>('none');

  // Shared values written by SwipeCard during the gesture so buttons can
  // react in real time without waiting for a commit.
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
  const alreadySwiped = useSwipeStore((s) => s.swipes);
  const dailySwipeCount = useSwipeStore((s) => s.dailySwipeCount);
  const dailySwipeDate = useSwipeStore((s) => s.dailySwipeDate);
  const isPro = useProStore((s) => s.isPro);

  const dailyLimitReached = useMemo(() => {
    if (isPro) return false;
    const today = new Date().toLocaleDateString('en-CA');
    return dailySwipeDate === today && dailySwipeCount >= FREE_DAILY_SWIPE_LIMIT;
  }, [isPro, dailySwipeCount, dailySwipeDate]);

  // Pull a session pool from the live catalog; pull a generous slice so
  // gender + already-swiped filters still leave a meaningful deck. 200 is
  // plenty until the catalog grows past 1k, at which point we'd switch to
  // server-side shuffle anyway.
  //
  // poolReady distinguishes "still fetching" from "fetched and got nothing"
  // so we don't render SESSION COMPLETE on the very first frame after the
  // user taps Begin (when pool is still []). Without this, the user
  // taps Begin → pool=[] → deck=[] → done=true → SESSION COMPLETE flashes
  // immediately and they never see a card.
  const fetchAllActive = useCatalogStore((s) => s.fetchAllActive);
  const [pool, setPool] = useState<Fragrance[]>([]);
  const [poolReady, setPoolReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetchAllActive(200).then((rows) => {
      if (cancelled) return;
      setPool(rows);
      setPoolReady(true);
    });
    return () => { cancelled = true; };
  }, [fetchAllActive]);

  // Shuffle the pool once per session AND skip anything the user has
  // already judged in past sessions. Gender filter applied after shuffle so
  // the filtered deck is still random.
  const deck = useMemo(() => {
    const unswiped = pool.filter((f) => !alreadySwiped[f.id]);
    const filtered = genderFilter === 'all'
      ? unswiped
      : unswiped.filter((f) => f.gender === genderFilter || f.gender === 'unisex');
    return shuffle(filtered);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, genderFilter, pool]);

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
      const storeAction = dir === 'right' ? 'love' : dir === 'down' ? 'like' : 'dislike';
      recordToStore(fragrance.id, storeAction);
    }
  }, [recordToStore]);

  if (!started) return <Intro onStart={() => { setStarted(true); setIndex(0); setStats({ loved: 0, liked: 0, passed: 0 }); }} dailyLimitReached={dailyLimitReached} onUpgrade={() => router.push('/paywall')} />;

  // Loading state — pool still fetching after Begin tapped. Without this
  // gate, the SESSION COMPLETE branch renders immediately because deck=[]
  // and index=0 satisfies `index >= deck.length` trivially.
  if (!poolReady) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={[styles.headerRow]}>
          <Pressable onPress={() => setStarted(false)}>
            <Ionicons name="close" size={26} color={COLORS.text} />
          </Pressable>
          <Text style={styles.eyebrow}>TRAIN MY NOSE</Text>
          <View style={{ width: 26 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={COLORS.accent} />
        </View>
      </SafeAreaView>
    );
  }

  const done = index >= deck.length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => setStarted(false)}>
            <Ionicons name="close" size={26} color={COLORS.text} />
          </Pressable>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.eyebrow}>TRAIN MY NOSE</Text>
            {!done && (
              <Text style={styles.counter}>
                {deck.length > 0
                  ? `${Math.min(index + 1, deck.length)} / ${deck.length}`
                  : 'all caught up'}
              </Text>
            )}
          </View>
          {/* Gender filter — tapping cycles All → For Her → Unisex → For Him */}
          <Pressable
            style={[styles.genderPill, genderFilter !== 'all' && styles.genderPillActive]}
            onPress={() => {
              const next = GENDER_CYCLE[(GENDER_CYCLE.indexOf(genderFilter) + 1) % GENDER_CYCLE.length];
              setGenderFilter(next);
              setIndex(0);
            }}
          >
            <Text style={[styles.genderPillText, genderFilter !== 'all' && styles.genderPillTextActive]}>
              {GENDER_LABEL[genderFilter]}
            </Text>
          </Pressable>
        </View>

        {done ? (
          <SessionSummary stats={stats} onRestart={() => { setIndex(0); setStats({ loved: 0, liked: 0, passed: 0 }); }} />
        ) : dailyLimitReached ? (
          <DailyLimitReached onUpgrade={() => router.push('/paywall')} onBack={() => setStarted(false)} />
        ) : (
          <View style={styles.deckArea}>
            {/* Render the next card behind so there's always a card visible during the swipe-out animation. */}
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
            <Text style={styles.hint}>Swipe right to <Text style={styles.italic}>love</Text> · down to <Text style={styles.italic}>like</Text> · left to <Text style={styles.italic}>pass</Text></Text>
          </View>
        )}
    </SafeAreaView>
  );
}

function Intro({ onStart, dailyLimitReached, onUpgrade }: { onStart: () => void; dailyLimitReached: boolean; onUpgrade: () => void }) {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.introContainer}>
        <View style={styles.iconCircle}>
          <Ionicons name="sparkles" size={36} color={COLORS.accent} />
        </View>
        <Text style={styles.eyebrow}>TRAIN MY NOSE</Text>
        <Text style={styles.headline}>
          Teach us what you <Text style={styles.italic}>love</Text>.
        </Text>
        <Text style={styles.body}>
          Swipe right on fragrances that intrigue you, left on those that don't.
          Every swipe sharpens your taste profile and refines your daily picks.
        </Text>
        {dailyLimitReached ? (
          <>
            <Pressable style={[styles.cta, { backgroundColor: COLORS.text }]} onPress={onUpgrade}>
              <Text style={styles.ctaText}>Unlock Unlimited Swipes</Text>
            </Pressable>
            <Text style={styles.footnote}>You've used your 10 free swipes today. Resets tomorrow.</Text>
          </>
        ) : (
          <>
            <Pressable style={styles.cta} onPress={onStart}>
              <Text style={styles.ctaText}>Begin a Session</Text>
            </Pressable>
            <Text style={styles.footnote}>10 free swipes / day · Unlimited with Pro</Text>
          </>
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

function SwipeCard({ fragrance, onCommit, sharedDragX, sharedDragY }: {
  fragrance: Fragrance;
  onCommit: (dir: 'left' | 'right' | 'down', fragrance: Fragrance) => void;
  sharedDragX: SharedValue<number>;
  sharedDragY: SharedValue<number>;
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
      // Write to shared parent values so buttons can react live.
      sharedDragX.value = translateX.value;
      sharedDragY.value = translateY.value;
    })
    .onEnd((e) => {
      // Down swipe takes priority when dragging mostly downward.
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

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.card, cardStyle]}>
        <Image source={{ uri: fragrance.image_url }} style={styles.cardImage} />
        <View style={styles.cardOverlay} />
        {/* Love badge — right swipe */}
        <Animated.View style={[styles.badge, styles.badgeLove, loveBadgeStyle]}>
          <Text style={styles.badgeLoveText}>love</Text>
        </Animated.View>
        {/* Like badge — down swipe, centered at top */}
        <Animated.View style={[styles.badgeLikeWrap, likeBadgeStyle]}>
          <View style={[styles.badge, styles.badgeLike]}>
            <Text style={styles.badgeLikeText}>like</Text>
          </View>
        </Animated.View>
        {/* Pass badge — left swipe */}
        <Animated.View style={[styles.badge, styles.badgePass, passBadgeStyle]}>
          <Text style={styles.badgePassText}>pass</Text>
        </Animated.View>
        <View style={styles.cardContent}>
          <Text style={styles.cardBrand}>{fragrance.brand.toUpperCase()}</Text>
          <Text style={styles.cardName}>{fragrance.name}</Text>
          <View style={styles.accordRow}>
            {fragrance.top_accords.slice(0, 4).map((a) => (
              <View key={a} style={styles.cardAccord}>
                <Text style={styles.cardAccordText}>{a.replace('-', ' ')}</Text>
              </View>
            ))}
          </View>
          <View style={styles.cardNotes}>
            <Text style={styles.cardNoteLine} numberOfLines={1}><Text style={styles.cardNoteLabel}>Top </Text>{fragrance.top_notes.slice(0, 3).join(' · ')}</Text>
            <Text style={styles.cardNoteLine} numberOfLines={1}><Text style={styles.cardNoteLabel}>Heart </Text>{fragrance.heart_notes.slice(0, 3).join(' · ')}</Text>
            <Text style={styles.cardNoteLine} numberOfLines={1}><Text style={styles.cardNoteLabel}>Base </Text>{fragrance.base_notes.slice(0, 3).join(' · ')}</Text>
          </View>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

function BackgroundCard({ fragrance }: { fragrance: Fragrance }) {
  return (
    <View style={[styles.card, styles.cardBehind]} pointerEvents="none">
      <Image source={{ uri: fragrance.image_url }} style={styles.cardImage} />
      <View style={styles.cardOverlay} />
    </View>
  );
}

function ActionButton({ tone, onPress, lit = false, anyActive = false }: {
  tone: 'pass' | 'like' | 'love';
  onPress: () => void;
  lit?: boolean;
  anyActive?: boolean;
}) {
  // Greyed out when dragging in a different direction; lit when matching direction.
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
  return (
    <Pressable
      onPress={onPress}
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
        Your <Text style={styles.italic}>Today's Edit</Text> on the home screen will start reflecting these signals.
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
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
    marginBottom: SPACING.md,
  },
  ctaText: { ...TYPE.label, color: COLORS.white, letterSpacing: 2 },
  footnote: { ...TYPE.caption, marginTop: 4 },

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
    backgroundColor: COLORS.card2,
    shadowColor: COLORS.black,
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  cardBehind: { transform: [{ scale: 0.96 }], opacity: 0.6 },
  cardImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  cardOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(42,31,24,0.45)',
  },
  cardContent: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    padding: SPACING.lg,
  },
  cardBrand: { ...TYPE.eyebrow, color: COLORS.accentSoft, marginBottom: 4 },
  cardName: {
    fontFamily: FONTS.serif, fontSize: 28, fontWeight: '600',
    color: COLORS.white, marginBottom: SPACING.md, lineHeight: 32,
  },
  accordRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: SPACING.md },
  cardAccord: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: RADIUS.full,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  cardAccordText: { color: COLORS.white, fontSize: 11, fontWeight: '500', letterSpacing: 0.4 },
  cardNotes: { gap: 3 },
  cardNoteLine: { ...TYPE.bodySmall, color: COLORS.white, opacity: 0.9 },
  cardNoteLabel: { color: COLORS.accentSoft, fontWeight: '600', fontSize: 11, letterSpacing: 1 },

  badge: {
    position: 'absolute',
    top: 32,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    borderWidth: 2,
  },
  badgeLove: { right: 24, borderColor: COLORS.success, backgroundColor: 'rgba(255,255,255,0.92)', transform: [{ rotate: '-8deg' }] },
  badgeLoveText: { fontFamily: FONTS.serif, fontSize: 22, fontWeight: '700', color: COLORS.success, letterSpacing: 2 },
  // Like badge (down swipe) is centered via a wrapper, not positioned directly.
  badgeLikeWrap: { position: 'absolute', top: 32, left: 0, right: 0, alignItems: 'center' },
  badgeLike: { borderColor: LIKE_COLOR, backgroundColor: 'rgba(255,255,255,0.92)', transform: [{ rotate: '-2deg' }] },
  badgeLikeText: { fontFamily: FONTS.serif, fontSize: 22, fontWeight: '700', color: LIKE_COLOR, letterSpacing: 2 },
  badgePass: { left: 24, borderColor: COLORS.danger, backgroundColor: 'rgba(255,255,255,0.92)', transform: [{ rotate: '8deg' }] },
  badgePassText: { fontFamily: FONTS.serif, fontSize: 22, fontWeight: '700', color: COLORS.danger, letterSpacing: 2 },

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
  actionLabelLove: { color: COLORS.accent },
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
  actionLove: { backgroundColor: COLORS.accent },
  actionLoveActive: { backgroundColor: COLORS.accent, shadowOpacity: 0.35, shadowRadius: 14 },
  hint: {
    position: 'absolute', bottom: 56,
    ...TYPE.caption, color: COLORS.muted,
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
  // No letterSpacing on statLabel — it was causing single-word breaks ("LOVE\nD")
  statLabel: { fontFamily: FONTS.body, fontSize: 11, fontWeight: '600', color: COLORS.muted, marginTop: 6, textTransform: 'uppercase' },
  summaryBody: { ...TYPE.body, color: COLORS.muted, textAlign: 'center', paddingHorizontal: SPACING.md },
});
