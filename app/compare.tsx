import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, RADIUS, FONTS } from '@/src/constants/theme';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { useCompareStore } from '@/src/stores/useCompareStore';
import { useCatalogStore, type Fragrance } from '@/src/stores/useCatalogStore';

/**
 * Compare side-by-side (PRD §7.5). Columns per fragrance with accords, note
 * pyramid, and performance. Notes shared across ALL selected fragrances are
 * highlighted (the intersection); everything else reads as a per-scent delta.
 */

const COL_W = 248;

const PERF_LABELS = [
  ['community_longevity', 'Longevity'],
  ['community_sillage', 'Sillage'],
  ['community_projection', 'Projection'],
] as const;

function norm(n: string): string {
  return n.trim().toLowerCase();
}

export default function CompareScreen() {
  const router = useRouter();
  const ids = useCompareStore((s) => s.ids);
  const remove = useCompareStore((s) => s.remove);
  const clear = useCompareStore((s) => s.clear);
  const fetchById = useCatalogStore((s) => s.fetchById);
  const [frags, setFrags] = useState<Fragrance[]>([]);

  useEffect(() => {
    let alive = true;
    Promise.all(ids.map((id) => fetchById(id)))
      .then((rows) => { if (alive) setFrags(rows.filter((f): f is Fragrance => !!f)); });
    return () => { alive = false; };
  }, [ids, fetchById]);

  // Notes present in EVERY selected fragrance → the shared core.
  const sharedNotes = useMemo(() => {
    if (frags.length < 2) return new Set<string>();
    const perFrag = frags.map((f) =>
      new Set([...f.top_notes, ...f.heart_notes, ...f.base_notes].map(norm)),
    );
    const [first, ...rest] = perFrag;
    const shared = new Set<string>();
    first.forEach((n) => { if (rest.every((s) => s.has(n))) shared.add(n); });
    return shared;
  }, [frags]);

  const sharedAccords = useMemo(() => {
    if (frags.length < 2) return new Set<string>();
    const perFrag = frags.map((f) => new Set(f.top_accords.map(norm)));
    const [first, ...rest] = perFrag;
    const shared = new Set<string>();
    first.forEach((a) => { if (rest.every((s) => s.has(a))) shared.add(a); });
    return shared;
  }, [frags]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color={COLORS.text} />
        </Pressable>
        <Text style={styles.title}>Compare</Text>
        {ids.length > 0 ? (
          <Pressable onPress={clear} hitSlop={8}>
            <Text style={styles.clear}>Clear</Text>
          </Pressable>
        ) : <View style={{ width: 40 }} />}
      </View>

      {ids.length < 2 ? (
        <EmptyState
          icon="git-compare-outline"
          title="Pick at least 2"
          subtitle="Tap “Compare” on a fragrance to add it here, then come back to see them side by side."
          actionLabel="Browse"
          onAction={() => router.replace('/(tabs)/discover')}
        />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cols}>
          {frags.map((f) => (
            <View key={f.id} style={styles.col}>
              <Pressable style={styles.removeBtn} onPress={() => remove(f.id)} hitSlop={8}>
                <Ionicons name="close-circle" size={22} color={COLORS.subtle} />
              </Pressable>

              <Pressable onPress={() => router.push(`/fragrance/${f.id}` as any)}>
                {f.image_url ? (
                  <Image source={{ uri: f.image_url }} style={styles.img} />
                ) : (
                  <View style={[styles.img, styles.imgFallback]}>
                    <Ionicons name="flask-outline" size={26} color={COLORS.subtle} />
                  </View>
                )}
                <Text style={styles.brand}>{f.brand}</Text>
                <Text style={styles.name} numberOfLines={2}>{f.name}</Text>
              </Pressable>
              <Text style={styles.meta}>
                {f.concentration?.toUpperCase()} · {f.gender}
              </Text>

              <Section label="ACCORDS" />
              {f.top_accords.length === 0 ? (
                <Text style={styles.empty}>Not available yet</Text>
              ) : (
                <View style={styles.chipWrap}>
                  {f.top_accords.slice(0, 6).map((a) => {
                    const on = sharedAccords.has(norm(a));
                    return (
                      <View key={a} style={[styles.chip, on && styles.chipOn]}>
                        <Text style={[styles.chipText, on && styles.chipTextOn]}>{a}</Text>
                      </View>
                    );
                  })}
                </View>
              )}

              <NoteTier label="TOP" notes={f.top_notes} shared={sharedNotes} />
              <NoteTier label="HEART" notes={f.heart_notes} shared={sharedNotes} />
              <NoteTier label="BASE" notes={f.base_notes} shared={sharedNotes} />

              <Section label="PERFORMANCE" />
              {PERF_LABELS.map(([key, lbl]) => (
                <View key={key} style={styles.perfRow}>
                  <Text style={styles.perfLabel}>{lbl}</Text>
                  <View style={styles.dots}>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <View
                        key={i}
                        style={[styles.dot, i <= (f[key] ?? 0) && styles.dotOn]}
                      />
                    ))}
                  </View>
                </View>
              ))}

              <Section label="PRICE" />
              <Text style={styles.price}>
                {f.retail_msrp_usd_cents > 0
                  ? `$${Math.round(f.retail_msrp_usd_cents / 100)}`
                  : '—'}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}

      {ids.length >= 2 && sharedNotes.size > 0 && (
        <View style={styles.legend}>
          <View style={[styles.dotLegend]} />
          <Text style={styles.legendText}>
            Highlighted = shared across all {frags.length}
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

function Section({ label }: { label: string }) {
  return <Text style={styles.section}>{label}</Text>;
}

function NoteTier({ label, notes, shared }: { label: string; notes: string[]; shared: Set<string> }) {
  return (
    <>
      <Text style={styles.tierLabel}>{label}</Text>
      {notes.length === 0 ? (
        <Text style={styles.empty}>—</Text>
      ) : (
        <View style={styles.chipWrap}>
          {notes.map((n) => {
            const on = shared.has(norm(n));
            return (
              <View key={n} style={[styles.noteChip, on && styles.noteChipOn]}>
                <Text style={[styles.noteText, on && styles.noteTextOn]}>{n}</Text>
              </View>
            );
          })}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
  },
  title: { ...TYPE.heading },
  clear: { ...TYPE.body, color: COLORS.accent, width: 40, textAlign: 'right' },

  cols: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xl, gap: SPACING.md },
  col: {
    width: COL_W, backgroundColor: COLORS.card, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md,
  },
  removeBtn: { position: 'absolute', top: 6, right: 6, zIndex: 2 },
  img: { width: '100%', height: 140, borderRadius: RADIUS.md, backgroundColor: COLORS.card2, resizeMode: 'contain' },
  imgFallback: { alignItems: 'center', justifyContent: 'center' },
  brand: { ...TYPE.caption, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: SPACING.sm },
  name: { fontFamily: FONTS.serif, fontSize: 18, color: COLORS.text, marginVertical: 2 },
  meta: { ...TYPE.caption, color: COLORS.muted },

  section: { ...TYPE.caption, letterSpacing: 1, color: COLORS.accent, marginTop: SPACING.md, marginBottom: SPACING.xs },
  tierLabel: { ...TYPE.caption, color: COLORS.muted, marginTop: SPACING.sm },
  empty: { ...TYPE.caption, color: COLORS.subtle, fontStyle: 'italic' },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full, backgroundColor: COLORS.card2 },
  chipOn: { backgroundColor: COLORS.accentSoft },
  chipText: { ...TYPE.caption, color: COLORS.muted },
  chipTextOn: { color: COLORS.text, fontWeight: '600' },

  noteChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full, backgroundColor: COLORS.card2 },
  noteChipOn: { backgroundColor: COLORS.blushSoft },
  noteText: { ...TYPE.caption, color: COLORS.muted },
  noteTextOn: { color: COLORS.burgundy, fontWeight: '600' },

  perfRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  perfLabel: { ...TYPE.caption, color: COLORS.text },
  dots: { flexDirection: 'row', gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.card2 },
  dotOn: { backgroundColor: COLORS.accent },

  price: { fontFamily: FONTS.serif, fontSize: 22, color: COLORS.text },

  legend: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  dotLegend: { width: 12, height: 12, borderRadius: 3, backgroundColor: COLORS.blushSoft },
  legendText: { ...TYPE.caption, color: COLORS.muted },
});
