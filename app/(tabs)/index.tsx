import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, TYPE, FONTS } from '@/src/constants/theme';
import { FragranceCard } from '@/src/components/fragrance/FragranceCard';
import {
  getFragrance,
  getFragrances,
  HERO_PICK_ID,
  TODAYS_EDIT_IDS,
  NEW_ARRIVAL_IDS,
  TRENDING_IDS,
} from '@/src/mock/fragrances';

/**
 * Home / "Today" tab — the daily ritual surface.
 *
 * Sections (final v1):
 *   1. Wear Today — single hero pick from the recommendation engine
 *   2. Today's Edit — 3 picks tuned to weather + taste
 *   3. New Arrivals — recent additions to the catalog
 *   4. Trending in your taste — community popularity, taste-filtered
 *
 * Pulls from MOCK_CATALOG until Supabase is wired up. Greeting line is
 * time-of-day-aware so the screen feels alive on each open.
 */
export default function HomeScreen() {
  const heroPick = getFragrance(HERO_PICK_ID);
  const editPicks = getFragrances(TODAYS_EDIT_IDS);
  const newArrivals = getFragrances(NEW_ARRIVAL_IDS);
  const trending = getFragrances(TRENDING_IDS);

  const greeting = useGreeting();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>{greeting}</Text>
          <Text style={styles.wordmark}>Perfume Picks</Text>
          <Text style={styles.dateLine}>{prettyDate()}</Text>
        </View>

        <Section eyebrow="WEAR TODAY" cursive="for you">
          {heroPick && <FragranceCard fragrance={heroPick} variant="hero" />}
          <Text style={styles.heroReason}>
            <Text style={styles.italic}>Why this:</Text> warm + sweet, perfect for cool evenings —
            and it tracks with the amber accord you've been swiping right on.
          </Text>
        </Section>

        <Section eyebrow="TODAY'S EDIT" cursive="three picks">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
            {editPicks.map((f) => <FragranceCard key={f.id} fragrance={f} />)}
          </ScrollView>
        </Section>

        <Section eyebrow="NEW ARRIVALS" cursive="just in">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
            {newArrivals.map((f) => <FragranceCard key={f.id} fragrance={f} />)}
          </ScrollView>
        </Section>

        <Section eyebrow="TRENDING IN YOUR TASTE" cursive="loved">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
            {trending.map((f) => <FragranceCard key={f.id} fragrance={f} variant="small" />)}
          </ScrollView>
        </Section>

        <View style={styles.footer}>
          <View style={styles.footerRule} />
          <Text style={styles.footerText}>
            Curated with intention. Tap any fragrance to explore notes, accords, and similar bottles.
          </Text>
          <View style={styles.footerRule} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ eyebrow, cursive, children }: { eyebrow: string; cursive?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
        {cursive && <Text style={styles.sectionCursive}>{cursive}</Text>}
      </View>
      {children}
    </View>
  );
}

function useGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'STILL UP';
  if (h < 12) return 'GOOD MORNING';
  if (h < 17) return 'GOOD AFTERNOON';
  if (h < 21) return 'GOOD EVENING';
  return 'TONIGHT';
}

function prettyDate(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  container: { paddingBottom: SPACING.xxl * 1.5 },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
    alignItems: 'center',
  },
  eyebrow: { ...TYPE.eyebrow, marginBottom: 4 },
  wordmark: {
    fontFamily: 'PinyonScript_400Regular',
    fontSize: 52,
    color: COLORS.accent,
    lineHeight: 70,
  },
  dateLine: {
    ...TYPE.bodySmall,
    fontStyle: 'italic',
    color: COLORS.muted,
    marginTop: 4,
  },
  section: {
    paddingLeft: SPACING.lg,
    marginTop: SPACING.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: SPACING.md,
    paddingRight: SPACING.lg,
    gap: 10,
  },
  sectionEyebrow: { ...TYPE.eyebrow },
  sectionCursive: {
    fontFamily: 'PinyonScript_400Regular',
    fontSize: 22,
    color: COLORS.accent,
    lineHeight: 26,
  },
  hScroll: { paddingRight: SPACING.lg },
  heroReason: {
    ...TYPE.bodySmall,
    color: COLORS.muted,
    marginTop: SPACING.md,
    marginRight: SPACING.lg,
    fontStyle: 'italic',
    lineHeight: 21,
  },
  italic: { fontStyle: 'italic', color: COLORS.accent, fontWeight: '600' },
  footer: {
    marginTop: SPACING.xxl,
    paddingHorizontal: SPACING.xl,
    alignItems: 'center',
    gap: SPACING.md,
  },
  footerRule: { width: 40, height: 1, backgroundColor: COLORS.accent, opacity: 0.4 },
  footerText: {
    ...TYPE.caption,
    fontStyle: 'italic',
    textAlign: 'center',
    color: COLORS.muted,
    paddingHorizontal: SPACING.md,
    lineHeight: 18,
  },
});
