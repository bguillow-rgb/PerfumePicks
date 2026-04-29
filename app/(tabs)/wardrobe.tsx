import { useState, useMemo, useEffect } from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, RADIUS, FONTS } from '@/src/constants/theme';
import { MlMeter } from '@/src/components/fragrance/MlMeter';
import { SAMPLE_WARDROBE_IDS, getFragrance, type MockFragrance } from '@/src/mock/fragrances';
import { useWardrobeStore, type WardrobeStatus, type UnitType, type WardrobeItem } from '@/src/stores/useWardrobeStore';
import { useWearLogStore } from '@/src/stores/useWearLogStore';
import { AddToWardrobeSheet } from '@/src/components/sheets/AddToWardrobeSheet';

type Status = WardrobeStatus;

interface WardrobeItemView {
  itemId: string;
  fragrance: MockFragrance;
  status: Status;
  size_ml: number;
  remaining_ml: number;
}

/**
 * myWardrobe — collection grid with status filter pills + mL tracking.
 *
 * Reads from the persisted wardrobe store. On first mount (empty store),
 * seeds the store with SAMPLE_WARDROBE_IDS so the screen has demo content
 * to show — but every change after that is real (add via fragrance detail
 * page, delete, edit, etc.).
 */
export default function WardrobeScreen() {
  const router = useRouter();
  const [activeStatus, setActiveStatus] = useState<'all' | Status>('all');

  const storeItems = useWardrobeStore((s) => s.items);
  const addToStore = useWardrobeStore((s) => s.add);
  const removeFromStore = useWardrobeStore((s) => s.remove);
  const wearLogs = useWearLogStore((s) => s.logs);
  const wearCountMap = useMemo(() => {
    const out: Record<string, number> = {};
    for (const l of wearLogs) {
      out[l.fragrance_id] = (out[l.fragrance_id] ?? 0) + 1;
    }
    return out;
  }, [wearLogs]);

  const [editingItem, setEditingItem] = useState<WardrobeItem | null>(null);
  const [editingFragrance, setEditingFragrance] = useState<MockFragrance | null>(null);

  // Seed once on first run if empty.
  useEffect(() => {
    if (storeItems.length > 0) return;
    for (const { id: fragId, status, size_ml, remaining_ml } of SAMPLE_WARDROBE_IDS) {
      addToStore({
        fragrance_id: fragId,
        status: status as WardrobeStatus,
        unit_type: (size_ml < 5 ? 'sample' : size_ml < 30 ? 'decant' : 'bottle') as UnitType,
        size_ml,
        remaining_ml,
        reorder_threshold_ml: status === 'have' ? size_ml * 0.2 : null,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items: WardrobeItemView[] = useMemo(() => {
    const out: WardrobeItemView[] = [];
    for (const i of storeItems) {
      const fragrance = getFragrance(i.fragrance_id);
      if (fragrance) {
        out.push({
          itemId: i.id,
          fragrance,
          status: i.status,
          size_ml: i.size_ml,
          remaining_ml: i.remaining_ml,
        });
      }
    }
    return out;
  }, [storeItems]);

  const lowItemIds = useMemo(
    () => new Set(items.filter((i) => i.status === 'have' && (i.remaining_ml / i.size_ml) < 0.2).map((i) => i.itemId)),
    [items],
  );
  const visible = useMemo(() => {
    const filtered = activeStatus === 'all' ? items : items.filter((i) => i.status === activeStatus);
    // Exclude items already shown in the Running Low banner to avoid duplication
    if (activeStatus === 'all') return filtered.filter((i) => !lowItemIds.has(i.itemId));
    return filtered;
  }, [items, activeStatus, lowItemIds]);

  const totalMl = items.filter((i) => i.status === 'have').reduce((s, i) => s + i.remaining_ml, 0);
  const haveCount = items.filter((i) => i.status === 'have').length;
  const lowCount = items.filter((i) => i.status === 'have' && (i.remaining_ml / i.size_ml) < 0.2).length;

  const handleLongPress = (item: WardrobeItemView) => {
    const storeItem = storeItems.find((i) => i.id === item.itemId);
    if (!storeItem) return;
    Alert.alert(item.fragrance.name, 'What would you like to do?', [
      {
        text: 'Edit',
        onPress: () => {
          setEditingItem(storeItem);
          setEditingFragrance(item.fragrance);
        },
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          Alert.alert('Remove from Wardrobe', `Remove ${item.fragrance.name}?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Remove', style: 'destructive', onPress: () => removeFromStore(item.itemId) },
          ]);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

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
            {activeStatus === 'all' || activeStatus === 'have'
              ? `${haveCount} fragrances · ${totalMl.toFixed(0)} mL on hand${lowCount > 0 ? ` · ${lowCount} running low` : ''}`
              : `${visible.length} ${activeStatus === 'want' ? 'wishlisted' : activeStatus === 'tested' ? 'tested' : 'sold on'}`}
          </Text>
        </View>
        <Pressable style={styles.addBtn} onPress={() => router.push({ pathname: '/(tabs)/discover', params: { from: 'wardrobe' } } as any)}>
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
        {/* Running Low section — surfaces items that need restocking */}
        {activeStatus === 'all' && lowCount > 0 && (
          <View style={styles.lowSection}>
            <Text style={styles.lowSectionTitle}>RUNNING LOW</Text>
            {items
              .filter((i) => i.status === 'have' && (i.remaining_ml / i.size_ml) < 0.2)
              .map((item) => (
                <WardrobeRow key={item.itemId} item={item} wearCount={wearCountMap[item.fragrance.id] ?? 0} onPress={() => router.push(`/fragrance/${item.fragrance.id}`)} onLongPress={() => handleLongPress(item)} />
              ))}
          </View>
        )}

        {visible.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Nothing here yet.</Text>
            <Text style={styles.emptyBody}>Switch filters or add a fragrance to get started.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {visible.map((item) => (
              <WardrobeRow key={item.itemId} item={item} wearCount={wearCountMap[item.fragrance.id] ?? 0} onPress={() => router.push(`/fragrance/${item.fragrance.id}`)} onLongPress={() => handleLongPress(item)} />
            ))}
          </View>
        )}
      </ScrollView>

      <AddToWardrobeSheet
        visible={editingItem !== null}
        fragrance={editingFragrance}
        editItem={editingItem}
        onClose={() => { setEditingItem(null); setEditingFragrance(null); }}
      />
    </SafeAreaView>
  );
}

function WardrobeRow({ item, wearCount, onPress, onLongPress }: { item: WardrobeItemView; wearCount: number; onPress: () => void; onLongPress?: () => void }) {
  const isLow = item.status === 'have' && (item.remaining_ml / item.size_ml) < 0.2;

  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={400} style={styles.row}>
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
          {wearCount > 0 && (
            <Text style={styles.wornBadge}>Worn {wearCount}×</Text>
          )}
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
    paddingLeft: SPACING.lg,
    paddingRight: SPACING.lg,
    paddingTop: SPACING.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
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
  pillRow: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, paddingRight: SPACING.xl },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    marginRight: 8,
  },
  pillActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  pillText: { ...TYPE.label, color: COLORS.muted, fontSize: 13 },
  pillTextActive: { color: COLORS.white },
  container: { paddingBottom: SPACING.xxl },
  lowSection: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs,
    gap: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  lowSectionTitle: { ...TYPE.eyebrow, color: COLORS.danger, marginBottom: SPACING.xs },
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
  wornBadge: { fontSize: 10, color: COLORS.muted, fontWeight: '500', letterSpacing: 0.3 },
  lowPill: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  lowText: { fontSize: 10, color: COLORS.danger, fontWeight: '600', letterSpacing: 0.5 },
  rowMeter: { width: 50, alignItems: 'center' },
});
