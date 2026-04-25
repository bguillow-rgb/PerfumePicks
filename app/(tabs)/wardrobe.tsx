import { ScrollView, View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, TYPE, RADIUS } from '@/src/constants/theme';

/**
 * myWardrobe tab — the user's fragrance collection.
 *
 * v1 sections:
 *   - Status filter pills: All · Have · Want · Tested · Sold On
 *   - Grid of wardrobe items with mL meter + reorder threshold flag
 *   - "Add to wardrobe" CTA → search modal
 *
 * STUB until catalog is seeded + wardrobe service wired to Supabase.
 */

const STATUS_PILLS = ['All', 'Have', 'Want', 'Tested', 'Sold On'] as const;

export default function WardrobeScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerWrap}>
        <Text style={styles.title}>
          <Text style={styles.titleItalic}>my</Text>Wardrobe
        </Text>
        <Text style={styles.subtitle}>0 fragrances · 0 mL tracked</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillRow}
      >
        {STATUS_PILLS.map((s, i) => (
          <Pill key={s} label={s} active={i === 0} />
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Your wardrobe is empty</Text>
          <Text style={styles.emptyBody}>
            Tap below to add your first fragrance — or take the quiz to get started.
          </Text>
          <Pressable style={styles.cta}>
            <Text style={styles.ctaText}>Add a Fragrance</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Pill({ label, active }: { label: string; active?: boolean }) {
  return (
    <View style={[styles.pill, active && styles.pillActive]}>
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  headerWrap: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md },
  title: { ...TYPE.displayLarge },
  titleItalic: { fontStyle: 'italic', color: COLORS.accent },
  subtitle: { ...TYPE.bodySmall, marginTop: 4 },
  pillRow: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, gap: SPACING.sm },
  pill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    marginRight: SPACING.sm,
  },
  pillActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  pillText: { ...TYPE.label, color: COLORS.muted },
  pillTextActive: { color: COLORS.white },
  container: { paddingBottom: SPACING.xxl },
  empty: {
    margin: SPACING.lg,
    padding: SPACING.xl,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  emptyTitle: { ...TYPE.heading, marginBottom: SPACING.sm },
  emptyBody: { ...TYPE.bodySmall, textAlign: 'center', marginBottom: SPACING.lg },
  cta: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.xl,
    paddingVertical: 14,
    borderRadius: RADIUS.full,
  },
  ctaText: { ...TYPE.label, color: COLORS.white, letterSpacing: 1 },
});
