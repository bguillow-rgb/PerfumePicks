import { View, Text, TextInput, StyleSheet, FlatList, ActivityIndicator, Image, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Card } from '@/src/components/ui/Card';
import { Badge } from '@/src/components/ui/Badge';
import { CommunityRating } from '@/src/components/cigar/CommunityRating';
import { useCommunityRatings } from '@/src/hooks/useCommunityRating';
import { useHumidorStatuses } from '@/src/hooks/useHumidorStatuses';
import { StatusChips } from '@/src/components/ui/StatusChip';
import { COLORS, SPACING, RADIUS, FONTS } from '@/src/constants/theme';
import { useCigarCount } from '@/src/hooks/useCigarCount';
import type { Cigar } from '@/src/types/cigar';

const POPULAR_BRANDS = [
  'Padron', 'Arturo Fuente', 'Oliva', 'My Father', 'Liga Privada', 'Davidoff',
];

export default function BrowseScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [cigars, setCigars] = useState<Cigar[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [activeBrand, setActiveBrand] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);
  const cigarCount = useCigarCount();
  // Dedupe by (brand, line) so multiple vitolas of the same line collapse into
  // one card — users see "Padron 1964 Anniversary" once, not four times.
  // Tapping the card still routes to a specific SKU so detail works normally;
  // we just hide the redundant list entries.
  const displayedCigars = useMemo(() => {
    const seen = new Set<string>();
    const out: Cigar[] = [];
    for (const c of cigars) {
      const key = `${c.brand}::${c.line ?? c.name}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
    return out;
  }, [cigars]);

  const ratingsMap = useCommunityRatings(displayedCigars.map((c) => c.id));
  const humidorMap = useHumidorStatuses(displayedCigars.map((c) => c.id));

  const fetchByBrand = useCallback(async (brand: string) => {
    setLoading(true);
    setHasSearched(true);
    try {
      const { data } = await supabase
        .from('cigars')
        .select('*')
        .eq('brand', brand)
        .order('name')
        .limit(100);
      setCigars((data as Cigar[]) ?? []);
    } catch {
      setCigars([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchByStrength = useCallback(async (label: string, min: number, max: number) => {
    setLoading(true);
    setHasSearched(true);
    setActiveBrand(label);
    setQuery(label);
    try {
      const { data } = await supabase
        .from('cigars')
        .select('*')
        .gte('strength', min)
        .lte('strength', max)
        .order('brand')
        .limit(100);
      setCigars((data as Cigar[]) ?? []);
    } catch {
      setCigars([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBySearch = useCallback(async (search: string) => {
    if (!search.trim()) {
      setCigars([]);
      setHasSearched(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setHasSearched(true);
    try {
      // Search brand as exact start-of-string match, name as contains
      const { data } = await supabase
        .from('cigars')
        .select('*')
        .or(`brand.ilike.${search}%,name.ilike.%${search}%`)
        .order('brand')
        .limit(100);
      setCigars((data as Cigar[]) ?? []);
    } catch {
      setCigars([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeBrand) return; // Skip text search when a chip is active
    const timer = setTimeout(() => fetchBySearch(query), 300);
    return () => clearTimeout(timer);
  }, [query, fetchBySearch, activeBrand]);

  const handleBrandTap = (brand: string) => {
    setActiveBrand(brand);
    setQuery(brand);
    fetchByBrand(brand);
  };

  const handleClearSearch = () => {
    setQuery('');
    setActiveBrand(null);
    setCigars([]);
    setHasSearched(false);
  };

  const handleQueryChange = (text: string) => {
    setQuery(text);
    setActiveBrand(null); // Switch back to text search mode
  };

  const renderCigar = useCallback(({ item }: { item: Cigar }) => {
    const rating = ratingsMap.get(item.id);
    const statuses = humidorMap.get(item.id);
    return (
      <Card style={styles.cigarCard} onPress={() => router.push(`/(tabs)/cigar/${item.id}`)}>
        <View style={styles.cardRow}>
          {item.image_url ? (
            <Image source={{ uri: item.image_url }} style={styles.thumb} resizeMode="cover" />
          ) : (
            <View style={[styles.thumb, styles.thumbPlaceholder]}>
              <Text style={styles.thumbText}>{item.brand.charAt(0)}</Text>
            </View>
          )}
          <View style={styles.cardContent}>
            <Text style={styles.cigarName} numberOfLines={1}>{item.line ?? item.name}</Text>
            <Text style={styles.cigarBrand}>{item.brand}</Text>
            <View style={styles.flavors}>
              {item.flavors.slice(0, 3).map((f) => (
                <Badge key={f} label={f} />
              ))}
            </View>
            <StatusChips statuses={statuses ?? []} />
            {rating && rating.count > 0 && (
              <CommunityRating average={rating.average} count={rating.count} variant="compact" />
            )}
          </View>
        </View>
      </Card>
    );
  }, [router, ratingsMap, humidorMap]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + SPACING.sm }]}>
      <Text style={styles.title}>Browse Cigars</Text>
      <TextInput
        style={styles.search}
        placeholder={cigarCount ? `Search ${cigarCount} cigars by brand or name...` : 'Search cigars by brand or name...'}
        placeholderTextColor={COLORS.subtle}
        value={query}
        onChangeText={handleQueryChange}
        autoCorrect={false}
        returnKeyType="search"
      />

      {!hasSearched && !loading ? (
        /* Default state — no search yet */
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={true}
          indicatorStyle="white"
          bounces={true}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        >
          <Text style={styles.sectionLabel}>POPULAR BRANDS</Text>
          <View style={styles.brandGrid}>
            {POPULAR_BRANDS.map((brand) => (
              <Pressable
                key={brand}
                onPress={() => handleBrandTap(brand)}
                style={({ pressed }) => [styles.brandChip, pressed && styles.brandChipPressed]}
              >
                <Text style={styles.brandChipText}>{brand}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.sectionLabel, { marginTop: SPACING.xl }]}>BROWSE BY STRENGTH</Text>
          <View style={styles.browseOptions}>
            <Pressable onPress={() => fetchByStrength('Mild', 1, 2)} style={styles.browseCard}>
              <Text style={styles.browseCardTitle}>Mild</Text>
              <Text style={styles.browseCardSub}>Easy-going</Text>
            </Pressable>
            <Pressable onPress={() => fetchByStrength('Medium', 3, 3)} style={styles.browseCard}>
              <Text style={styles.browseCardTitle}>Medium</Text>
              <Text style={styles.browseCardSub}>Balanced</Text>
            </Pressable>
            <Pressable onPress={() => fetchByStrength('Full', 4, 5)} style={styles.browseCard}>
              <Text style={styles.browseCardTitle}>Full</Text>
              <Text style={styles.browseCardSub}>Bold</Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : loading ? (
        <ActivityIndicator color={COLORS.accent} style={{ marginTop: SPACING.xl }} />
      ) : (
        <FlatList
          ref={listRef}
          data={displayedCigars}
          keyExtractor={(c) => c.id}
          renderItem={renderCigar}
          extraData={[ratingsMap, humidorMap]}
          style={styles.list}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100, flexGrow: 1 }}
          showsVerticalScrollIndicator={true}
          indicatorStyle="white"
          bounces={true}
          alwaysBounceVertical={true}
          keyboardDismissMode="on-drag"
          onContentSizeChange={() => listRef.current?.flashScrollIndicators()}
          ListEmptyComponent={
            <View style={styles.noResults}>
              <Text style={styles.noResultsTitle}>No cigars found</Text>
              <Text style={styles.noResultsSub}>Try a different search term</Text>
              <Pressable onPress={handleClearSearch} style={styles.clearBtn}>
                <Text style={styles.clearBtnText}>Clear Search</Text>
              </Pressable>
            </View>
          }
          ListHeaderComponent={
            <View style={styles.resultHeader}>
              <Text style={styles.resultCount}>{cigars.length} result{cigars.length !== 1 ? 's' : ''}</Text>
              <Pressable onPress={handleClearSearch} hitSlop={12}>
                <Text style={styles.clearLink}>Clear</Text>
              </Pressable>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingHorizontal: SPACING.md,
  },
  title: {
    fontFamily: 'Cormorant',
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  search: {
    fontFamily: 'Cormorant',
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.text,
    marginBottom: SPACING.md,
  },

  // Default state
  sectionLabel: {
    fontFamily: 'Cormorant',
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.subtle,
    letterSpacing: 2,
    marginBottom: SPACING.sm,
  },
  brandGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  brandChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  brandChipPressed: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  brandChipText: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  browseOptions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  browseCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    alignItems: 'center',
  },
  browseCardTitle: {
    fontFamily: 'Cormorant',
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.accent,
  },
  browseCardSub: {
    fontFamily: 'Cormorant',
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 4,
  },

  // Results
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  resultCount: {
    fontFamily: 'Cormorant',
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.subtle,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  clearLink: {
    fontFamily: 'Cormorant',
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.accent,
  },
  list: {
    flex: 1,
  },
  cigarCard: {
    marginBottom: SPACING.sm,
  },
  cardRow: {
    flexDirection: 'row',
    gap: 12,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.card2,
  },
  thumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  thumbText: {
    fontFamily: 'Cormorant',
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.accent,
  },
  cardContent: {
    flex: 1,
  },
  cigarName: {
    fontFamily: 'Cormorant',
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  cigarBrand: {
    fontFamily: 'Cormorant',
    fontSize: 13,
    color: COLORS.muted,
    marginTop: 2,
    marginBottom: 6,
  },
  flavors: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },

  // No results
  noResults: {
    alignItems: 'center',
    paddingTop: SPACING.xxl,
  },
  noResultsTitle: {
    fontFamily: 'Cormorant',
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  noResultsSub: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    color: COLORS.muted,
    marginTop: SPACING.xs,
  },
  clearBtn: {
    marginTop: SPACING.md,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  clearBtnText: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.accent,
  },
});
