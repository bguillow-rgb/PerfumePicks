import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, TYPE, FONTS } from '@/src/constants/theme';
import { FragranceCard } from '@/src/components/fragrance/FragranceCard';
import { useRecommendations, useNewArrivals } from '@/src/features/recommend/useRecommendations';

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
  // Live recommendations driven by the user's swipes + wear logs +
  // wardrobe. Updates instantly when the user swipes in Train, logs a
  // wear, or adds something new to their wardrobe.
  const { heroPick, heroReason, todaysEdit, trending, hasSignals } = useRecommendations();
  const newArrivals = useNewArrivals();

  const greeting = useGreeting();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          {/* Avatar lives in the bottom tab bar now — no duplicate here.
              Header is purely the editorial masthead. */}

          {/* Editorial masthead: thin champagne rules flanking the cursive
              wordmark, like the cover of Vogue or a fine fragrance house's
              monogrammed paper. The rules anchor the wordmark visually so it
              reads as a CREST, not just a heading. */}
          <View style={styles.mastheadRow}>
            <View style={styles.mastheadRule} />
            <Text
              style={styles.wordmark}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.82}
              allowFontScaling={false}
            >
              Perfume Picks
            </Text>
            <View style={styles.mastheadRule} />
          </View>

          {/* Quiet subtitle — italic serif, lowercase, soft taupe. Reads as
              a personal greeting/dateline rather than a UI label. The em-dash
              gives it editorial cadence ("good morning — saturday, april 25"). */}
          <Text style={styles.subtitle} numberOfLines={1}>
            {greeting.toLowerCase()} <Text style={styles.subtitleDash}>—</Text> {longDate().toLowerCase()}
          </Text>
        </View>

        <Section eyebrow="WEAR TODAY" cursive="for you">
          {/* Section uses paddingLeft only (so the horizontal carousels below
              can bleed cards off the right edge). The hero card is full-width
              so it needs explicit right padding to stay centered. */}
          <View style={styles.heroWrap}>
            {heroPick && <FragranceCard fragrance={heroPick} variant="hero" />}
          </View>
          {heroPick && (
            <Text style={styles.heroReason}>
              <Text style={styles.italic}>{hasSignals ? 'Why this:' : 'A starting point:'}</Text>{' '}
              {heroReason || (hasSignals
                ? 'tracks with the notes and accords you keep favoring'
                : 'a celebrated pick to anchor your taste — start swiping in Train to refine it')}.
            </Text>
          )}
        </Section>

        <Section eyebrow="TODAY'S EDIT" cursive="three picks">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
            {todaysEdit.map((f) => <FragranceCard key={f.id} fragrance={f} />)}
          </ScrollView>
        </Section>

        <Section eyebrow="NEW ARRIVALS" cursive="just in">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
            {newArrivals.map((f) => <FragranceCard key={f.id} fragrance={f} />)}
          </ScrollView>
        </Section>

        <Section eyebrow={hasSignals ? 'TRENDING IN YOUR TASTE' : 'EXPLORE'} cursive={hasSignals ? 'loved' : 'discover'}>
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

// Long-form date for the editorial subtitle — written out so the lowercase
// italic serif treatment reads like a personal note, not a system label.
function longDate(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  container: { paddingBottom: SPACING.xxl * 1.5 },
  header: {
    paddingHorizontal: SPACING.md,
    paddingTop: 0,
    paddingBottom: SPACING.xs,
  },
  // Vogue masthead: cursive wordmark flanked by thin gold rules.
  mastheadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.sm,
    marginTop: SPACING.xs,
  },
  // Thin champagne rule — visually anchors the wordmark as a crest, not
  // a heading. Half-opacity so it whispers rather than shouts.
  mastheadRule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.accent,
    opacity: 0.55,
    maxWidth: 60,                    // never let the rules dominate the wordmark
  },
  wordmark: {
    fontFamily: 'PinyonScript_400Regular',
    fontSize: 56,
    color: COLORS.accent,
    lineHeight: 72,
    textAlign: 'center',
    flexShrink: 1,                   // lets adjustsFontSizeToFit work cleanly
  },
  // Editorial subtitle — italic serif, lowercase, soft taupe. Reads as a
  // personal note ("good morning — saturday, april 25") rather than a label.
  subtitle: {
    fontFamily: 'CormorantGaramond_400Regular_Italic',
    fontSize: 16,
    color: COLORS.muted,
    textAlign: 'center',
    marginTop: SPACING.sm,
    letterSpacing: 0.4,
  },
  subtitleDash: {
    color: COLORS.accent,
    fontStyle: 'normal',
  },
  section: {
    paddingLeft: SPACING.lg,
    marginTop: SPACING.lg,
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
  heroWrap: { paddingRight: SPACING.lg },
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
