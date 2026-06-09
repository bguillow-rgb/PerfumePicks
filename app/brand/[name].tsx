import { useEffect, useState, useMemo } from 'react';
import { FlatList, ScrollView, View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, FONTS, RADIUS } from '@/src/constants/theme';
import { useCatalogStore, type Fragrance } from '@/src/stores/useCatalogStore';

type BrandSort = 'popular' | 'newest' | 'price_asc' | 'price_desc' | 'az';
const SORT_PILLS: { id: BrandSort; label: string }[] = [
  { id: 'popular',    label: 'Popular' },
  { id: 'newest',     label: 'Newest' },
  { id: 'price_desc', label: 'Price ↓' },
  { id: 'price_asc',  label: 'Price ↑' },
  { id: 'az',         label: 'A–Z' },
];

function prettyConcentration(c: string): string {
  return ({ parfum: 'Parfum', edp: 'EDP', edt: 'EDT', cologne: 'Cologne', extrait: 'Extrait' } as any)[c] ?? c;
}

export default function BrandScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const router = useRouter();
  const fetchByBrand = useCatalogStore((s) => s.fetchByBrand);
  const [fragrances, setFragrances] = useState<Fragrance[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSort, setActiveSort] = useState<BrandSort>('popular');

  useEffect(() => {
    if (!name) return;
    let cancelled = false;
    setLoading(true);
    fetchByBrand(name).then((rows) => {
      if (cancelled) return;
      setFragrances(rows);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [name, fetchByBrand]);

  const sorted = useMemo(() => {
    return [...fragrances].sort((a, b) => {
      switch (activeSort) {
        case 'popular':    return (b.compliment_score ?? 0) - (a.compliment_score ?? 0);
        case 'newest':     return (b.release_year ?? 0) - (a.release_year ?? 0);
        case 'price_asc':  return (a.price_tier ?? 0) - (b.price_tier ?? 0);
        case 'price_desc': return (b.price_tier ?? 0) - (a.price_tier ?? 0);
        case 'az':         return a.name.localeCompare(b.name);
        default:           return 0;
      }
    });
  }, [fragrances, activeSort]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={COLORS.text} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.brandName} numberOfLines={1}>{name}</Text>
          <Text style={styles.count}>{fragrances.length} fragrance{fragrances.length !== 1 ? 's' : ''}</Text>
        </View>
      </View>

      {/* Sort bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ height: 48 }}
        contentContainerStyle={{ paddingHorizontal: SPACING.lg, gap: 8, flexDirection: 'row', alignItems: 'center' }}
      >
        {SORT_PILLS.map((p) => {
          const active = activeSort === p.id;
          return (
            <Pressable
              key={p.id}
              onPress={() => setActiveSort(p.id)}
              style={{
                paddingHorizontal: 13, paddingVertical: 6,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: active ? COLORS.accent : COLORS.border,
                backgroundColor: active ? COLORS.accentSoft : COLORS.bg,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: active ? COLORS.accent : COLORS.muted }}>
                {p.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <FlatList
        data={sorted}
        keyExtractor={(f) => f.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => <BrandRow fragrance={item} onPress={() => router.push(`/fragrance/${item.id}`)} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No fragrances found for this house.</Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

function BrandRow({ fragrance, onPress }: { fragrance: Fragrance; onPress: () => void }) {
  const priceLabel = fragrance.retail_msrp_usd_cents
    ? `$${(fragrance.retail_msrp_usd_cents / 100).toFixed(0)}`
    : null;
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.imageWrap}>
        <Image source={{ uri: fragrance.image_url }} style={styles.image} />
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={2}>{fragrance.name}</Text>
        <Text style={styles.meta}>
          {prettyConcentration(fragrance.concentration)}
          {' · '}
          {fragrance.fragrance_family}
          {' · '}
          {fragrance.release_year}
        </Text>
        <View style={styles.accordRow}>
          {fragrance.top_accords.slice(0, 3).map((a) => (
            <View key={a} style={styles.accord}>
              <Text style={styles.accordText}>{a.replace('-', ' ')}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.priceCol}>
        {priceLabel && <Text style={styles.price}>{priceLabel}</Text>}
        <View style={styles.tierDots}>
          {Array.from({ length: 5 }).map((_, i) => (
            <View key={i} style={[styles.dot, i < fragrance.price_tier && styles.dotActive]} />
          ))}
        </View>
        <Ionicons name="chevron-forward" size={16} color={COLORS.muted} style={{ marginTop: 8 }} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    gap: SPACING.md,
  },
  backBtn: { width: 32, alignItems: 'flex-start' },
  headerText: { flex: 1 },
  brandName: {
    fontFamily: FONTS.serif,
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
    lineHeight: 28,
  },
  count: { ...TYPE.caption, color: COLORS.muted, marginTop: 2 },

  list: { paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border, marginVertical: SPACING.sm },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    gap: SPACING.md,
  },
  imageWrap: {
    width: 80, height: 100,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    backgroundColor: COLORS.card2,
  },
  image: { width: '100%', height: '100%' },
  info: { flex: 1, gap: 4 },
  name: {
    fontFamily: FONTS.serif,
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    lineHeight: 22,
  },
  meta: { ...TYPE.caption, color: COLORS.muted, fontStyle: 'italic' },
  accordRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  accord: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.card2,
    borderWidth: 1, borderColor: COLORS.border,
  },
  accordText: { fontSize: 10, color: COLORS.subtle, fontWeight: '500', letterSpacing: 0.3 },

  priceCol: { alignItems: 'center', gap: 2, minWidth: 44 },
  price: {
    fontFamily: FONTS.serif,
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
  },
  tierDots: { flexDirection: 'row', gap: 2 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.border },
  dotActive: { backgroundColor: COLORS.accent },

  empty: { padding: SPACING.xl, alignItems: 'center' },
  emptyText: { ...TYPE.bodySmall, color: COLORS.muted, fontStyle: 'italic' },
});
