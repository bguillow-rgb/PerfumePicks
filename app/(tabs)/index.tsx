import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, TYPE, FONTS } from '@/src/constants/theme';

/**
 * Home / "Today" tab — the daily ritual surface.
 *
 * Sections (final v1):
 *   1. Wear Today — single hero pick from the recommendation engine
 *   2. Today's Edit — 3 picks tuned to weather + taste
 *   3. New Arrivals — recent additions to the catalog
 *   4. Trending in your taste — community popularity, taste-filtered
 *
 * STUB until the recommendation engine + catalog are seeded. Renders the
 * shell so the layout/theme can be reviewed before any data is wired.
 */
export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>TODAY</Text>
          <Text style={styles.wordmark}>Perfume Picks</Text>
        </View>

        <Section eyebrow="WEAR TODAY">
          <Placeholder height={280} label="Hero pick — populated from recommendation engine" />
        </Section>

        <Section eyebrow="TODAY'S EDIT">
          <Placeholder height={180} label="3 picks tuned to weather + taste" />
        </Section>

        <Section eyebrow="NEW ARRIVALS">
          <Placeholder height={180} label="Recently added to the catalog" />
        </Section>

        <Section eyebrow="TRENDING IN YOUR TASTE">
          <Placeholder height={180} label="Popular among similar taste profiles" />
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ eyebrow, children }: { eyebrow: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
      {children}
    </View>
  );
}

function Placeholder({ height, label }: { height: number; label: string }) {
  return (
    <View style={[styles.placeholder, { height }]}>
      <Text style={styles.placeholderLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  container: { paddingBottom: SPACING.xxl },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    alignItems: 'center',
  },
  eyebrow: { ...TYPE.eyebrow },
  wordmark: {
    fontFamily: FONTS.wordmark,
    fontSize: 42,
    color: COLORS.accent,
    lineHeight: 56,
    marginTop: 4,
  },
  section: {
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.xl,
  },
  sectionEyebrow: { ...TYPE.eyebrow, marginBottom: SPACING.sm },
  placeholder: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  placeholderLabel: { ...TYPE.bodySmall, textAlign: 'center' },
});
