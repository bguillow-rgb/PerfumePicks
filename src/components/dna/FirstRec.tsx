import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '@/src/constants/theme';
import { useCatalogStore, type Fragrance } from '@/src/stores/useCatalogStore';
import type { RankedDnaRec } from '@/src/features/dna/score';
import type { FragranceDNA } from '@/src/features/dna/types';
import { routeDnaCta, ctaForKind, type DnaCtaKind } from '@/src/features/dna/ctaRouting';
import { track, EVENTS } from '@/src/lib/observability';

/**
 * First rec (S6) — exactly ONE displayable bottle the moment after the reveal.
 * Rail-relaxation (M1) guarantees `recs` is non-empty, so there is never an empty
 * state here. "Not quite me" re-rolls through the ranked tail, free for the first
 * few (the paywall hook lands in M6). "Skip to app" is the post-reveal Apple
 * reviewer safety valve and lives here, not earlier.
 */

/** Free re-rolls before the (M6) paywall would gate. */
const REROLL_FREE_CAP = 3;

interface FirstRecProps {
  recs: RankedDnaRec[];
  /** The live DNA — drives the trait-routed CTA (valueHunter→dupe, luxury→original, explorer→sample). */
  dna: FragranceDNA;
  /** Fired with the routed intent + bottle id; parent finishes onboarding and routes into the app. */
  onCta: (kind: DnaCtaKind, id: string) => void;
  onMyDna: () => void;
  onSkip: () => void;
}

function priceLabel(cents: number): string | null {
  if (!cents || cents <= 0) return null;
  return `$${Math.round(cents / 100)}`;
}

export function FirstRec({ recs, dna, onCta, onMyDna, onSkip }: FirstRecProps) {
  const insets = useSafeAreaInsets();
  const [idx, setIdx] = useState(0);
  const [rerolls, setRerolls] = useState(0);

  const fetchDupeCount = useCatalogStore((s) => s.fetchDupeCount);

  const rec = recs[Math.min(idx, recs.length - 1)];
  const frag = rec.fragrance as unknown as Fragrance;
  const price = priceLabel(frag.retail_msrp_usd_cents);

  // Does THIS bottle actually have a verified dupe? Null while resolving. We
  // never promise a dupe we can't deliver, so the dupe CTA only shows once this
  // is confirmed true; until then it falls back to the safe sample CTA below.
  const [hasDupe, setHasDupe] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    setHasDupe(null);
    fetchDupeCount(frag.id).then((n) => { if (!cancelled) setHasDupe(n > 0); });
    return () => { cancelled = true; };
  }, [frag.id, fetchDupeCount]);

  // Trait-routed CTA — the reasons above stay monetization-blind; only THIS
  // button changes by buyer trait (valueHunter→dupe, luxury→original, explorer→sample).
  // A dupe-routed CTA is downgraded to the sample CTA unless a dupe is confirmed
  // to exist for this bottle, so the button never says "Find the dupe" with none.
  const baseCta = routeDnaCta(dna.traits.values);
  const cta = baseCta.kind === 'dupe' && hasDupe !== true ? ctaForKind('sample') : baseCta;
  // Cap the re-roll cycle to the free window AND the available pool.
  const rerollPool = Math.min(recs.length, REROLL_FREE_CAP + 1);
  const canReroll = rerollPool > 1 && rerolls < REROLL_FREE_CAP;

  useEffect(() => {
    track(EVENTS.DNA_FIRST_REC_VIEWED, { fragrance_id: frag.id, rank: idx });
  }, [frag.id, idx]);

  const onNotQuiteMe = () => {
    if (!canReroll) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = (idx + 1) % rerollPool;
    setIdx(next);
    setRerolls((r) => r + 1);
    track(EVENTS.DNA_FIRST_REC_REROLL, { from: frag.id, count: rerolls + 1 });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 150 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.eyebrow}>YOUR FIRST MATCH</Text>
        <Text style={styles.cursive}>made for your DNA</Text>

        <Animated.View key={frag.id} entering={FadeIn.duration(350)} style={styles.card} testID="dna-first-rec">
          <Image source={{ uri: frag.image_url }} style={styles.image} contentFit="cover" />
          <Text style={styles.brand}>{frag.brand}</Text>
          <Text style={styles.name} numberOfLines={2}>{frag.name}</Text>
          {price && <Text style={styles.price}>{price}</Text>}

          <View style={styles.reasons}>
            {rec.reasons.map((r, i) => (
              <View key={i} style={styles.reasonRow}>
                <Ionicons name="checkmark-circle" size={16} color={COLORS.accent} />
                <Text style={styles.reasonText}>{r}</Text>
              </View>
            ))}
          </View>
        </Animated.View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + SPACING.sm }]}>
        <Text style={styles.ctaSub}>{cta.sub}</Text>
        <View style={styles.primaryRow}>
          <Pressable
            style={styles.cta}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              track(EVENTS.DNA_CTA_TAPPED, { kind: cta.kind, fragrance_id: frag.id, surface: 'first_rec' });
              onCta(cta.kind, frag.id);
            }}
            testID="dna-rec-cta"
            accessibilityLabel={cta.label}
          >
            <Text style={styles.ctaText}>{cta.label}</Text>
            <Ionicons name="arrow-forward" size={15} color={COLORS.white} />
          </Pressable>
          <Pressable
            style={[styles.secondaryBtn, !canReroll && styles.secondaryBtnDim]}
            onPress={onNotQuiteMe}
            disabled={!canReroll}
            testID="dna-rec-not-me"
          >
            <Text style={styles.secondaryText}>Not quite me</Text>
          </Pressable>
        </View>

        <View style={styles.linkRow}>
          <Pressable onPress={onMyDna} hitSlop={8} testID="dna-rec-my-dna">
            <Text style={styles.linkText}>My full DNA</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              track(EVENTS.DNA_SKIP_TO_APP, { from: 'first_rec' });
              onSkip();
            }}
            hitSlop={8}
            testID="dna-rec-skip"
          >
            <Text style={styles.linkText}>Skip to app →</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  body: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, alignItems: 'center' },
  eyebrow: { ...TYPE.eyebrow, textAlign: 'center' },
  cursive: {
    fontFamily: 'PinyonScript_400Regular',
    fontSize: 28,
    color: COLORS.accent,
    lineHeight: 40,
    marginBottom: SPACING.md,
  },
  card: {
    width: '100%',
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    alignItems: 'center',
  },
  image: {
    width: 150,
    height: 188,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.blushSoft,
  },
  brand: { ...TYPE.caption, color: COLORS.muted, marginTop: SPACING.md },
  name: {
    fontFamily: FONTS.serif,
    fontSize: 24,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
    marginTop: 2,
  },
  price: { ...TYPE.label, color: COLORS.accent, marginTop: 6, fontSize: 16 },
  reasons: { alignSelf: 'stretch', marginTop: SPACING.lg, gap: SPACING.sm },
  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  reasonText: { ...TYPE.body, color: COLORS.text, flexShrink: 1, fontSize: 15 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  ctaSub: { ...TYPE.caption, color: COLORS.muted, textAlign: 'center', marginBottom: SPACING.sm },
  primaryRow: { flexDirection: 'row', gap: SPACING.sm },
  cta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.accent,
    paddingVertical: 15,
    borderRadius: RADIUS.full,
  },
  ctaText: { ...TYPE.label, color: COLORS.white, fontSize: 14, letterSpacing: 1 },
  secondaryBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  secondaryBtnDim: { opacity: 0.4 },
  secondaryText: { ...TYPE.label, color: COLORS.text, fontSize: 14 },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xs,
    paddingTop: SPACING.md,
  },
  linkText: { ...TYPE.label, color: COLORS.accent, fontSize: 14, textDecorationLine: 'underline' },
});
