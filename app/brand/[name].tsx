import { useEffect, useState } from 'react';
import { FlatList, View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, FONTS, RADIUS } from '@/src/constants/theme';
import { useCatalogStore, type Fragrance } from '@/src/stores/useCatalogStore';

function prettyConcentration(c: string): string {
  return ({ parfum: 'Parfum', edp: 'EDP', edt: 'EDT', cologne: 'Cologne', extrait: 'Extrait' } as any)[c] ?? c;
}

export default function BrandScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const router = useRouter();
  const fetchByBrand = useCatalogStore((s) => s.fetchByBrand);
  const [fragrances, setFragrances] = useState<Fragrance[]>([]);

  // Async catalog fetch instead of synchronous MOCK_CATALOG filter. Empty
  // array shows the existing "no fragrances found" empty state during the
  // (very short) round-trip.
  useEffect(() => {
    if (!name) return;
    let cancelled = false;
    fetchByBrand(name).then((rows) => {
      if (cancelled) return;
      setFragrances(rows.slice().sort((a, b) => b.release_year - a.release_year));
    });
    return () => { cancelled = true; };
  }, [name, fetchByBrand]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={COLORS.text} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.brandName} numberOfLines={1}>{name}</Text>
          <Text style={styles.count}>{fragrances.length} fragrance{fragrances.length !== 1 ? 's' : ''}</Text>
        </View>
      </View>

      <FlatList
        data={fragrances}
        keyExtractor={(f) => f.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => <BrandRow fragrance={item} onPress={() => router.push(`/fragrance/${item.id}`)} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No fragrances found for this house.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function BrandRow({ fragrance, onPress }: { fragrance: Fragrance; onPress: () => void }) {
  const price = (fragrance.retail_msrp_usd_cents / 100).toFixed(0);
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
        <Text style={styles.price}>${price}</Text>
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
