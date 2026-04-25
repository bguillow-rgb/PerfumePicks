import { ScrollView, View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, FONTS, RADIUS } from '@/src/constants/theme';

/**
 * Fragrance detail page. Routed via /fragrance/[id].
 *
 * Sections (per spec § 3 Fragrance Detail Page):
 *   - Hero: image + brand + name + concentration + price tier
 *   - Notes pyramid (top / heart / base) — chip rows
 *   - Accord chips with intensity meters
 *   - Performance bars (longevity, sillage, projection)
 *   - Compliment / versatility / office-safe scores
 *   - Similar fragrances grid
 *   - Dupes / alternatives section
 *   - Wear history (user's own logs for this fragrance)
 *   - Decant sources (mL × retailer table)
 *   - Add to wardrobe CTA
 *
 * STUB layout — wires to Supabase once catalog is seeded.
 */
export default function FragranceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </Pressable>

        <View style={styles.hero}>
          <View style={styles.bottlePlaceholder} />
          <Text style={styles.eyebrow}>HOUSE</Text>
          <Text style={styles.brand}>Brand Name</Text>
          <Text style={styles.fragranceName}>Fragrance Name</Text>
          <Text style={styles.subline}>Eau de Parfum · 50ml · $$$$</Text>
        </View>

        <Section title="Notes">
          <NoteRow label="TOP" />
          <NoteRow label="HEART" />
          <NoteRow label="BASE" />
        </Section>

        <Section title="Accords">
          <Placeholder height={120} label="Accord chips with intensity meters" />
        </Section>

        <Section title="Performance">
          <Placeholder height={140} label="Longevity · Sillage · Projection bars" />
        </Section>

        <Section title="Smells Like">
          <Placeholder height={140} label="Similar fragrances horizontal scroller" />
        </Section>

        <Section title="Dupes & Alternatives">
          <Placeholder height={140} label="High-similarity, lower-price options" />
        </Section>

        <Section title="Decant Sources">
          <Placeholder height={120} label="mL × retailer pricing table" />
        </Section>

        <View style={styles.ctaWrap}>
          <Pressable style={styles.cta}>
            <Text style={styles.ctaText}>Add to Wardrobe</Text>
          </Pressable>
        </View>
        <Text style={styles.debug}>id: {id}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function NoteRow({ label }: { label: string }) {
  return (
    <View style={styles.noteRow}>
      <Text style={styles.noteLabel}>{label}</Text>
      <View style={styles.noteChips}>
        <View style={styles.noteChip}><Text style={styles.noteChipText}>—</Text></View>
      </View>
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
  backBtn: { padding: SPACING.md },
  hero: { alignItems: 'center', paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xl },
  bottlePlaceholder: {
    width: 180, height: 240,
    backgroundColor: COLORS.card2,
    borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
    marginBottom: SPACING.lg,
  },
  eyebrow: { ...TYPE.eyebrow, marginBottom: 4 },
  brand: { ...TYPE.bodySmall, color: COLORS.muted, marginBottom: 4 },
  fragranceName: {
    fontFamily: FONTS.serif,
    fontSize: 28,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
  },
  subline: { ...TYPE.caption, marginTop: SPACING.sm },
  section: { paddingHorizontal: SPACING.lg, marginTop: SPACING.xl },
  sectionTitle: { ...TYPE.heading, marginBottom: SPACING.md },
  noteRow: { marginBottom: SPACING.md },
  noteLabel: { ...TYPE.eyebrow, fontSize: 10, marginBottom: 6 },
  noteChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  noteChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.border,
  },
  noteChipText: { ...TYPE.bodySmall, color: COLORS.muted },
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
  ctaWrap: { paddingHorizontal: SPACING.lg, marginTop: SPACING.xl },
  cta: {
    backgroundColor: COLORS.accent,
    paddingVertical: 16,
    borderRadius: RADIUS.full,
    alignItems: 'center',
  },
  ctaText: { ...TYPE.label, color: COLORS.white, letterSpacing: 2 },
  debug: { ...TYPE.caption, textAlign: 'center', marginTop: SPACING.md },
});
