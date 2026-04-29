import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { COLORS, SPACING, TYPE, RADIUS } from '@/src/constants/theme';
import { FragranceCard } from '@/src/components/fragrance/FragranceCard';
import { useCatalogStore, type Fragrance } from '@/src/stores/useCatalogStore';

const FOR_HER_GENDERS = ['feminine', 'unisex'];

export default function BrandScreen() {
  const { brand } = useLocalSearchParams<{ brand: string }>();
  const router = useRouter();
  const brandName = decodeURIComponent(brand ?? '');

  const [fragrances, setFragrances] = useState<Fragrance[]>([]);
  const [showMasculine, setShowMasculine] = useState(false);

  const genders = showMasculine ? undefined : FOR_HER_GENDERS;

  useEffect(() => {
    if (!brandName) return;
    useCatalogStore.getState().fetchByBrand(brandName, genders).then(setFragrances);
  }, [brandName, showMasculine]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={COLORS.text} />
        </Pressable>
        <View style={styles.titleWrap}>
          <Text style={styles.title} numberOfLines={1}>{brandName}</Text>
          <Text style={styles.subtitle}>{fragrances.length} fragrances</Text>
        </View>
        <Pressable
          style={[styles.toggle, showMasculine && styles.toggleActive]}
          onPress={() => setShowMasculine((v) => !v)}
        >
          <Text style={[styles.toggleText, showMasculine && styles.toggleTextActive]}>
            {showMasculine ? 'All' : 'For Her'}
          </Text>
        </Pressable>
      </View>

      {fragrances.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No fragrances found for {brandName}</Text>
        </View>
      ) : (
        <FlatList
          data={fragrances}
          keyExtractor={(f) => f.id}
          renderItem={({ item }) => (
            <View style={styles.item}>
              <FragranceCard fragrance={item} />
            </View>
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  back: { padding: 4 },
  titleWrap: { flex: 1 },
  title: { ...TYPE.heading, fontSize: 18 },
  subtitle: { ...TYPE.caption, color: COLORS.muted, marginTop: 2 },
  toggle: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  toggleActive: { backgroundColor: COLORS.text, borderColor: COLORS.text },
  toggleText: { ...TYPE.caption, color: COLORS.muted, fontWeight: '600' },
  toggleTextActive: { color: COLORS.bg },
  list: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.xxl },
  item: { marginBottom: SPACING.md },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  emptyText: { ...TYPE.bodySmall, color: COLORS.muted, textAlign: 'center' },
});
