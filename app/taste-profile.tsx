import { useEffect, useState, useMemo } from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, RADIUS, FONTS } from '@/src/constants/theme';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { recomputeTasteProfile } from '@/src/lib/sync/useAppSync';
import { useTasteProfileStore } from '@/src/stores/useTasteProfileStore';
import { useOnboardingStore } from '@/src/stores/useOnboardingStore';
import {
  ARCHETYPE_COPY,
  LOW_CONFIDENCE_IDENTITY,
  TRAIT_CHIP_LABEL,
  journeyLine,
  topTraits,
} from '@/src/features/dna/revealCopy';
import type { FragranceDNA } from '@/src/features/dna/types';
import { JourneyLadder } from '@/src/components/dna/JourneyLadder';
import { LivingArchetypeReadout } from '@/src/components/dna/LivingArchetypeReadout';

/**
 * My Taste Profile — reads user_taste_profiles from Supabase.
 * Shows top notes, preferred accords, preferred families.
 * Empty state when signal_count = 0.
 */

interface TasteData {
  liked_notes: Record<string, number>;
  disliked_notes: Record<string, number>;
  preferred_accords: Record<string, number>;
  preferred_families: Record<string, number>;
  avg_price_tier: number | null;
  longevity_preference: number | null;
  signal_count: number;
}

export default function TasteProfileScreen() {
  const router = useRouter();
  const [data, setData] = useState<TasteData | null>(null);
  const [loading, setLoading] = useState(true);
  const dna = useTasteProfileStore((s) => s.dna);

  // Re-enter the DNA front door as a retake: flag retake mode (so the route
  // guard lets an onboarded user back into /dna) and clear any stale draft.
  const handleRetake = () => {
    useOnboardingStore.getState().startRetake();
    useTasteProfileStore.getState().retake();
    router.push('/dna');
  };

  useEffect(() => {
    // Recompute from local signals (swipes + wardrobe + wears) on every entry so
    // the profile reflects swipes done this session. This also upserts to
    // Supabase in the background, so other surfaces (recs) stay fresh too.
    (async () => {
      const profile = await recomputeTasteProfile();
      setData(profile);
      setLoading(false);
    })();
  }, []);

  const topNotes = useMemo(() => {
    if (!data?.liked_notes) return [];
    return Object.entries(data.liked_notes)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);
  }, [data]);

  const topAccords = useMemo(() => {
    if (!data?.preferred_accords) return [];
    return Object.entries(data.preferred_accords)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8);
  }, [data]);

  const topFamilies = useMemo(() => {
    if (!data?.preferred_families) return [];
    return Object.entries(data.preferred_families)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6);
  }, [data]);

  const avoidNotes = useMemo(() => {
    if (!data?.disliked_notes) return [];
    return Object.entries(data.disliked_notes)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6);
  }, [data]);

  const maxNote = topNotes.length > 0 ? topNotes[0][1] : 1;
  const maxAccord = topAccords.length > 0 ? topAccords[0][1] : 1;

  const archetype = dna ? ARCHETYPE_COPY[dna.archetype.primary] : null;
  const lowConfidence = dna ? dna.confidence < 0.35 : false;
  const identityLine = dna
    ? (lowConfidence ? LOW_CONFIDENCE_IDENTITY : archetype!.identity)
    : null;
  const journey = dna ? journeyLine(dna.journey) : null;
  const traitChips = dna ? topTraits(dna.traits.values) : [];

  const hasSignals = !!data && data.signal_count > 0;

  if (loading) return null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']} testID="taste-profile-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={COLORS.text} />
        </Pressable>
        <Text style={styles.title}>My Taste Profile</Text>
        <View style={{ width: 26 }} />
      </View>

      {!dna && !hasSignals ? (
        <EmptyState
          icon="sparkles-outline"
          title="No taste data yet"
          subtitle="Swipe fragrances in Train My Nose or add to your wardrobe to build your profile."
          actionLabel="Train My Nose"
          onAction={() => router.push('/(tabs)/train')}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {/* My Fragrance DNA — the re-viewable passport home */}
          {dna && archetype && (
            <View style={styles.dnaCard}>
              <Text style={styles.dnaEyebrow}>MY FRAGRANCE DNA</Text>
              <View style={styles.dnaBadge}>
                <Ionicons name="sparkles" size={16} color={COLORS.accent} />
                <Text style={styles.dnaArchetype}>{archetype.name}</Text>
              </View>
              <Text style={styles.dnaIdentity}>{identityLine}</Text>
              <LivingArchetypeReadout dna={dna} variant="full" />
              {journey && <Text style={styles.dnaJourney}>{journey}</Text>}
              {traitChips.length > 0 && (
                <View style={styles.dnaTraitRow}>
                  {traitChips.map((t) => (
                    <View key={t} style={styles.dnaTraitChip}>
                      <Text style={styles.dnaTraitText}>{TRAIT_CHIP_LABEL[t]}</Text>
                    </View>
                  ))}
                </View>
              )}
              <Pressable testID="dna-retake" style={styles.retakeBtn} onPress={handleRetake}>
                <Ionicons name="refresh" size={16} color={COLORS.text} />
                <Text style={styles.retakeText}>Retake</Text>
              </Pressable>
            </View>
          )}

          {/* Fragrance Journey — the full predictive ladder (one surface) */}
          {dna && <JourneyLadder dna={dna} />}

          {!hasSignals && (
            <Text style={styles.signalHint}>
              Swipe in Train My Nose or build your wardrobe to sharpen your profile.
            </Text>
          )}

          {hasSignals && data && (
          <>
          <Text style={styles.signalCount}>{data.signal_count} signals collected</Text>

          {/* Top Notes */}
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

          {/* Preferred Accords */}
          <Section label="PREFERRED ACCORDS">
            <View style={styles.pillGrid}>
              {topAccords.map(([accord, weight]) => {
                const opacity = 0.4 + (weight / maxAccord) * 0.6;
                return (
                  <View key={accord} style={[styles.accordPill, { opacity }]}>
                    <Text style={styles.accordText}>{accord}</Text>
                  </View>
                );
              })}
            </View>
          </Section>

          {/* Fragrance Families */}
          {topFamilies.length > 0 && (
            <Section label="FRAGRANCE FAMILIES">
              <View style={styles.pillGrid}>
                {topFamilies.map(([fam]) => (
                  <View key={fam} style={styles.familyPill}>
                    <Text style={styles.familyText}>{fam}</Text>
                  </View>
                ))}
              </View>
            </Section>
          )}

          {/* Avoid List */}
          {avoidNotes.length > 0 && (
            <Section label="NOTES TO AVOID">
              <View style={styles.pillGrid}>
                {avoidNotes.map(([note]) => (
                  <View key={note} style={styles.avoidPill}>
                    <Text style={styles.avoidText}>{note}</Text>
                  </View>
                ))}
              </View>
            </Section>
          )}

          {/* Price + Longevity */}
          <View style={styles.statsRow}>
            {data.avg_price_tier != null && (
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{'$'.repeat(Math.round(data.avg_price_tier))}</Text>
                <Text style={styles.statLabel}>Avg Price</Text>
              </View>
            )}
            {data.longevity_preference != null && (
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{data.longevity_preference.toFixed(1)}</Text>
                <Text style={styles.statLabel}>Longevity Pref</Text>
              </View>
            )}
          </View>
          </>
          )}

          <View style={{ height: SPACING.xxl }} />
        </ScrollView>
      )}
    </SafeAreaView>
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
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
  },
  title: { ...TYPE.heading, textAlign: 'center' },
  body: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md },
  signalCount: { ...TYPE.caption, color: COLORS.accent, textAlign: 'center', marginBottom: SPACING.lg },
  signalHint: { ...TYPE.caption, color: COLORS.muted, textAlign: 'center', marginBottom: SPACING.lg },

  dnaCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  dnaEyebrow: { ...TYPE.eyebrow, marginBottom: SPACING.sm },
  dnaBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SPACING.sm },
  dnaArchetype: { fontFamily: FONTS.serif, fontSize: 26, fontWeight: '700', color: COLORS.text },
  dnaIdentity: { ...TYPE.body, color: COLORS.text, marginBottom: SPACING.sm },
  dnaJourney: { ...TYPE.bodySmall, color: COLORS.muted, marginBottom: SPACING.md },
  dnaTraitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: SPACING.md },
  dnaTraitChip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.card2,
  },
  dnaTraitText: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  retakeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.card2,
  },
  retakeText: { ...TYPE.label, color: COLORS.text },

  section: { marginBottom: SPACING.xl },
  sectionLabel: { ...TYPE.eyebrow, marginBottom: SPACING.md },

  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  barLabel: { width: 90, ...TYPE.bodySmall, color: COLORS.text, textTransform: 'capitalize' },
  barTrack: { flex: 1, height: 8, backgroundColor: COLORS.card2, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: COLORS.accent, borderRadius: 4 },

  pillGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  accordPill: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.accent,
  },
  accordText: { color: COLORS.white, fontSize: 13, fontWeight: '600' },
  familyPill: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
  },
  familyText: { ...TYPE.label, fontSize: 13, color: COLORS.text },
  avoidPill: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.card2,
  },
  avoidText: { fontSize: 13, fontWeight: '500', color: COLORS.danger },

  statsRow: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.md },
  statCard: {
    flex: 1, padding: SPACING.lg,
    backgroundColor: COLORS.card, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center',
  },
  statValue: { fontFamily: FONTS.serif, fontSize: 28, fontWeight: '700', color: COLORS.accent },
  statLabel: { ...TYPE.caption, marginTop: 4 },
});
