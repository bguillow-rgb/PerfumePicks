import { ScrollView, View, Text, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, RADIUS } from '@/src/constants/theme';

/**
 * Discover tab — search + browse the catalog.
 *
 * v1 sections:
 *   - Search bar (fragrance name, brand, accord, note)
 *   - Filter chips: family, accord, price tier, gender, beast mode, office safe
 *   - "Curated Edits" rails: Boudoir, Office, Date Night, Summer, Winter
 *   - "By House" grid (top niche houses)
 *
 * STUB until catalog is seeded.
 */
export default function DiscoverScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerWrap}>
        <Text style={styles.title}>Discover</Text>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={COLORS.muted} />
          <TextInput
            placeholder="Search fragrances, notes, brands..."
            placeholderTextColor={COLORS.subtle}
            style={styles.searchInput}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <Section eyebrow="CURATED EDITS">
          <Placeholder height={180} label="Boudoir · Office · Date Night · Summer · Winter" />
        </Section>

        <Section eyebrow="BY HOUSE">
          <Placeholder height={220} label="Tom Ford · Creed · MFK · Le Labo · Byredo · Kilian" />
        </Section>

        <Section eyebrow="BY ACCORD">
          <Placeholder height={140} label="Amber · Rose · Oud · Vanilla · Iris · Leather" />
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
  headerWrap: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.sm },
  title: { ...TYPE.displayLarge, marginBottom: SPACING.md },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
  },
  searchInput: { ...TYPE.body, flex: 1, padding: 0 },
  container: { paddingBottom: SPACING.xxl },
  section: { paddingHorizontal: SPACING.lg, marginTop: SPACING.xl },
  sectionEyebrow: { ...TYPE.eyebrow, marginBottom: SPACING.sm },
  placeholder: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  placeholderLabel: { ...TYPE.bodySmall, textAlign: 'center' },
});
