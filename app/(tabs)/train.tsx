import { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { COLORS, SPACING, TYPE, FONTS, RADIUS } from '@/src/constants/theme';
import { MOCK_CATALOG, type MockFragrance } from '@/src/mock/fragrances';

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

const { width: SCREEN_W } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_W * 0.32;
const MAX_ROTATE_DEG = 12;

interface SessionStats {
  liked: number;
  passed: number;
}

export default function TrainScreen() {
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [stats, setStats] = useState<SessionStats>({ liked: 0, passed: 0 });

  // Shuffle the catalog once per session so the deck feels fresh on each visit.
  const deck = useMemo(() => shuffle(MOCK_CATALOG), [started]);

  const recordSwipe = useCallback((dir: 'left' | 'right') => {
    setStats((s) => dir === 'right'
      ? { ...s, liked: s.liked + 1 }
      : { ...s, passed: s.passed + 1 });
    setIndex((i) => i + 1);
    Haptics.impactAsync(dir === 'right' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
  }, []);

  if (!started) return <Intro onStart={() => { setStarted(true); setIndex(0); setStats({ liked: 0, passed: 0 }); }} />;

  const done = index >= deck.length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => setStarted(false)}>
            <Ionicons name="close" size={26} color={COLORS.text} />
          </Pressable>
          <View>
            <Text style={styles.eyebrow}>TRAIN MY NOSE</Text>
            <Text style={styles.counter}>
              {Math.min(index, deck.length)} / {deck.length}
            </Text>
          </View>
          <View style={{ width: 26 }} />
        </View>

        {done ? (
          <SessionSummary stats={stats} onRestart={() => { setIndex(0); setStats({ liked: 0, passed: 0 }); }} />
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
              />
            )}

            <View style={styles.actionRow}>
              <ActionButton tone="pass" onPress={() => recordSwipe('left')} />
              <ActionButton tone="like" onPress={() => recordSwipe('right')} />
            </View>
            <Text style={styles.hint}>Swipe right to <Text style={styles.italic}>love</Text>, left to <Text style={styles.italic}>pass</Text></Text>
          </View>
        )}
      </GestureHandlerRootView>
    </SafeAreaView>
  );
}

function Intro({ onStart }: { onStart: () => void }) {
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
        <Pressable style={styles.cta} onPress={onStart}>
          <Text style={styles.ctaText}>Begin a Session</Text>
        </Pressable>
        <Text style={styles.footnote}>10 free swipes / day · Unlimited with Pro</Text>
      </View>
    </SafeAreaView>
  );
}

function SwipeCard({ fragrance, onCommit }: { fragrance: MockFragrance; onCommit: (dir: 'left' | 'right') => void }) {
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
      translateY.value = startY.value + e.translationY * 0.4;
    })
    .onEnd((e) => {
      const flinged = Math.abs(e.velocityX) > 600;
      const past = Math.abs(translateX.value) > SWIPE_THRESHOLD;
      if (past || flinged) {
        const dir = translateX.value > 0 ? 'right' : 'left';
        const exitX = (dir === 'right' ? 1 : -1) * SCREEN_W * 1.4;
        translateX.value = withTiming(exitX, { duration: 250 }, () => {
          runOnJS(onCommit)(dir);
        });
        translateY.value = withTiming(translateY.value + 80, { duration: 250 });
      } else {
        translateX.value = withSpring(0, { damping: 14, stiffness: 140 });
        translateY.value = withSpring(0, { damping: 14, stiffness: 140 });
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

  const likeBadgeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, SWIPE_THRESHOLD * 0.5, SWIPE_THRESHOLD], [0, 0.6, 1], Extrapolation.CLAMP),
  }));
  const passBadgeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-SWIPE_THRESHOLD, -SWIPE_THRESHOLD * 0.5, 0], [1, 0.6, 0], Extrapolation.CLAMP),
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.card, cardStyle]}>
        <Image source={{ uri: fragrance.image_url }} style={styles.cardImage} />
        <View style={styles.cardOverlay} />
        <Animated.View style={[styles.badge, styles.badgeLike, likeBadgeStyle]}>
          <Text style={styles.badgeLikeText}>love</Text>
        </Animated.View>
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
            <Text style={styles.cardNoteLine}><Text style={styles.cardNoteLabel}>Top </Text>{fragrance.top_notes.slice(0, 3).join(' · ')}</Text>
            <Text style={styles.cardNoteLine}><Text style={styles.cardNoteLabel}>Heart </Text>{fragrance.heart_notes.slice(0, 3).join(' · ')}</Text>
            <Text style={styles.cardNoteLine}><Text style={styles.cardNoteLabel}>Base </Text>{fragrance.base_notes.slice(0, 3).join(' · ')}</Text>
          </View>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

function BackgroundCard({ fragrance }: { fragrance: MockFragrance }) {
  return (
    <View style={[styles.card, styles.cardBehind]} pointerEvents="none">
      <Image source={{ uri: fragrance.image_url }} style={styles.cardImage} />
      <View style={styles.cardOverlay} />
    </View>
  );
}

function ActionButton({ tone, onPress }: { tone: 'pass' | 'like'; onPress: () => void }) {
  const isLike = tone === 'like';
  return (
    <Pressable
      onPress={onPress}
      style={[styles.actionBtn, isLike ? styles.actionLike : styles.actionPass]}
    >
      <Ionicons name={isLike ? 'heart' : 'close'} size={26} color={isLike ? COLORS.white : COLORS.muted} />
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
          <Text style={styles.statValue}>{stats.liked}</Text>
          <Text style={styles.statLabel}>loved</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.passed}</Text>
          <Text style={styles.statLabel}>passed</Text>
        </View>
      </View>
      <Text style={styles.summaryBody}>
        Your <Text style={styles.italic}>Today's Edit</Text> on the home screen will start reflecting these signals.
      </Text>
      <Pressable style={styles.cta} onPress={onRestart}>
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
  badgeLike: { right: 24, borderColor: COLORS.success, backgroundColor: 'rgba(255,255,255,0.92)', transform: [{ rotate: '-8deg' }] },
  badgeLikeText: { fontFamily: FONTS.serif, fontSize: 22, fontWeight: '700', color: COLORS.success, letterSpacing: 2 },
  badgePass: { left: 24, borderColor: COLORS.danger, backgroundColor: 'rgba(255,255,255,0.92)', transform: [{ rotate: '8deg' }] },
  badgePassText: { fontFamily: FONTS.serif, fontSize: 22, fontWeight: '700', color: COLORS.danger, letterSpacing: 2 },

  actionRow: {
    position: 'absolute',
    bottom: 90, // sit above the tab bar
    left: 0, right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 32,
  },
  actionBtn: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: COLORS.black,
    shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  actionPass: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  actionLike: { backgroundColor: COLORS.accent },
  hint: {
    position: 'absolute', bottom: 60,
    ...TYPE.caption, color: COLORS.muted,
  },

  summaryWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl, gap: SPACING.lg },
  summaryHeadline: { fontFamily: FONTS.serif, fontSize: 30, fontWeight: '600', color: COLORS.text, textAlign: 'center' },
  summaryStatsRow: { flexDirection: 'row', gap: SPACING.lg },
  statCard: {
    width: 110, padding: SPACING.lg, borderRadius: RADIUS.lg,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center',
  },
  statValue: { fontFamily: FONTS.serif, fontSize: 40, fontWeight: '700', color: COLORS.accent },
  statLabel: { ...TYPE.eyebrow, marginTop: 4 },
  summaryBody: { ...TYPE.body, color: COLORS.muted, textAlign: 'center', paddingHorizontal: SPACING.md },
});
