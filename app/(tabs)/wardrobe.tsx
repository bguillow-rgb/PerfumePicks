import { useState, useMemo, useEffect } from 'react';
import { FlatList, View, Text, StyleSheet, Pressable, Image, Alert, Modal, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, RADIUS, FONTS } from '@/src/constants/theme';
import { useCatalogStore, getFragranceFromStore, type Fragrance } from '@/src/stores/useCatalogStore';
import { useWardrobeStore, type WardrobeStatus, type WardrobeItem } from '@/src/stores/useWardrobeStore';
import { useWearLogStore } from '@/src/stores/useWearLogStore';
import { useFragranceNotesStore } from '@/src/stores/useFragranceNotesStore';
import { AddToWardrobeSheet } from '@/src/components/sheets/AddToWardrobeSheet';

type Status = WardrobeStatus;
type ActiveFilter = 'all' | 'want' | 'have' | 'worn';
type WardrobeSort = 'price_desc' | 'price_asc' | 'worn' | 'az' | 'newest';

const PILLS: { id: ActiveFilter; label: string }[] = [
  { id: 'all',  label: 'All' },
  { id: 'want', label: 'Want' },
  { id: 'have', label: 'Have' },
  { id: 'worn', label: 'Tried' },
];

const SORT_OPTIONS: { id: WardrobeSort; label: string }[] = [
  { id: 'price_desc', label: 'Most Expensive' },
  { id: 'price_asc',  label: 'Least Expensive' },
  { id: 'worn',       label: 'Most Worn' },
  { id: 'newest',     label: 'Newest First' },
  { id: 'az',         label: 'A–Z' },
];

interface WardrobeItemView {
  itemId: string;
  fragrance: Fragrance;
  status: Status;
  size_ml: number;
  remaining_ml: number;
}

export default function WardrobeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('have');
  const [activeSort, setActiveSort] = useState<WardrobeSort>('price_desc');
  const [sortSheetOpen, setSortSheetOpen] = useState(false);

  const storeItems = useWardrobeStore((s) => s.items);
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
  const [editingFragrance, setEditingFragrance] = useState<Fragrance | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const notesSearch = useFragranceNotesStore((s) => s.search);

  const fetchMany = useCatalogStore((s) => s.fetchMany);
  const cacheVersion = useCatalogStore((s) => Object.keys(s.cache).length);
  const [catalogLoading, setCatalogLoading] = useState(() => storeItems.length > 0);
  useEffect(() => {
    const ids = Array.from(new Set(storeItems.map((i) => i.fragrance_id)));
    if (ids.length === 0) { setCatalogLoading(false); return; }
    setCatalogLoading(true);
    fetchMany(ids)
      .catch(() => {})
      .finally(() => setCatalogLoading(false));
  }, [storeItems, fetchMany]);

  const items: WardrobeItemView[] = useMemo(() => {
    const out: WardrobeItemView[] = [];
    for (const i of storeItems) {
      const fragrance = getFragranceFromStore(i.fragrance_id);
      if (fragrance) {
        out.push({ itemId: i.id, fragrance, status: i.status, size_ml: i.size_ml, remaining_ml: i.remaining_ml });
      }
    }
    return out;
  }, [storeItems, cacheVersion]);

  const visible = useMemo(() => {
    let filtered = items;
    if (activeFilter === 'worn') filtered = filtered.filter((i) => (wearCountMap[i.fragrance.id] ?? 0) > 0);
    else if (activeFilter !== 'all') filtered = filtered.filter((i) => i.status === activeFilter);

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      const noteMatchIds = new Set(notesSearch(q).map((n) => n.fragrance_id));
      filtered = filtered.filter((i) =>
        i.fragrance.name.toLowerCase().includes(q) ||
        i.fragrance.brand.toLowerCase().includes(q) ||
        i.fragrance.top_accords.some((a) => a.toLowerCase().includes(q)) ||
        noteMatchIds.has(i.fragrance.id),
      );
    }

    return [...filtered].sort((a, b) => {
      switch (activeSort) {
        case 'price_desc': return (b.fragrance.price_tier ?? 0) - (a.fragrance.price_tier ?? 0);
        case 'price_asc':  return (a.fragrance.price_tier ?? 0) - (b.fragrance.price_tier ?? 0);
        case 'worn':       return (wearCountMap[b.fragrance.id] ?? 0) - (wearCountMap[a.fragrance.id] ?? 0);
        case 'az':         return a.fragrance.name.localeCompare(b.fragrance.name);
        case 'newest':     return (b.fragrance.release_year ?? 0) - (a.fragrance.release_year ?? 0);
        default:           return 0;
      }
    });
  }, [items, activeFilter, wearCountMap, searchQuery, notesSearch, activeSort]);

  const haveCount = items.filter((i) => i.status === 'have').length;
  const lowCount = items.filter((i) => i.status === 'have' && (i.remaining_ml / i.size_ml) < 0.2).length;

  const sortLabel = SORT_OPTIONS.find((s) => s.id === activeSort)?.label ?? 'Sort';


  const handleLongPress = (item: WardrobeItemView) => {
    const storeItem = storeItems.find((i) => i.id === item.itemId);
    if (!storeItem) return;
    Alert.alert(item.fragrance.name, 'What would you like to do?', [
      { text: 'Edit', onPress: () => { setEditingItem(storeItem); setEditingFragrance(item.fragrance); } },
      {
        text: 'Delete', style: 'destructive',
        onPress: () => Alert.alert('Remove from Wardrobe', `Remove ${item.fragrance.name}?`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: () => removeFromStore(item.itemId) },
        ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const subtitle = activeFilter === 'all'
    ? `${items.length} fragrance${items.length !== 1 ? 's' : ''}`
    : activeFilter === 'have'
      ? `${haveCount} on hand${lowCount > 0 ? ` · ${lowCount} running low` : ''}`
      : activeFilter === 'want'
        ? `${visible.length} wishlisted`
        : `${items.filter((i) => (wearCountMap[i.fragrance.id] ?? 0) > 0).length} worn`;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>

      {/* Fixed header — title + add button */}
      <View style={styles.headerWrap}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>
            <Text style={styles.titleItalic}>my</Text>Wardrobe
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
        </View>
        <Pressable
          style={styles.addBtn}
          onPress={() => router.push({ pathname: '/(tabs)/discover', params: { from: 'wardrobe' } } as any)}
        >
          <Ionicons name="add" size={22} color={COLORS.white} />
        </Pressable>
      </View>

      {/* Filter pills row */}
      <View style={styles.filterRow}>
        {PILLS.map((p) => {
          const active = activeFilter === p.id;
          return (
            <Pressable
              key={p.id}
              onPress={() => setActiveFilter(p.id)}
              style={[styles.filterPill, active && styles.filterPillActive]}
            >
              <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>{p.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Search bar */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={16} color={COLORS.muted} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search name, brand, notes..."
          placeholderTextColor={COLORS.subtle}
          style={styles.searchInput}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={16} color={COLORS.muted} />
          </Pressable>
        )}
      </View>

      {/* Sort row */}
      <View style={styles.sortRow}>
        <Pressable style={styles.sortBtn} onPress={() => setSortSheetOpen(true)}>
          <Ionicons name="swap-vertical-outline" size={13} color={COLORS.muted} />
          <Text style={styles.sortBtnText}>{sortLabel}</Text>
          <Ionicons name="chevron-down" size={11} color={COLORS.muted} />
        </Pressable>
      </View>

      {/* List — flex: 1 fills all remaining space, no key= so no remount on filter change */}
      <FlatList
        data={visible}
        keyExtractor={(item) => item.itemId}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <WardrobeRow
            item={item}
            wearCount={wearCountMap[item.fragrance.id] ?? 0}
            onPress={() => router.push(`/fragrance/${item.fragrance.id}`)}
            onLongPress={() => handleLongPress(item)}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          !catalogLoading ? (
            <View style={styles.empty}>
              <Ionicons name="rose-outline" size={32} color={COLORS.accent} style={{ marginBottom: SPACING.sm }} />
              <Text style={styles.emptyTitle}>
                {storeItems.length === 0 ? 'Start your collection' : 'No matches'}
              </Text>
              <Text style={styles.emptyBody}>
                {storeItems.length === 0
                  ? 'Tap + to search, or use the camera button to scan a bottle you own.'
                  : searchQuery ? `No fragrances match "${searchQuery}".` : 'Try a different filter.'}
              </Text>
              {storeItems.length === 0 && (
                <Pressable
                  style={styles.emptyCta}
                  onPress={() => router.push({ pathname: '/(tabs)/discover', params: { from: 'wardrobe' } } as any)}
                >
                  <Text style={styles.emptyCtaText}>Browse Fragrances</Text>
                </Pressable>
              )}
            </View>
          ) : null
        }
      />

      {/* Branded sort sheet */}
      <Modal visible={sortSheetOpen} transparent animationType="slide" onRequestClose={() => setSortSheetOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setSortSheetOpen(false)}>
          <Pressable style={styles.sheetContainer} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Sort by</Text>
            {SORT_OPTIONS.map((opt) => {
              const active = activeSort === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  style={[styles.sheetOption, active && styles.sheetOptionActive]}
                  onPress={() => { setActiveSort(opt.id); setSortSheetOpen(false); }}
                >
                  <Text style={[styles.sheetOptionText, active && styles.sheetOptionTextActive]}>{opt.label}</Text>
                  {active && <Ionicons name="checkmark" size={16} color={COLORS.accent} />}
                </Pressable>
              );
            })}
            <Pressable style={styles.sheetCancel} onPress={() => setSortSheetOpen(false)}>
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <AddToWardrobeSheet
        visible={editingItem !== null}
        fragrance={editingFragrance}
        editItem={editingItem}
        onClose={() => { setEditingItem(null); setEditingFragrance(null); }}
      />
    </View>
  );
}

function WardrobeRow({ item, wearCount, onPress, onLongPress }: {
  item: WardrobeItemView; wearCount: number; onPress: () => void; onLongPress?: () => void;
}) {
  const isLow = item.status === 'have' && (item.remaining_ml / item.size_ml) < 0.2;
  const price = '$'.repeat(Math.min(item.fragrance.price_tier ?? 0, 4)) || null;
  const accords = item.fragrance.top_accords.slice(0, 2);

  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={400} style={styles.row} accessibilityLabel={item.fragrance.name}>
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
          {wearCount > 0 && <Text style={styles.wornBadge}>Worn {wearCount}×</Text>}
          {isLow && (
            <View style={styles.lowPill}>
              <Ionicons name="alert-circle" size={11} color={COLORS.danger} />
              <Text style={styles.lowText}>Reorder</Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.rowMeta}>
        {price && <Text style={styles.rowPrice}>{price}</Text>}
        {accords.map((a) => (
          <View key={a} style={styles.rowAccordChip}>
            <Text style={styles.rowAccordText}>{a.replace(/-/g, ' ')}</Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

function statusLabel(s: Status): string {
  return ({ have: 'In Rotation', want: 'Wishlist', tested: 'Tested', sold_on: 'Sold On', empty: 'Empty' }[s]);
}
function statusStyle(s: Status): any {
  return ({ have: { backgroundColor: COLORS.accentSoft }, want: { backgroundColor: COLORS.blushSoft }, tested: { backgroundColor: COLORS.card2 }, sold_on: { backgroundColor: COLORS.card2 }, empty: { backgroundColor: COLORS.card2 } }[s]);
}
function statusTextStyle(s: Status): any {
  return ({ have: { color: COLORS.burgundy }, want: { color: COLORS.burgundy }, tested: { color: COLORS.muted }, sold_on: { color: COLORS.muted }, empty: { color: COLORS.muted } }[s]);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },

  headerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs,
  },
  headerLeft: { flex: 1 },
  title: { ...TYPE.displayLarge },
  titleItalic: { fontStyle: 'italic', color: COLORS.accent, fontFamily: 'CormorantGaramond_400Regular_Italic' },
  subtitle: { ...TYPE.caption, color: COLORS.muted, marginTop: 2, height: 16 },
  addBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.accent,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: SPACING.md,
  },

  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: 4,
    gap: 8,
  },
  sortRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  filterPillActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  filterPillText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  filterPillTextActive: { color: COLORS.white },

  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  sortBtnText: { fontSize: 11, fontWeight: '500', color: COLORS.muted },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
  },
  searchInput: { ...TYPE.body, flex: 1, padding: 0, fontSize: 14 },

  listContent: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.xs, paddingBottom: SPACING.xxl },
  separator: { height: SPACING.sm },

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
  emptyBody: { ...TYPE.bodySmall, textAlign: 'center', marginBottom: SPACING.md },
  emptyCta: {
    backgroundColor: COLORS.accent, paddingHorizontal: SPACING.xl,
    paddingVertical: 12, borderRadius: RADIUS.full,
  },
  emptyCtaText: { ...TYPE.label, color: COLORS.white, letterSpacing: 1.5 },

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
  rowImageWrap: { width: 70, height: 70, borderRadius: RADIUS.md, overflow: 'hidden', backgroundColor: COLORS.card2 },
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
  rowMeta: { alignItems: 'flex-end', gap: 5, flexShrink: 0 },
  rowPrice: { fontFamily: FONTS.serif, fontSize: 13, fontWeight: '600', color: COLORS.accent, letterSpacing: 0.5 },
  rowAccordChip: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.blushSoft,
    borderWidth: 1, borderColor: COLORS.blush,
  },
  rowAccordText: { fontSize: 10, fontWeight: '500', color: COLORS.accent, letterSpacing: 0.2 },

  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(42,31,24,0.45)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: SPACING.lg,
    paddingBottom: 36,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderColor: COLORS.border,
  },
  sheetHandle: {
    width: 36, height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginBottom: SPACING.md,
  },
  sheetTitle: {
    fontFamily: FONTS.serif,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.muted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: SPACING.sm,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  sheetOptionActive: {},
  sheetOptionText: {
    fontFamily: FONTS.serif,
    fontSize: 18,
    color: COLORS.text,
    fontWeight: '500',
  },
  sheetOptionTextActive: {
    color: COLORS.accent,
    fontWeight: '600',
  },
  sheetCancel: {
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  sheetCancelText: {
    ...TYPE.label,
    color: COLORS.muted,
    letterSpacing: 1,
  },
});
