import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '@/src/constants/theme';
import { track, EVENTS } from '@/src/lib/observability';
import { useCatalogStore, type DupeTeaser } from '@/src/stores/useCatalogStore';

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

/**
 * A teaser is worth leading with only when it has real tension: at least one
 * dupe AND either a dollar figure or a tight (non-loose, >=70%) match. A
 * "1 loose dupe, unknown savings" headline is weaker than the generic card.
 */
function teaserIsCompelling(t: DupeTeaser | null): t is DupeTeaser {
  if (!t || t.dupeCount < 1) return false;
  const savings = (t.maxSavingsCents ?? 0) >= 1000; // $10+ or don't lead with money
  const tight = (t.bestMatchPct ?? 0) >= 70;
  return savings || tight;
}

/** "Save up to $180" style dollars — whole dollars, floor, no cents. */
function dollars(cents: number): string {
  return `$${Math.floor(cents / 100)}`;
}

export function ProDecantUpsell({
  archetype,
  celebrate = true,
  topMatch = null,
}: {
  /** Primary archetype, for analytics parity. */
  archetype: string | null;
  /** Reveal path fades the card in; profile is static. */
  celebrate?: boolean;
  /**
   * The user's top match (slug + display name) — lets the card lead with THIS
   * user's dupe savings instead of the generic pitch. Null keeps the generic
   * card (taste_profile surface, or no buyable hero).
   */
  topMatch?: { slug: string; name?: string | null } | null;
}) {
  const surface = celebrate ? 'dna_reveal' : 'taste_profile';
  const [teaser, setTeaser] = useState<DupeTeaser | null>(null);

  useEffect(() => {
    // Fires for 100% of free reveals (non-dismissible) — the reach metric.
    track(EVENTS.DNA_REVEAL_UPSELL_SHOWN, { archetype, surface });
  }, [archetype, surface]);

  // Pull the top match's savings-anchored teaser (count + best % + max $ —
  // never the bottle identity; that relationship is the paid product). Fails
  // soft: any error just leaves the generic card in place.
  useEffect(() => {
    let cancelled = false;
    if (!topMatch?.slug) return;
    useCatalogStore
      .getState()
      .fetchDupeTeaser(topMatch.slug)
      .then((t) => { if (!cancelled) setTeaser(t); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [topMatch?.slug]);

  const personalized = teaserIsCompelling(teaser);

  // Reuse the established dupe-teaser impression event so this shows up in the
  // existing dupe funnel next to the fragrance-detail teaser.
  useEffect(() => {
    if (!personalized || !teaser) return;
    track(EVENTS.DUPE_TEASER_SHOWN, { surface, locked_count: teaser.dupeCount });
  }, [personalized, teaser, surface]);

  const matchName = topMatch?.name?.trim() || 'your top match';

  // Money line, built only from the numbers we actually have. Loose matches
  // (<70%) never print a percentage (same honesty rule as DupeList).
  let heading = 'What you get with Pro';
  let subline: string | null = null;
  if (personalized && teaser) {
    const one = teaser.dupeCount === 1;
    heading = one ? `There's a dupe for ${matchName}` : `${teaser.dupeCount} dupes for ${matchName}`;
    const pct = (teaser.bestMatchPct ?? 0) >= 70 ? teaser.bestMatchPct : null;
    const save = (teaser.maxSavingsCents ?? 0) >= 1000 ? dollars(teaser.maxSavingsCents!) : null;
    if (pct && save) {
      subline = one
        ? `It's a ${pct}% match and costs up to ${save} less. Pro shows you the bottle.`
        : `The closest is a ${pct}% match, up to ${save} cheaper. Pro shows you which bottles.`;
    } else if (save) {
      subline = one
        ? `It costs up to ${save} less. Pro shows you the bottle.`
        : `They cost up to ${save} less. Pro shows you which bottles.`;
    } else {
      subline = one
        ? `It's a ${pct}% match. Pro shows you the bottle.`
        : `The closest is a ${pct}% match. Pro shows you which bottles.`;
    }
  }

  // When the headline already sells the dupes, the generic dupes bullet is
  // redundant — show the other three benefits under it.
  const benefits = personalized ? BENEFITS.slice(1) : BENEFITS;

  return (
    <Animated.View
      entering={celebrate ? FadeIn.delay(1100).duration(500) : undefined}
      style={styles.card}
    >
      <Text style={styles.eyebrow}>PERFUME PICKS PRO</Text>
      <Text style={styles.heading}>{heading}</Text>
      {subline && <Text style={styles.subline}>{subline}</Text>}

      <View style={styles.benefits}>
        {benefits.map((b) => (
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
          track(EVENTS.DNA_REVEAL_UPSELL_TAPPED, {
            archetype,
            surface,
            personalized,
            dupe_count: teaser?.dupeCount ?? null,
            max_savings_cents: teaser?.maxSavingsCents ?? null,
            best_match_pct: teaser?.bestMatchPct ?? null,
          });
          router.push(`/paywall?returnTo=/dna&from=${surface}` as any);
        }}
        testID="dna-reveal-upsell-cta"
      >
        <Text style={styles.ctaText}>
          {personalized
            ? teaser?.dupeCount === 1 ? 'See it free for 7 days' : 'See them free for 7 days'
            : 'Try Pro free for 7 days'}
        </Text>
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
  // The money line under a personalized heading. Sits inside the heading's
  // bottom margin, so it pulls up and re-adds its own gap before the benefits.
  subline: {
    ...TYPE.body,
    color: COLORS.text,
    lineHeight: 21,
    marginTop: -SPACING.md + 2,
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
