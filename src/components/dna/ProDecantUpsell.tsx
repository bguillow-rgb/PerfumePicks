import { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '@/src/constants/theme';
import { track, EVENTS } from '@/src/lib/observability';

/**
 * ProDecantUpsell — the Pro offer on the DNA reveal (the app's peak-intent
 * moment and the single biggest lever on paywall reach; only ~3% of free users
 * reach the paywall today).
 *
 * Deliberately OBVIOUS: a clear header, four plainly-stated benefits with
 * checkmarks, and a real button with the free trial. The earlier "elegant"
 * version (ghosted, poetic) read as decoration and didn't communicate that
 * upgrading gets you anything — this states the value flatly and up front, with
 * the money benefit (cheaper dupes) first.
 *
 * Always shown to free users, never dismissible: reach is the whole problem, so
 * a one-tap opt-out on the sole lever is indefensible. Non-blocking — the free
 * "See my top match" footer still finishes onboarding untouched.
 */

const BENEFITS: { title: string; desc: string }[] = [
  { title: 'Cheaper dupes', desc: 'The bottle that smells the same, for 30 to 70% less.' },
  { title: 'Your full Fragrance DNA', desc: 'Every accord weighted, the houses you love, the notes you avoid.' },
  { title: 'Unlimited wardrobe', desc: 'Save every bottle, not just five.' },
  { title: 'Unlimited nose training', desc: 'Keep sharpening your DNA past three swipes a day.' },
];

export function ProDecantUpsell({
  archetype,
  celebrate = true,
}: {
  /** Primary archetype, for analytics parity. */
  archetype: string | null;
  /** Reveal path fades the card in; profile is static. */
  celebrate?: boolean;
}) {
  const surface = celebrate ? 'dna_reveal' : 'taste_profile';

  useEffect(() => {
    // Fires for 100% of free reveals (non-dismissible) — the reach metric.
    track(EVENTS.DNA_REVEAL_UPSELL_SHOWN, { archetype, surface });
  }, [archetype, surface]);

  return (
    <Animated.View
      entering={celebrate ? FadeIn.delay(1100).duration(500) : undefined}
      style={styles.card}
    >
      <Text style={styles.eyebrow}>PERFUME PICKS PRO</Text>
      <Text style={styles.heading}>What you get with Pro</Text>

      <View style={styles.benefits}>
        {BENEFITS.map((b) => (
          <View key={b.title} style={styles.row}>
            <Ionicons name="checkmark-circle" size={22} color={COLORS.accent} style={styles.check} />
            <View style={styles.rowText}>
              <Text style={styles.benefitTitle}>{b.title}</Text>
              <Text style={styles.benefitDesc}>{b.desc}</Text>
            </View>
          </View>
        ))}
      </View>

      <Pressable
        style={styles.cta}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          track(EVENTS.DNA_REVEAL_UPSELL_TAPPED, { archetype, surface });
          router.push(`/paywall?returnTo=/dna&from=${surface}` as any);
        }}
        testID="dna-reveal-upsell-cta"
      >
        <Text style={styles.ctaText}>Try Pro free for 7 days</Text>
        <Ionicons name="arrow-forward" size={16} color={COLORS.white} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // A distinct, bounded offer card so it reads as "here is Pro," not as more
  // DNA content. Parchment fill + soft gold border set it apart from the ivory.
  card: {
    marginTop: SPACING.xl,
    backgroundColor: COLORS.card2,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.accentSoft,
    padding: SPACING.lg,
  },
  eyebrow: { ...TYPE.eyebrow, color: COLORS.accent },
  heading: {
    fontFamily: FONTS.serif,
    fontSize: 25,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 4,
    marginBottom: SPACING.md,
  },
  benefits: { gap: SPACING.md },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
  check: { marginTop: 1 },
  rowText: { flex: 1 },
  benefitTitle: { fontFamily: FONTS.serif, fontSize: 17, fontWeight: '700', color: COLORS.text },
  benefitDesc: { ...TYPE.bodySmall, color: COLORS.muted, marginTop: 1, lineHeight: 19 },

  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.accent,
    paddingVertical: 14,
    borderRadius: RADIUS.full,
    marginTop: SPACING.lg,
  },
  ctaText: { ...TYPE.label, color: COLORS.white, fontSize: 15, letterSpacing: 0.5 },
});
