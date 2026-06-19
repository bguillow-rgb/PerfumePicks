import { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Share } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '@/src/constants/theme';
import type { FragranceDNA } from '@/src/features/dna/types';
import {
  ARCHETYPE_COPY,
  LOW_CONFIDENCE_IDENTITY,
  TRAIT_CHIP_LABEL,
  journeyLine,
  topTraits,
} from '@/src/features/dna/revealCopy';
import { AccordRadar } from './AccordRadar';
import { track, EVENTS } from '@/src/lib/observability';

/** Below this, we soften the identity line — too few/weak signals to be confident. */
const LOW_CONFIDENCE = 0.35;

interface DnaRevealProps {
  dna: FragranceDNA;
  onContinue: () => void;
}

export function DnaReveal({ dna, onContinue }: DnaRevealProps) {
  const insets = useSafeAreaInsets();
  const copy = ARCHETYPE_COPY[dna.archetype.primary];
  const lowConfidence = dna.confidence < LOW_CONFIDENCE;
  const identity = lowConfidence ? LOW_CONFIDENCE_IDENTITY : copy.identity;
  const jLine = journeyLine(dna.journey);
  const traits = topTraits(dna.traits.values, 3);

  // One celebratory haptic + analytics, the instant the name lands.
  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    track(EVENTS.DNA_REVEAL_VIEWED, {
      archetype: dna.archetype.primary,
      confidence: dna.confidence,
      low_confidence: lowConfidence,
    });
  }, [dna.archetype.primary, dna.confidence, lowConfidence]);

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

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 96 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          entering={FadeIn.duration(500)}
          style={[
            styles.emblem,
            { borderColor: copy.visual.tint, backgroundColor: `${copy.visual.tint}1A` },
          ]}
          testID="dna-reveal-emblem"
        >
          <Ionicons name={copy.visual.icon as any} size={28} color={copy.visual.tint} />
        </Animated.View>

        <Animated.Text entering={FadeIn.duration(500)} style={styles.eyebrow}>
          YOUR FRAGRANCE DNA
        </Animated.Text>

        {/* Archetype name — the spring-in moment. */}
        <Animated.Text
          entering={FadeInDown.springify().damping(14).mass(0.9)}
          style={styles.archetype}
          testID="dna-reveal-archetype"
        >
          {copy.name}
        </Animated.Text>

        <Animated.Text entering={FadeIn.delay(250).duration(500)} style={styles.identity}>
          {identity}
        </Animated.Text>

        {jLine && (
          <Animated.View entering={FadeIn.delay(450).duration(500)} style={styles.journeyWrap}>
            <Ionicons name="trending-up" size={15} color={COLORS.accent} />
            <Text style={styles.journey}>{jLine}</Text>
          </Animated.View>
        )}

        {traits.length > 0 && (
          <Animated.View entering={FadeIn.delay(600).duration(500)} style={styles.chips}>
            {traits.map((t) => (
              <View key={t} style={styles.chip} testID="dna-trait-chip">
                <Text style={styles.chipText}>{TRAIT_CHIP_LABEL[t]}</Text>
              </View>
            ))}
          </Animated.View>
        )}

        <Animated.View entering={FadeIn.delay(750).duration(500)}>
          <Pressable style={styles.share} onPress={onShare} testID="dna-reveal-share" hitSlop={8}>
            <Ionicons name="share-outline" size={16} color={COLORS.accent} />
            <Text style={styles.shareText}>Share your DNA</Text>
          </Pressable>
        </Animated.View>

        {/* Below the fold — the accord radar. */}
        <View style={styles.radarSection}>
          <Text style={styles.radarLabel}>YOUR ACCORD PROFILE</Text>
          <AccordRadar accords={dna.accords} />
        </View>
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
          <Text style={styles.ctaText}>See my first match</Text>
          <Ionicons name="arrow-forward" size={15} color={COLORS.white} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  body: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.xl },
  emblem: {
    alignSelf: 'center',
    width: 60,
    height: 60,
    borderRadius: RADIUS.full,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  eyebrow: { ...TYPE.eyebrow, textAlign: 'center', marginBottom: SPACING.md },
  archetype: {
    fontFamily: FONTS.serif,
    fontSize: 40,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 46,
  },
  identity: {
    ...TYPE.body,
    color: COLORS.muted,
    textAlign: 'center',
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.sm,
    lineHeight: 24,
  },
  journeyWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 6,
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.sm,
  },
  journey: { ...TYPE.bodySmall, color: COLORS.text, flexShrink: 1, lineHeight: 20 },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
  },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.accentSoft,
  },
  chipText: { ...TYPE.label, fontSize: 13, color: COLORS.accent },
  share: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    marginTop: SPACING.lg,
    paddingVertical: 6,
  },
  shareText: { ...TYPE.label, fontSize: 14, color: COLORS.accent, textDecorationLine: 'underline' },
  radarSection: { alignItems: 'center', marginTop: SPACING.xxl },
  radarLabel: { ...TYPE.eyebrow, marginBottom: SPACING.md },
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
