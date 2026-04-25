import { useState, useMemo } from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, RADIUS, FONTS } from '@/src/constants/theme';
import { MlMeter } from '@/src/components/fragrance/MlMeter';
import { SAMPLE_WARDROBE_IDS, getFragrance, type MockFragrance } from '@/src/mock/fragrances';

type Status = 'have' | 'want' | 'tested' | 'sold_on';

interface WardrobeItem {
  fragrance: MockFragrance;
  status: Status;
  size_ml: number;
  remaining_ml: number;
}

/**
 * myWardrobe — collection grid with status filter pills + mL tracking.
 *
 * Pulls SAMPLE_WARDROBE_IDS from the mock catalog. Real version reads from
 * the wardrobe_items table once Supabase is wired.
 */
export default function WardrobeScreen() {
  const router = useRouter();
  const [activeStatus, setActiveStatus] = useState<'all' | Status>('all');

  const items: WardrobeItem[] = useMemo(() => {
    const out: WardrobeItem[] = [];
    for (const { id, status, size_ml, remaining_ml } of SAMPLE_WARDROBE_IDS) {
      const fragrance = getFragrance(id);
      if (fragrance) out.push({ fragrance, status: status as Status, size_ml, remaining_ml });
    }
    return out;
  }, []);

  const visible = useMemo(
    () => activeStatus === 'all' ? items : items.filter((i) => i.status === activeStatus),
    [items, activeStatus],
  );

  const totalMl = items.filter((i) => i.status === 'have').reduce((s, i) => s + i.remaining_ml, 0);
  const haveCount = items.filter((i) => i.status === 'have').length;
  const lowCount = items.filter((i) => i.status === 'have' && (i.remaining_ml / i.size_ml) < 0.2).length;

  const PILLS: { id: 'all' | Status; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'have', label: 'Have' },
    { id: 'want', label: 'Want' },
    { id: 'tested', label: 'Tested' },
    { id: 'sold_on', label: 'Sold On' },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerWrap}>
        <View>
          <Text style={styles.title}>
            <Text style={styles.titleItalic}>my</Text>Wardrobe
          </Text>
          <Text style={styles.subtitle}>
            {haveCount} fragrances · {totalMl.toFixed(0)} mL on hand
            {lowCount > 0 && ` · ${lowCount} running low`}
          </Text>
        </View>
        <Pressable style={styles.addBtn} onPress={() => router.push('/(tabs)/discover')}>
          <Ionicons name="add" size={22} color={COLORS.white} />
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillRow}
        style={styles.pillRowOuter}
      >
        {PILLS.map((p) => (
          <Pressable key={p.id} onPress={() => setActiveStatus(p.id)}>
            <View style={[styles.pill, activeStatus === p.id && styles.pillActive]}>
              <Text style={[styles.pillText, activeStatus === p.id && styles.pillTextActive]}>{p.label}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {visible.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Nothing here yet.</Text>
            <Text style={styles.emptyBody}>Switch filters or add a fragrance to get started.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {visible.map((item) => (
              <WardrobeRow key={`${item.fragrance.id}-${item.status}`} item={item} onPress={() => router.push(`/fragrance/${item.fragrance.id}`)} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function WardrobeRow({ item, onPress }: { item: WardrobeItem; onPress: () => void }) {
  const isLow = item.status === 'have' && (item.remaining_ml / item.size_ml) < 0.2;

  return (
    <Pressable onPress={onPress} style={styles.row}>
      <View style={styles.rowImageWrap}>
        <Image source={{ uri: item.fragrance.image_url }} style={styles.rowImage} />
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowBrand}>{item.fragrance.brand.toUpperCase()}</Text>
        <Text style={styles.rowName} numberOfLines={2}>{item.fragrance.name}</Text>
        <View style={styles.rowMetaRow}>
          <View style={[styles.statusPill, statusStyle(item.status)]}>
            <Text style={[styles.statusText, statusTextStyle(item.status)]}>{statusLabel(item.status)}</Text>
          </View>
          {isLow && (
            <View style={styles.lowPill}>
              <Ionicons name="alert-circle" size={11} color={COLORS.danger} />
              <Text style={styles.lowText}>Reorder</Text>
            </View>
          )}
        </View>
      </View>
      {item.status === 'have' && (
        <View style={styles.rowMeter}>
          <MlMeter size_ml={item.size_ml} remaining_ml={item.remaining_ml} />
        </View>
      )}
    </Pressable>
  );
}

function statusLabel(s: Status): string {
  return ({ have: 'In Rotation', want: 'Wishlist', tested: 'Tested', sold_on: 'Sold On' }[s]);
}
function statusStyle(s: Status): any {
  return ({
    have: { backgroundColor: COLORS.accentSoft },
    want: { backgroundColor: COLORS.blushSoft },
    tested: { backgroundColor: COLORS.card2 },
    sold_on: { backgroundColor: COLORS.card2 },
  }[s]);
}
function statusTextStyle(s: Status): any {
  return ({
    have: { color: COLORS.burgundy },
    want: { color: COLORS.burgundy },
    tested: { color: COLORS.muted },
    sold_on: { color: COLORS.muted },
  }[s]);
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  headerWrap: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  title: { ...TYPE.displayLarge },
  titleItalic: { fontStyle: 'italic', color: COLORS.accent, fontFamily: 'CormorantGaramond_400Regular_Italic' },
  subtitle: { ...TYPE.bodySmall, marginTop: 4 },
  addBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  pillRowOuter: { flexGrow: 0 },
  pillRow: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    marginRight: 8,
  },
  pillActive: { backgroundColor: COLORS.text, borderColor: COLORS.text },
  pillText: { ...TYPE.label, color: COLORS.muted, fontSize: 13 },
  pillTextActive: { color: COLORS.bg },
  container: { paddingBottom: SPACING.xxl },
  list: { paddingHorizontal: SPACING.lg, gap: SPACING.md },
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
  emptyBody: { ...TYPE.bodySmall, textAlign: 'center' },
  row: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  rowImageWrap: {
    width: 70, height: 70,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    backgroundColor: COLORS.card2,
  },
  rowImage: { width: '100%', height: '100%' },
  rowContent: { flex: 1 },
  rowBrand: { ...TYPE.eyebrow, fontSize: 9, marginBottom: 2 },
  rowName: { fontFamily: FONTS.serif, fontWeight: '600', fontSize: 17, color: COLORS.text, marginBottom: 6, lineHeight: 21 },
  rowMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  statusPill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: RADIUS.full },
  statusText: { fontSize: 10, fontWeight: '600', letterSpacing: 0.5 },
  lowPill: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  lowText: { fontSize: 10, color: COLORS.danger, fontWeight: '600', letterSpacing: 0.5 },
  rowMeter: { width: 50, alignItems: 'center' },
});
