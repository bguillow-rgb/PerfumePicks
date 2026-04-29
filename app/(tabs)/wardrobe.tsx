import { useState, useMemo, useEffect, useCallback } from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, Image, Alert, ActionSheetIOS, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, RADIUS, FONTS } from '@/src/constants/theme';
import { MlMeter } from '@/src/components/fragrance/MlMeter';
import { SAMPLE_WARDROBE_IDS, getFragrance, type MockFragrance } from '@/src/mock/fragrances';
import { useWardrobeStore, type WardrobeStatus, type UnitType, type WardrobeItem } from '@/src/stores/useWardrobeStore';
import { useWearLogStore } from '@/src/stores/useWearLogStore';
import { AddToWardrobeSheet } from '@/src/components/sheets/AddToWardrobeSheet';

type Status = WardrobeStatus;
type ActiveFilter = 'all' | 'want' | 'have' | 'worn';

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
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('have');

  // Always open on "Have" (my collection) when navigating to this tab.
  useFocusEffect(useCallback(() => { setActiveFilter('have'); }, []));

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


  const visible = useMemo(() => {
    if (activeFilter === 'all') return items;
    if (activeFilter === 'worn') return items.filter((i) => (wearCountMap[i.fragrance.id] ?? 0) > 0);
    return items.filter((i) => i.status === activeFilter);
  }, [items, activeFilter, wearCountMap]);

  const totalMl = items.filter((i) => i.status === 'have').reduce((s, i) => s + i.remaining_ml, 0);
  const haveCount = items.filter((i) => i.status === 'have').length;
  const lowCount = items.filter((i) => i.status === 'have' && (i.remaining_ml / i.size_ml) < 0.2).length;
  const wornCount = useMemo(() => items.filter((i) => (wearCountMap[i.fragrance.id] ?? 0) > 0).length, [items, wearCountMap]);

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

  const PILLS: { id: ActiveFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'want', label: 'Want' },
    { id: 'have', label: 'Have' },
    { id: 'worn', label: 'Worn' },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerWrap}>
        <View>
          <Text style={styles.title}>
            <Text style={styles.titleItalic}>my</Text>Wardrobe
          </Text>
          <Text style={styles.subtitle}>
            {activeFilter === 'all'
              ? `${items.length} fragrance${items.length !== 1 ? 's' : ''}`
              : activeFilter === 'have'
                ? `${haveCount} on hand · ${totalMl.toFixed(0)} mL${lowCount > 0 ? ` · ${lowCount} running low` : ''}`
                : activeFilter === 'want'
                  ? `${visible.length} wishlisted`
                  : `${wornCount} worn`}
          </Text>
        </View>
        <Pressable
          style={styles.addBtn}
          onPress={() => {
            const search = () => router.push({ pathname: '/(tabs)/discover', params: { from: 'wardrobe' } } as any);
            const photo = () => Alert.alert('Coming Soon', 'Bottle photo recognition is on the way!');
            if (Platform.OS === 'ios') {
              ActionSheetIOS.showActionSheetWithOptions(
                { options: ['Cancel', 'Take a photo of my bottle', 'Search for it'], cancelButtonIndex: 0 },
                (i) => { if (i === 1) photo(); else if (i === 2) search(); },
              );
            } else {
              Alert.alert('Add Fragrance', 'How would you like to add it?', [
                { text: 'Take a photo', onPress: photo },
                { text: 'Search for it', onPress: search },
                { text: 'Cancel', style: 'cancel' },
              ]);
            }
          }}
        >
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
          <Pressable key={p.id} onPress={() => setActiveFilter(p.id)}>
            <View style={[styles.pill, activeFilter === p.id && styles.pillActive]}>
              <Text style={[styles.pillText, activeFilter === p.id && styles.pillTextActive]}>{p.label}</Text>
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
  pillActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  pillText: { fontFamily: FONTS.body, fontSize: 13, fontWeight: '600', color: COLORS.text, letterSpacing: 0.3 },
  pillTextActive: { color: COLORS.white },
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
  wornBadge: { fontSize: 10, color: COLORS.muted, fontWeight: '500', letterSpacing: 0.3 },
  lowPill: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  lowText: { fontSize: 10, color: COLORS.danger, fontWeight: '600', letterSpacing: 0.5 },
  rowMeter: { width: 50, alignItems: 'center' },
});
