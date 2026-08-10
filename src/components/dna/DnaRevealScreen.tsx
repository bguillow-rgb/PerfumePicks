import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, RADIUS, SPACING, TYPE } from '@/src/constants/theme';
import type { FragranceDNA } from '@/src/features/dna/types';
import type { BuyableRankResult } from '@/src/features/dna/score';
import { DnaProfileContent } from '@/src/components/dna/DnaProfileContent';
import { ProDecantUpsell } from '@/src/components/dna/ProDecantUpsell';
import { useProStore } from '@/src/stores/useProStore';

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
  /** Go back to the picker to adjust picks. Omit to hide the back affordance.
   *  Never exits onboarding — it just returns to the grid, which keeps its own
   *  retake-only cancel ✕. */
  onBack?: () => void;
}

export function DnaRevealScreen({
  dna,
  hero,
  onContinue,
  onViewDetails,
  onSeeMoreMatches,
  onBack,
}: DnaRevealScreenProps) {
  const insets = useSafeAreaInsets();
  const isPro = useProStore((s) => s.isPro);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {onBack && (
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onBack();
          }}
          hitSlop={12}
          style={[styles.back, { top: insets.top + SPACING.sm }]}
          accessibilityLabel="Back to your picks"
          testID="dna-reveal-back"
        >
          <Ionicons name="chevron-back" size={26} color={COLORS.muted} />
        </Pressable>
      )}
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

        {/* Peak-intent Pro upsell — always shown to free users, never dismissible.
            Reach is the whole problem (~3% of free users hit the paywall today),
            so a one-tap opt-out here is indefensible. Non-blocking: the footer
            below still finishes onboarding for free. */}
        {!isPro && <ProDecantUpsell archetype={dna.archetype?.primary ?? null} />}
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  // Back to the picker. Absolute top-left, above the scroll; mirrors the footer's
  // inset handling so it clears the notch. Left of the centered emblem, no collide.
  back: { position: 'absolute', left: SPACING.sm, zIndex: 10, padding: 6 },
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
});
