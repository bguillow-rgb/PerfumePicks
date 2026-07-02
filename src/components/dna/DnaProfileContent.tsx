import { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Share } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '@/src/constants/theme';
import type { FragranceDNA } from '@/src/features/dna/types';
import type { BuyableRankResult } from '@/src/features/dna/score';
import {
  ARCHETYPE_COPY,
  LOW_CONFIDENCE_IDENTITY,
  TRAIT_CHIP_LABEL,
  journeyLine,
  topTraits,
} from '@/src/features/dna/revealCopy';
import { JourneyLadder } from '@/src/components/dna/JourneyLadder';
import { LivingArchetypeReadout } from '@/src/components/dna/LivingArchetypeReadout';
import { AccordRadar } from '@/src/components/dna/AccordRadar';
import { TopMatchCard } from '@/src/components/dna/TopMatchCard';
import { DecantingReveal } from '@/src/components/dna/DecantingReveal';
import { SkiaBoundary } from '@/src/components/dna/SkiaBoundary';
import { useDnaMonetizationEnabled } from '@/src/features/dna/killSwitch';
import { track, EVENTS } from '@/src/lib/observability';

/** Below this confidence we soften the identity line (too few/weak signals). */
const LOW_CONFIDENCE = 0.35;

/** Hold the reveal headline back until the decanting pour is essentially full
 *  (DecantingReveal lands its haptic at ~1500ms), so the name + buzz land as one. */
const REVEAL_TEXT_DELAY = 1300;

/** Signals block (notes/accords/families/avoid/price) — only rendered off the
 *  celebrate path, where real behavioral signals exist. */
export interface TasteSignals {
  liked_notes: Record<string, number>;
  disliked_notes: Record<string, number>;
  preferred_accords: Record<string, number>;
  preferred_families: Record<string, number>;
  avg_price_tier: number | null;
  longevity_preference: number | null;
  signal_count: number;
}

interface DnaProfileContentProps {
  dna: FragranceDNA;
  /** Buyable ranking from the picker session — drives the TOP MATCH card +
   *  "more matches" affordance. Null when monetization is off / not computed. */
  hero: BuyableRankResult | null;
  /**
   * Celebrate mode = the post-picker reveal. Plays the entrance animation, fires
   * the success haptic + DNA_REVEAL_VIEWED once, and renders the LEAN payoff set
   * (archetype + journey + match + radar) with NO behavioral-signals sections
   * (there are none yet at reveal time). Off = the re-viewable taste profile.
   */
  celebrate: boolean;
  /** Open a bottle's detail page (top match card + fallback). */
  onViewDetails: (fragranceId: string) => void;
  /** Open the "more matches" page. Hidden when there are no extra matches. */
  onSeeMoreMatches?: () => void;
  /** Behavioral signals — only shown when NOT celebrating. */
  signals?: TasteSignals | null;
  /** Retake entry — only shown when NOT celebrating. */
  onRetake?: () => void;
}

/**
 * DnaProfileContent — the ONE canonical rendering of the user's Fragrance DNA.
 *
 * Both surfaces render this: the post-picker celebration reveal (celebrate=true,
 * mounted inside the /dna route because the onboarding guard pins us there) and
 * the re-viewable "My Taste Profile" page (celebrate=false). Collapsing them into
 * one component is what kills the old three-way drift between DnaReveal, the
 * taste-profile DNA card, and the home teaser — the archetype copy, journey, and
 * trait chips can no longer disagree across surfaces.
 */
export function DnaProfileContent({
  dna,
  hero,
  celebrate,
  onViewDetails,
  onSeeMoreMatches,
  signals,
  onRetake,
}: DnaProfileContentProps) {
  // Fall back to a known archetype if primary ever resolves to a key we don't
  // have copy for — a missing key here would throw on copy.visual.tint, and this
  // renders on the /dna route the onboarding guard pins new users to.
  const copy = ARCHETYPE_COPY[dna.archetype.primary] ?? ARCHETYPE_COPY.the_executive;
  const lowConfidence = dna.confidence < LOW_CONFIDENCE;
  const identity = lowConfidence ? LOW_CONFIDENCE_IDENTITY : copy.identity;
  const jLine = journeyLine(dna.journey);
  const traits = topTraits(dna.traits.values, 3);
  // OTA feature flag (fail-open ON): gates ONLY the affiliate surfaces (top-match
  // card + "more matches"). Killing it leaves the reveal/profile fully intact, so
  // we can pull the commercial card over-the-air if ranking/links misbehave on
  // real devices without an App Store round-trip.
  const monetizationEnabled = useDnaMonetizationEnabled();

  // Celebrate analytics, fired once on reveal. The success HAPTIC is owned by
  // DecantingReveal so it lands exactly as the pour completes (not on mount).
  useEffect(() => {
    if (!celebrate) return;
    track(EVENTS.DNA_REVEAL_VIEWED, {
      archetype: dna.archetype.primary,
      confidence: dna.confidence,
      low_confidence: lowConfidence,
    });
  }, [celebrate, dna.archetype.primary, dna.confidence, lowConfidence]);

  const onShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    track(EVENTS.DNA_REVEAL_SHARED, { archetype: dna.archetype.primary });
    try {
      await Share.share({
        message: `My Fragrance DNA is "${copy.name}". ${identity} (via Perfume Picks)`,
      });
    } catch {
      // user dismissed the share sheet — nothing to do.
    }
  };

  const hasMoreMatches = !!hero && !hero.fallbackUsed && hero.matches.length > 0;

  // Entrance wrappers: animated on the celebrate path, inert otherwise. Keeping
  // both paths in one tree (vs a parallel static copy) is what guarantees the
  // reveal and the profile show byte-identical content.
  const Enter = celebrate ? Animated.View : View;
  const EnterText = celebrate ? Animated.Text : Text;
  const fade = (delay = 0) => (celebrate ? FadeIn.delay(delay).duration(500) : undefined);

  return (
    <>
      {celebrate ? (
        <View style={styles.celebrateHead}>
          {/* The decanting pour (~1.5s) IS the emblem entrance. The eyebrow/name/
              identity are held back to land WITH the pour completion, so the
              archetype name + success haptic hit together as the payoff. */}
          <SkiaBoundary
            fallback={
              <View
                style={[styles.emblemFallback, { borderColor: copy.visual.tint }]}
                testID="dna-reveal-emblem"
              >
                <Ionicons name={copy.visual.icon as any} size={34} color={copy.visual.tint} />
              </View>
            }
          >
            <DecantingReveal
              tint={copy.visual.tint}
              icon={copy.visual.icon}
              testID="dna-reveal-emblem"
            />
          </SkiaBoundary>
          <EnterText entering={fade(REVEAL_TEXT_DELAY)} style={styles.celebrateEyebrow}>YOUR FRAGRANCE DNA</EnterText>
          <EnterText
            entering={celebrate ? FadeInDown.delay(REVEAL_TEXT_DELAY + 80).springify().damping(14).mass(0.9) : undefined}
            style={styles.celebrateArchetype}
            testID="dna-reveal-archetype"
          >
            {copy.name}
          </EnterText>
          <EnterText entering={fade(REVEAL_TEXT_DELAY + 320)} style={styles.celebrateIdentity}>{identity}</EnterText>
        </View>
      ) : (
        <View style={styles.dnaCard}>
          <Text style={styles.dnaEyebrow}>MY FRAGRANCE DNA</Text>
          <View style={styles.dnaBadge}>
            <Ionicons name="sparkles" size={16} color={COLORS.accent} />
            <Text style={styles.dnaArchetype} testID="dna-reveal-archetype">{copy.name}</Text>
          </View>
          <Text style={styles.dnaIdentity}>{identity}</Text>
          <LivingArchetypeReadout dna={dna} variant="full" />
          {jLine && <Text style={styles.dnaJourney}>{jLine}</Text>}
          {traits.length > 0 && (
            <View style={styles.dnaTraitRow}>
              {traits.map((t) => (
                <View key={t} style={styles.dnaTraitChip} testID="dna-trait-chip">
                  <Text style={styles.dnaTraitText}>{TRAIT_CHIP_LABEL[t]}</Text>
                </View>
              ))}
            </View>
          )}
          {onRetake && (
            <Pressable testID="dna-retake" style={styles.retakeBtn} onPress={onRetake}>
              <Ionicons name="refresh" size={16} color={COLORS.text} />
              <Text style={styles.retakeText}>Retake</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Celebrate-only: journey line + trait chips + share live below the name. */}
      {celebrate && (
        <>
          {jLine && (
            <Enter entering={fade(450)} style={styles.celebrateJourneyWrap}>
              <Ionicons name="trending-up" size={15} color={COLORS.accent} />
              <Text style={styles.celebrateJourney}>{jLine}</Text>
            </Enter>
          )}
          {traits.length > 0 && (
            <Enter entering={fade(600)} style={styles.celebrateChips}>
              {traits.map((t) => (
                <View key={t} style={styles.celebrateChip} testID="dna-trait-chip">
                  <Text style={styles.celebrateChipText}>{TRAIT_CHIP_LABEL[t]}</Text>
                </View>
              ))}
            </Enter>
          )}
          <Enter entering={fade(750)}>
            <Pressable style={styles.share} onPress={onShare} testID="dna-reveal-share" hitSlop={8}>
              <Ionicons name="share-outline" size={16} color={COLORS.accent} />
              <Text style={styles.shareText}>Share your DNA</Text>
            </Pressable>
          </Enter>
        </>
      )}

      {/* TOP MATCH — affiliate-first hero. Present on both surfaces when computed
          AND the monetization flag is on (OTA-killable, fail-open). */}
      {hero?.hero && monetizationEnabled && (
        <Enter entering={fade(850)}>
          <TopMatchCard
            match={hero.hero}
            sourceScreen={celebrate ? 'dna_reveal' : 'taste_profile'}
            onViewDetails={onViewDetails}
          />
          {hasMoreMatches && onSeeMoreMatches && (
            <Pressable style={styles.moreMatches} onPress={onSeeMoreMatches} testID="dna-see-more-matches">
              <Text style={styles.moreMatchesText}>Show me more matches</Text>
              <Ionicons name="chevron-forward" size={16} color={COLORS.accent} />
            </Pressable>
          )}
        </Enter>
      )}

      {/* Non-celebrate: the full predictive journey ladder. */}
      {!celebrate && <View style={{ marginTop: SPACING.xl }}><JourneyLadder dna={dna} /></View>}

      {/* Accord radar — both surfaces. */}
      <View style={styles.radarSection}>
        <Text style={styles.radarLabel}>YOUR ACCORD PROFILE</Text>
        <AccordRadar accords={dna.accords} />
      </View>

      {/* Behavioral signals — only off the celebrate path. */}
      {!celebrate && signals && signals.signal_count > 0 && <SignalsBlock signals={signals} />}
    </>
  );
}

export function SignalsBlock({ signals }: { signals: TasteSignals }) {
  const topNotes = Object.entries(signals.liked_notes ?? {}).sort(([, a], [, b]) => b - a).slice(0, 10);
  const topAccords = Object.entries(signals.preferred_accords ?? {}).sort(([, a], [, b]) => b - a).slice(0, 8);
  const topFamilies = Object.entries(signals.preferred_families ?? {}).sort(([, a], [, b]) => b - a).slice(0, 6);
  const avoidNotes = Object.entries(signals.disliked_notes ?? {}).sort(([, a], [, b]) => b - a).slice(0, 6);
  const maxNote = topNotes.length > 0 ? topNotes[0][1] : 1;
  const maxAccord = topAccords.length > 0 ? topAccords[0][1] : 1;

  return (
    <View style={{ marginTop: SPACING.xl }}>
      <Text style={styles.signalCount}>{signals.signal_count} signals collected</Text>

      <Section label="YOUR TOP NOTES">
        {topNotes.map(([note, weight]) => (
          <View key={note} style={styles.barRow}>
            <Text style={styles.barLabel} numberOfLines={1}>{note}</Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${(weight / maxNote) * 100}%` }]} />
            </View>
          </View>
        ))}
      </Section>

      <Section label="PREFERRED ACCORDS">
        <View style={styles.pillGrid}>
          {topAccords.map(([accord, weight]) => (
            <View key={accord} style={[styles.accordPill, { opacity: 0.4 + (weight / maxAccord) * 0.6 }]}>
              <Text style={styles.accordText}>{accord}</Text>
            </View>
          ))}
        </View>
      </Section>

      {topFamilies.length > 0 && (
        <Section label="FRAGRANCE FAMILIES">
          <View style={styles.pillGrid}>
            {topFamilies.map(([fam]) => (
              <View key={fam} style={styles.familyPill}><Text style={styles.familyText}>{fam}</Text></View>
            ))}
          </View>
        </Section>
      )}

      {avoidNotes.length > 0 && (
        <Section label="NOTES TO AVOID">
          <View style={styles.pillGrid}>
            {avoidNotes.map(([note]) => (
              <View key={note} style={styles.avoidPill}><Text style={styles.avoidText}>{note}</Text></View>
            ))}
          </View>
        </Section>
      )}

      <View style={styles.statsRow}>
        {signals.avg_price_tier != null && (
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{'$'.repeat(Math.round(signals.avg_price_tier))}</Text>
            <Text style={styles.statLabel}>Avg Price</Text>
          </View>
        )}
        {signals.longevity_preference != null && (
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{signals.longevity_preference.toFixed(1)}</Text>
            <Text style={styles.statLabel}>Longevity Pref</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Celebrate head ──
  celebrateHead: { alignItems: 'center' },
  // Static fallback emblem if Skia fails to mount (SkiaBoundary). Occupies the
  // same vertical space the 168px decanting canvas did, so the layout doesn't jump.
  emblemFallback: {
    width: 88, height: 88, borderRadius: 44, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', marginVertical: 40,
  },
  celebrateEyebrow: { ...TYPE.eyebrow, textAlign: 'center', marginBottom: SPACING.md },
  celebrateArchetype: {
    fontFamily: FONTS.serif, fontSize: 40, fontWeight: '700',
    color: COLORS.text, textAlign: 'center', lineHeight: 46,
  },
  celebrateIdentity: {
    ...TYPE.body, color: COLORS.muted, textAlign: 'center',
    marginTop: SPACING.md, paddingHorizontal: SPACING.sm, lineHeight: 24,
  },
  celebrateJourneyWrap: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center',
    gap: 6, marginTop: SPACING.lg, paddingHorizontal: SPACING.sm,
  },
  celebrateJourney: { ...TYPE.bodySmall, color: COLORS.text, flexShrink: 1, lineHeight: 20 },
  celebrateChips: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    gap: SPACING.sm, marginTop: SPACING.lg,
  },
  celebrateChip: {
    paddingHorizontal: SPACING.md, paddingVertical: 7, borderRadius: RADIUS.full,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.accentSoft,
  },
  celebrateChipText: { ...TYPE.label, fontSize: 13, color: COLORS.accent },
  share: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 6, marginTop: SPACING.lg, paddingVertical: 6 },
  shareText: { ...TYPE.label, fontSize: 14, color: COLORS.accent, textDecorationLine: 'underline' },

  // ── Static DNA card (taste profile) ──
  dnaCard: {
    backgroundColor: COLORS.card, borderRadius: RADIUS.lg, borderWidth: 1,
    borderColor: COLORS.border, padding: SPACING.lg,
  },
  dnaEyebrow: { ...TYPE.eyebrow, marginBottom: SPACING.sm },
  dnaBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SPACING.sm },
  dnaArchetype: { fontFamily: FONTS.serif, fontSize: 26, fontWeight: '700', color: COLORS.text },
  dnaIdentity: { ...TYPE.body, color: COLORS.text, marginBottom: SPACING.sm },
  dnaJourney: { ...TYPE.bodySmall, color: COLORS.muted, marginBottom: SPACING.md },
  dnaTraitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: SPACING.md },
  dnaTraitChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full, backgroundColor: COLORS.card2 },
  dnaTraitText: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  retakeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: SPACING.sm, borderRadius: RADIUS.full,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card2,
  },
  retakeText: { ...TYPE.label, color: COLORS.text },

  // ── More matches ──
  moreMatches: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    marginTop: SPACING.md, paddingVertical: SPACING.sm,
  },
  moreMatchesText: { ...TYPE.label, fontSize: 14, color: COLORS.accent, textDecorationLine: 'underline' },

  // ── Radar ──
  radarSection: { alignItems: 'center', marginTop: SPACING.xxl },
  radarLabel: { ...TYPE.eyebrow, marginBottom: SPACING.md },

  // ── Signals ──
  signalCount: { ...TYPE.caption, color: COLORS.accent, textAlign: 'center', marginBottom: SPACING.lg },
  section: { marginBottom: SPACING.xl },
  sectionLabel: { ...TYPE.eyebrow, marginBottom: SPACING.md },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  barLabel: { width: 90, ...TYPE.bodySmall, color: COLORS.text, textTransform: 'capitalize' },
  barTrack: { flex: 1, height: 8, backgroundColor: COLORS.card2, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: COLORS.accent, borderRadius: 4 },
  pillGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  accordPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: RADIUS.full, backgroundColor: COLORS.accent },
  accordText: { color: COLORS.white, fontSize: 13, fontWeight: '600' },
  familyPill: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: RADIUS.full,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
  },
  familyText: { ...TYPE.label, fontSize: 13, color: COLORS.text },
  avoidPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: RADIUS.full, backgroundColor: COLORS.card2 },
  avoidText: { fontSize: 13, fontWeight: '500', color: COLORS.danger },
  statsRow: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.md },
  statCard: {
    flex: 1, padding: SPACING.lg, backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center',
  },
  statValue: { fontFamily: FONTS.serif, fontSize: 28, fontWeight: '700', color: COLORS.accent },
  statLabel: { ...TYPE.caption, marginTop: 4 },
});
