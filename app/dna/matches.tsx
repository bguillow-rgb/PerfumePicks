import { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE } from '@/src/constants/theme';
import { useTasteProfileStore } from '@/src/stores/useTasteProfileStore';
import { TopMatchCard } from '@/src/components/dna/TopMatchCard';
import { useDnaMonetizationEnabled } from '@/src/features/dna/killSwitch';
import { track, EVENTS } from '@/src/lib/observability';

/**
 * "More matches" — the full buyable-match list (DNA flow v2 M2).
 *
 * Reads the picker-session ranking stashed in the taste store. The list is
 * every BUYABLE candidate sorted most-expensive → cheapest, hero excluded
 * (it's the reveal's top match). Each row is a <TopMatchCard> so the buy CTA,
 * price label, and attribution are identical to the hero. There is no fit floor
 * on this list (decision: show every buyable match) — ordering is purely
 * affiliate-value-first, matching the reveal hero's own most-expensive logic.
 *
 * If the stash is empty (deep-linked cold, or a zero-buyable reveal), we show a
 * gentle empty state rather than a blank scroll.
 */
export default function DnaMatchesScreen() {
  const router = useRouter();
  const hero = useTasteProfileStore((s) => s.celebrateHero);
  // Respect the same OTA monetization flag the reveal does: if it's killed, this
  // page shows the empty state too (the entry link is already hidden, but a stale
  // deep-link must not resurrect the commercial surface).
  const monetizationEnabled = useDnaMonetizationEnabled();
  const matches = monetizationEnabled && hero && !hero.fallbackUsed ? hero.matches : [];

  useEffect(() => {
    track(EVENTS.DNA_FIRST_REC_VIEWED, { surface: 'dna_matches', count: matches.length });
  }, [matches.length]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']} testID="dna-matches-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color={COLORS.text} />
        </Pressable>
        <Text style={styles.title}>More matches</Text>
        <View style={{ width: 26 }} />
      </View>

      {matches.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="pricetags-outline" size={32} color={COLORS.muted} />
          <Text style={styles.emptyText}>
            No more matches to show right now. Check your top match back on your DNA.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Text style={styles.intro}>Ranked by what you can buy now, best value first.</Text>
          {matches.map((m) => (
            <TopMatchCard
              key={m.fragrance.id}
              match={m}
              sourceScreen="dna_matches"
              onViewDetails={(id) => router.push(`/fragrance/${id}`)}
              label={null}
            />
          ))}
          <View style={{ height: SPACING.xxl }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
  },
  title: { ...TYPE.heading, textAlign: 'center' },
  body: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm },
  intro: { ...TYPE.bodySmall, color: COLORS.muted, textAlign: 'center', marginBottom: SPACING.sm },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, paddingHorizontal: SPACING.xl },
  emptyText: { ...TYPE.body, color: COLORS.muted, textAlign: 'center', lineHeight: 22 },
});
