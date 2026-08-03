import { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, type LayoutChangeEvent } from 'react-native';
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { COLORS, FONTS, SPACING, TYPE } from '@/src/constants/theme';
import { track, EVENTS } from '@/src/lib/observability';

/**
 * ProDecantUpsell — "The Unfinished Pour" (Chief UX, 2026-08).
 *
 * Replaces the old dismissible, sparkle-badged Pro card on the DNA reveal — the
 * app's peak-intent moment and the single biggest lever on paywall reach (only
 * ~3% of free users reach the paywall today). This is NOT a card bolted on; it
 * is the closing movement of the reveal itself: a gold "fill line" (meniscus)
 * draws across the screen and the parts of the DNA that are still developing sit
 * beneath it, as liquid that hasn't finished decanting. Going Pro is finishing
 * the pour.
 *
 * Truthfulness note: a brand-new user has NO behavioral signals at reveal time
 * (DnaProfileContent renders the lean set with no SignalsBlock). So the ghosted
 * layers below the line are framed as genuinely still-settling, not fabricated
 * data. We never imply the free DNA is broken — just that the base is developing.
 *
 * Always shown to free users, never dismissible: reach is the whole problem, so
 * a one-tap opt-out on the sole lever is indefensible. Non-blocking — the free
 * "See my top match" footer still finishes onboarding untouched.
 */

const LAYERS = [
  'Every accord broken out and weighted.',
  'The houses you keep coming back to.',
  "The notes you've ruled out.",
];

const LEDGER = [
  "On any bottle you open: the exact dupe, and what you'd save. Usually 30 to 70 percent.",
  'Your whole collection, not the first five. And a nose that keeps learning past three swipes a day.',
];

export function ProDecantUpsell({
  archetype,
  celebrate = true,
}: {
  /** Primary archetype, for analytics parity with the old upsell. */
  archetype: string | null;
  /** Reveal path animates the meniscus in as the final beat; profile is static. */
  celebrate?: boolean;
}) {
  const surface = celebrate ? 'dna_reveal' : 'taste_profile';

  useEffect(() => {
    // Now fires for 100% of free reveals (component is non-dismissible), which
    // is the point — this is the reach metric.
    track(EVENTS.DNA_REVEAL_UPSELL_SHOWN, { archetype, surface });
  }, [archetype, surface]);

  // The meniscus finds its level: width grows left → right once, as the last
  // beat of the reveal. Measured in px from the full-bleed container so the draw
  // is reliable (percentage widths animate poorly across platforms).
  const drawn = useSharedValue(0);
  const onLineLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && drawn.value === 0) {
      drawn.value = celebrate
        ? withDelay(1100, withTiming(w, { duration: 600, easing: Easing.out(Easing.cubic) }))
        : withTiming(w, { duration: 0 });
    }
  };
  const lineStyle = useAnimatedStyle(() => ({ width: drawn.value }));

  return (
    <View style={styles.wrap}>
      {/* Full-bleed liquid level. The track holds the layout width; the gold line
          animates across it. */}
      <View style={styles.lineTrack} onLayout={onLineLayout}>
        <Animated.View style={[styles.line, lineStyle]} />
      </View>

      <Animated.View
        entering={celebrate ? FadeIn.delay(1250).duration(600) : undefined}
        style={styles.content}
      >
        <Text style={styles.eyebrow}>STILL DECANTING</Text>
        <Text style={styles.headline}>You've read the top notes.{'\n'}The base is still settling.</Text>

        <View style={styles.layers}>
          {LAYERS.map((line) => (
            <View key={line} style={styles.layerRow}>
              <View style={styles.layerTick} />
              <Text style={styles.layerText}>{line}</Text>
            </View>
          ))}
        </View>

        <View style={styles.rule} />

        {LEDGER.map((line) => (
          <Text key={line} style={styles.ledger}>{line}</Text>
        ))}

        <Pressable
          style={styles.cta}
          hitSlop={8}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            track(EVENTS.DNA_REVEAL_UPSELL_TAPPED, { archetype, surface });
            router.push(`/paywall?returnTo=/dna&from=${surface}` as any);
          }}
          testID="dna-reveal-upsell-cta"
        >
          <Text style={styles.ctaText}>See the full read</Text>
          <Ionicons name="arrow-forward" size={14} color={COLORS.accent} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Sits below the radar as the final section. Extra top space so the line reads
  // as a horizon, not a divider inside the content above it.
  wrap: { marginTop: SPACING.xxl },
  // Full-bleed: cancel the scroll body's SPACING.lg horizontal padding so the
  // gold line runs edge to edge like a liquid level.
  lineTrack: { height: 1.5, marginHorizontal: -SPACING.lg },
  line: { height: 1.5, backgroundColor: COLORS.accent },

  // Left-aligned, deliberately asymmetric — copy hangs off the left of the line.
  content: { alignItems: 'flex-start', marginTop: SPACING.lg },
  eyebrow: { ...TYPE.eyebrow, color: COLORS.accent },
  headline: {
    fontFamily: FONTS.serif,
    fontSize: 30,
    fontWeight: '600',
    color: COLORS.text,
    lineHeight: 36,
    marginTop: SPACING.sm,
  },

  // The still-developing DNA layers, "under the surface": legible but undecanted.
  layers: { marginTop: SPACING.lg, gap: 10 },
  layerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  layerTick: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: COLORS.accentSoft },
  layerText: { fontFamily: FONTS.serif, fontSize: 18, color: COLORS.subtle, lineHeight: 22 },

  rule: {
    alignSelf: 'stretch',
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.lg,
  },

  ledger: { ...TYPE.bodySmall, color: COLORS.muted, lineHeight: 20, marginBottom: SPACING.sm },

  cta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACING.sm, paddingVertical: 6 },
  ctaText: {
    fontFamily: FONTS.serif,
    fontSize: 19,
    fontWeight: '600',
    color: COLORS.accent,
    textDecorationLine: 'underline',
  },
});
