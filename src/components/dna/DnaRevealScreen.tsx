import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, RADIUS, SPACING, TYPE } from '@/src/constants/theme';
import type { FragranceDNA } from '@/src/features/dna/types';
import type { BuyableRankResult } from '@/src/features/dna/score';
import { DnaProfileContent } from '@/src/components/dna/DnaProfileContent';
import { useProStore } from '@/src/stores/useProStore';
import { track, EVENTS } from '@/src/lib/observability';

/**
 * DnaRevealScreen — the post-picker celebration reveal (DNA flow v2).
 *
 * A full-screen takeover rendered INLINE inside the /dna route (the onboarding
 * guard pins us there until complete). It hosts the SAME <DnaProfileContent>
 * the canonical taste-profile page renders, in `celebrate` mode, plus the fixed
 * "continue" footer. There is no separate reveal layout to drift — this is just
 * the canonical DNA content with a celebratory entrance + a forward CTA.
 *
 * M3 will replace the entrance inside DnaProfileContent with the Skia
 * "Decanting" reveal; this shell (scroll + footer) stays.
 */
interface DnaRevealScreenProps {
  dna: FragranceDNA;
  /** Picker-session buyable ranking (top match + more matches). */
  hero: BuyableRankResult | null;
  /** Finish onboarding and open the top match's detail page. */
  onContinue: () => void;
  /** Open the top match's detail (card tap / fallback "View details"). */
  onViewDetails: (fragranceId: string) => void;
  /** Open the "more matches" page. */
  onSeeMoreMatches: () => void;
}

export function DnaRevealScreen({
  dna,
  hero,
  onContinue,
  onViewDetails,
  onSeeMoreMatches,
}: DnaRevealScreenProps) {
  const insets = useSafeAreaInsets();
  const isPro = useProStore((s) => s.isPro);
  const [upsellDismissed, setUpsellDismissed] = useState(false);
  // Show the soft Pro card once, to free users, at this peak-intent moment.
  const showUpsell = !isPro && !upsellDismissed;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 96 }]}
        showsVerticalScrollIndicator={false}
      >
        <DnaProfileContent
          dna={dna}
          hero={hero}
          celebrate
          onViewDetails={onViewDetails}
          onSeeMoreMatches={onSeeMoreMatches}
        />

        {showUpsell && (
          <DnaRevealUpsell
            archetype={dna.archetype?.primary ?? null}
            onDismiss={() => setUpsellDismissed(true)}
          />
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + SPACING.sm }]}>
        <Pressable
          style={styles.cta}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onContinue();
          }}
          testID="dna-reveal-continue"
        >
          <Text style={styles.ctaText}>See my top match</Text>
          <Ionicons name="arrow-forward" size={15} color={COLORS.white} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

/**
 * Soft, dismissible Pro card shown to free users on the DNA reveal — the app's
 * highest-intent moment, previously 100% paywall-free. Non-blocking (Continue
 * still finishes onboarding for free); this exists purely to put the offer in
 * front of everyone who activates. Copy leans on the DNA payoff, not a generic
 * "go pro". Routes to the paywall with returnTo=/dna so a decline lands back.
 */
function DnaRevealUpsell({
  archetype,
  onDismiss,
}: {
  archetype: string | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    track(EVENTS.DNA_REVEAL_UPSELL_SHOWN, { archetype });
  }, [archetype]);

  return (
    <View style={styles.upsell}>
      <Pressable style={styles.upsellClose} onPress={onDismiss} hitSlop={10} accessibilityLabel="Dismiss">
        <Ionicons name="close" size={16} color={COLORS.muted} />
      </Pressable>
      <View style={styles.upsellIcon}>
        <Ionicons name="sparkles" size={16} color={COLORS.accent} />
      </View>
      <Text style={styles.upsellTitle}>Unlock your full Fragrance DNA</Text>
      <Text style={styles.upsellBody}>
        Every accord broken out, the houses you keep returning to, the notes you've ruled out — plus
        budget dupes for all your matches.
      </Text>
      <Pressable
        style={styles.upsellCta}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          track(EVENTS.DNA_REVEAL_UPSELL_TAPPED, { archetype });
          router.push('/paywall?returnTo=/dna&from=dna_reveal' as any);
        }}
      >
        <Text style={styles.upsellCtaText}>Go Pro</Text>
        <Ionicons name="arrow-forward" size={13} color={COLORS.accent} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  body: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.xl },
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
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.accent,
    paddingVertical: 15,
    borderRadius: RADIUS.full,
  },
  ctaText: { ...TYPE.label, color: COLORS.white, fontSize: 14, letterSpacing: 1 },

  upsell: {
    marginTop: SPACING.lg,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  upsellClose: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.sm,
    zIndex: 1,
  },
  upsellIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.blushSoft,
    marginBottom: SPACING.sm,
  },
  upsellTitle: { ...TYPE.label, color: COLORS.text, fontSize: 14 },
  upsellBody: { ...TYPE.bodySmall, color: COLORS.muted, marginTop: 4, lineHeight: 18 },
  upsellCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: SPACING.sm,
  },
  upsellCtaText: { ...TYPE.label, color: COLORS.accent, fontSize: 13, letterSpacing: 0.5 },
});
