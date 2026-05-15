import { useState, useMemo, useEffect } from 'react';
import { ScrollView, View, Text, StyleSheet, TextInput, Pressable, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, RADIUS, FONTS } from '@/src/constants/theme';
import { DISCOVER_ACCORDS } from '@/src/constants/accords';
import { FragranceCard } from '@/src/components/fragrance/FragranceCard';
// ALL_BRANDS removed — now derived dynamically from the pool so brand
// names match the actual Supabase brands.name values.
import {
  useCatalogStore,
  type Fragrance,
} from '@/src/stores/useCatalogStore';
import { useFragranceNotesStore } from '@/src/stores/useFragranceNotesStore';
import { DiscoverFilterSheet, type DiscoverFilters, EMPTY_FILTERS, filtersActive } from '@/src/components/sheets/DiscoverFilterSheet';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * Curated Edits — mood-based rails derived from the live catalog pool.
 *
 * Each edit defines a filter function that selects fragrances from the pool.
 * This replaces the old hardcoded slug-based CURATED_EDITS which shipped
 * mock slugs that failed against UUID primary keys in production.
 */
const CURATED_EDITS_META = [
  {
    id: 'boudoir',
    label: 'Boudoir',
    filter: (f: Fragrance) =>
      f.top_accords.some((a) => ['amber', 'vanilla', 'oud', 'sweet', 'warm-spicy', 'musk'].includes(a)) &&
      (f.gender === 'feminine' || f.gender === 'unisex'),
  },
  {
    id: 'office',
    label: 'Office',
    filter: (f: Fragrance) => f.office_safe_score >= 0.6,
  },
  {
    id: 'date-night',
    label: 'Date Night',
    filter: (f: Fragrance) => f.compliment_score >= 0.6,
  },
  {
    id: 'summer',
    label: 'Summer',
    filter: (f: Fragrance) =>
      f.top_accords.some((a) => ['fresh', 'citrus', 'aquatic', 'green', 'floral'].includes(a)),
  },
  {
    id: 'winter',
    label: 'Winter',
    filter: (f: Fragrance) =>
      f.top_accords.some((a) => ['amber', 'vanilla', 'oud', 'woody', 'warm-spicy', 'gourmand'].includes(a)),
  },
] as const;

const RAIL_SIZE = 10;

/**
 * Discover tab — search + browse the catalog.
 *
 * Sections:
 *   - Search bar (matches name/brand/note/accord)
 *   - Curated Edits horizontal rail (Boudoir, Office, Date Night, Summer, Winter)
 *   - By House grid
 *   - By Accord grid
 */
export default function DiscoverScreen() {
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const [query, setQuery] = useState('');
  const [activeEdit, setActiveEdit] = useState<string>(CURATED_EDITS_META[0].id);
  const notesSearch = useFragranceNotesStore((s) => s.search);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [filters, setFilters] = useState<DiscoverFilters>(EMPTY_FILTERS);

  // Celebrity Picks — fragrances worn by famous people.
  const [celebrityPicks, setCelebrityPicks] = useState<Fragrance[]>([]);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    (async () => {
      const { data } = await supabase
        .from('fragrance_celebrities')
        .select('fragrance_id')
        .eq('verified', true)
        .limit(50);
      if (!data?.length) return;
      const ids = [...new Set(data.map((r: any) => r.fragrance_id))];
      const frags = await fetchMany(ids);
      setCelebrityPicks(frags.slice(0, RAIL_SIZE));
    })();
  }, [fetchMany]);

  // Pull the active catalog pool once so the "By House" + "By Accord"
  // counts and the curated-edit fallback have real data behind them.
  const fetchAllActive = useCatalogStore((s) => s.fetchAllActive);
  const fetchMany = useCatalogStore((s) => s.fetchMany);
  const searchStore = useCatalogStore((s) => s.search);
  const [pool, setPool] = useState<Fragrance[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchAllActive(200).then((rows) => { if (!cancelled) setPool(rows); });
    return () => { cancelled = true; };
  }, [fetchAllActive]);

  // When navigated here from the wardrobe "+" button, pass context through so
  // the fragrance detail page can navigate back to wardrobe after adding.
  const fragranceHref = (id: string) =>
    from === 'wardrobe' ? `/fragrance/${id}?from=wardrobe` : `/fragrance/${id}`;

  // Debounced async search against Supabase; falls back to MOCK_CATALOG
  // in demo mode via the store's search() method.
  const [searchResults, setSearchResults] = useState<Fragrance[]>([]);
  useEffect(() => {
    const q = query.trim();
    if (!q) { setSearchResults([]); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      searchStore(q, 30).then((rows) => {
        if (cancelled) return;
        // Augment with private-note matches: any of our owned fragrances
        // whose notes text contains the query also surface.
        const notesMatchIds = notesSearch(q.toLowerCase()).map((n) => n.fragrance_id);
        if (notesMatchIds.length === 0) { setSearchResults(rows); return; }
        // Fetch any note-matches that aren't already in the results.
        const have = new Set(rows.map((r) => r.id));
        const missing = notesMatchIds.filter((id) => !have.has(id));
        if (missing.length === 0) { setSearchResults(rows); return; }
        fetchMany(missing).then((extra) => {
          if (!cancelled) setSearchResults([...rows, ...extra]);
        });
      });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, notesSearch, searchStore, fetchMany]);

  // Apply faceted filters to the pool.
  const filteredPool = useMemo(() => {
    let result = pool;
    if (filters.genders.length > 0) {
      result = result.filter((f) => filters.genders.includes(f.gender));
    }
    if (filters.accords.length > 0) {
      result = result.filter((f) => f.top_accords.some((a) => filters.accords.includes(a)));
    }
    if (filters.priceTiers.length > 0) {
      result = result.filter((f) => filters.priceTiers.includes(f.price_tier));
    }
    if (filters.yearMin != null && filters.yearMax != null) {
      result = result.filter((f) => f.release_year >= filters.yearMin! && f.release_year <= filters.yearMax!);
    }
    return result;
  }, [pool, filters]);

  // Scent twins — users with similar taste
  const [scentTwins, setScentTwins] = useState<{ twin_user_id: string; overlap_count: number; jaccard: number; display_name?: string }[]>([]);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.rpc('get_scent_twins', { target_user: user.id });
      if (!data?.length) return;
      // Fetch display names for twins
      const ids = data.map((t: any) => t.twin_user_id);
      const { data: profiles } = await supabase.from('profiles').select('id, display_name').in('id', ids);
      const nameMap = new Map((profiles ?? []).map((p: any) => [p.id, p.display_name]));
      setScentTwins(data.map((t: any) => ({ ...t, display_name: nameMap.get(t.twin_user_id) ?? null })));
    })();
  }, []);

  // Collaborative filtering recs — fragrances loved by similar users
  const [collabRecs, setCollabRecs] = useState<Fragrance[]>([]);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.rpc('get_collab_recs', { target_user: user.id, rec_limit: 10 });
      if (!data?.length) return;
      const ids = data.map((r: any) => r.fragrance_id);
      const frags = await fetchMany(ids);
      setCollabRecs(frags);
    })();
  }, [fetchMany]);

  // Derive brand list + counts dynamically from the pool.
  const topBrands = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of filteredPool) {
      counts.set(f.brand, (counts.get(f.brand) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);
  }, [filteredPool]);

  // Derive curated-edit fragrances from the filtered pool.
  const editFragrances = useMemo(() => {
    const meta = CURATED_EDITS_META.find((e) => e.id === activeEdit) ?? CURATED_EDITS_META[0];
    return filteredPool.filter(meta.filter).slice(0, RAIL_SIZE);
  }, [filteredPool, activeEdit]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerWrap}>
        <Text style={styles.title}>Discover</Text>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={COLORS.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search fragrances, notes, brands..."
            placeholderTextColor={COLORS.subtle}
            style={styles.searchInput}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color={COLORS.muted} />
            </Pressable>
          )}
        </View>
        {/* Filter chip row */}
        <View style={styles.filterRow}>
          <Pressable style={[styles.filterBtn, filtersActive(filters) && styles.filterBtnActive]} onPress={() => setFilterSheetOpen(true)}>
            <Ionicons name="funnel-outline" size={14} color={filtersActive(filters) ? COLORS.white : COLORS.muted} />
            <Text style={[styles.filterBtnText, filtersActive(filters) && styles.filterBtnTextActive]}>
              {filtersActive(filters) ? 'Filtered' : 'Filter'}
            </Text>
          </Pressable>
          {filtersActive(filters) && (
            <Pressable onPress={() => setFilters(EMPTY_FILTERS)}>
              <Text style={styles.clearFiltersText}>Clear</Text>
            </Pressable>
          )}
        </View>
      </View>

      {query.length > 0 ? (
        <SearchResults results={searchResults} query={query} fragranceHref={fragranceHref} />
      ) : (
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          {/* SOTD feed entry point */}
          <Pressable style={styles.feedBanner} onPress={() => router.push('/feed' as any)}>
            <Ionicons name="globe-outline" size={18} color={COLORS.accent} />
            <Text style={styles.feedBannerText}>Scent of the Day Feed</Text>
            <Ionicons name="chevron-forward" size={16} color={COLORS.muted} />
          </Pressable>

          {filtersActive(filters) && filteredPool.length === 0 && (
            <EmptyState
              icon="funnel-outline"
              title="No matches"
              subtitle="No fragrances match your filters. Try loosening them."
              actionLabel="Clear Filters"
              onAction={() => setFilters(EMPTY_FILTERS)}
            />
          )}

          <Section eyebrow="CURATED EDITS" cursive="for every mood">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.editPillRow}
            >
              {CURATED_EDITS_META.map((e) => (
                <Pressable key={e.id} onPress={() => setActiveEdit(e.id)}>
                  <View style={[styles.editPill, activeEdit === e.id && styles.editPillActive]}>
                    <Text style={[styles.editPillText, activeEdit === e.id && styles.editPillTextActive]}>
                      {e.label}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
              {editFragrances.map((f) => (
                <FragranceCard key={f.id} fragrance={f} variant="compact" onPress={() => router.push(fragranceHref(f.id) as any)} />
              ))}
            </ScrollView>
          </Section>

          {/* Celebrity Picks — fragrances worn by famous people */}
          {celebrityPicks.length > 0 && (
            <Section eyebrow="CELEBRITY PICKS" cursive="famous fans">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
                {celebrityPicks.map((f) => (
                  <FragranceCard key={f.id} fragrance={f} variant="compact" onPress={() => router.push(fragranceHref(f.id) as any)} />
                ))}
              </ScrollView>
            </Section>
          )}

          <Section eyebrow="BY HOUSE" cursive="explore brands">
            <View style={styles.brandGrid}>
              {topBrands.map(([brand, count]) => (
                <Pressable
                  key={brand}
                  style={styles.brandTile}
                  onPress={() => router.push(`/brand/${encodeURIComponent(brand)}` as any)}
                >
                  <Text style={styles.brandTileLabel} numberOfLines={2}>{brand}</Text>
                  <Text style={styles.brandTileCount}>{count}</Text>
                </Pressable>
              ))}
            </View>
          </Section>

          <Section eyebrow="BY ACCORD" cursive="follow your nose">
            <View style={styles.accordGrid}>
              {DISCOVER_ACCORDS.map((a) => {
                const matching = filteredPool.filter((f) => f.top_accords.includes(a));
                return (
                  <Pressable
                    key={a}
                    style={({ pressed }) => [styles.accordTile, pressed && { opacity: 0.7 }]}
                    onPress={() => setQuery(a)}
                  >
                    <Text style={styles.accordTileLabel}>{a}</Text>
                    <Text style={styles.accordTileCount}>{matching.length}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Section>

          {/* Collaborative filtering recs */}
          {collabRecs.length > 0 && (
            <Section eyebrow="RECOMMENDED FOR YOU" cursive="taste-matched">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
                {collabRecs.map((f) => (
                  <FragranceCard key={f.id} fragrance={f} variant="compact" onPress={() => router.push(fragranceHref(f.id) as any)} />
                ))}
              </ScrollView>
            </Section>
          )}

          {/* Scent twins */}
          {scentTwins.length > 0 && (
            <Section eyebrow="YOUR SCENT TWINS" cursive="kindred noses">
              <View style={styles.twinsGrid}>
                {scentTwins.slice(0, 6).map((t) => (
                  <Pressable
                    key={t.twin_user_id}
                    style={styles.twinCard}
                    onPress={() => router.push(`/user/${t.twin_user_id}` as any)}
                  >
                    <View style={styles.twinAvatar}>
                      <Text style={styles.twinAvatarLetter}>
                        {(t.display_name?.[0] ?? '?').toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.twinName} numberOfLines={1}>{t.display_name || 'Perfume Lover'}</Text>
                    <Text style={styles.twinOverlap}>{t.overlap_count} shared</Text>
                  </Pressable>
                ))}
              </View>
            </Section>
          )}

          <View style={{ height: SPACING.xxl }} />
        </ScrollView>
      )}
      <DiscoverFilterSheet
        visible={filterSheetOpen}
        filters={filters}
        onApply={setFilters}
        onClose={() => setFilterSheetOpen(false)}
      />
    </SafeAreaView>
  );
}

const SEARCH_PAGE_SIZE = 20;

function SearchResults({ results, query, fragranceHref }: { results: Fragrance[]; query: string; fragranceHref: (id: string) => string }) {
  const router = useRouter();
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? results : results.slice(0, SEARCH_PAGE_SIZE);
  const hiddenCount = results.length - SEARCH_PAGE_SIZE;

  // Reset show-all when query changes so stale expanded state doesn't carry over.
  useEffect(() => { setShowAll(false); }, [query]);

  if (results.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No matches for "{query}"</Text>
        <Text style={styles.emptyHint}>Try a brand, note, or accord — or take the quiz.</Text>
      </View>
    );
  }
  return (
    <FlatList
      data={visible}
      keyExtractor={(f) => f.id}
      renderItem={({ item }) => (
        <View style={{ paddingHorizontal: SPACING.lg, marginBottom: SPACING.md }}>
          <FragranceCard fragrance={item} variant="compact" onPress={() => router.push(fragranceHref(item.id) as any)} />
        </View>
      )}
      contentContainerStyle={{ paddingTop: SPACING.md, paddingBottom: SPACING.xxl }}
      ListFooterComponent={
        !showAll && hiddenCount > 0 ? (
          <Pressable style={styles.showMoreRow} onPress={() => setShowAll(true)}>
            <Text style={styles.showMoreText}>Showing top {SEARCH_PAGE_SIZE} of {results.length} results</Text>
            <Text style={styles.showMoreCta}>Show all →</Text>
          </Pressable>
        ) : results.length > SEARCH_PAGE_SIZE ? (
          <Text style={styles.showMoreText}>
            Showing all {results.length} results
          </Text>
        ) : null
      }
    />
  );
}

function Section({ eyebrow, cursive, children }: { eyebrow: string; cursive?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
        {cursive && <Text style={styles.sectionCursive}>{cursive}</Text>}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  headerWrap: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.sm },
  title: { ...TYPE.displayLarge, marginBottom: SPACING.md },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
  },
  searchInput: { ...TYPE.body, flex: 1, padding: 0 },
  container: { paddingBottom: SPACING.xxl },
  section: { paddingLeft: SPACING.lg, marginTop: SPACING.xl },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: SPACING.md, paddingRight: SPACING.lg },
  sectionEyebrow: { ...TYPE.eyebrow },
  sectionCursive: { fontFamily: 'PinyonScript_400Regular', fontSize: 22, color: COLORS.accent, lineHeight: 34, paddingLeft: 6 },
  hScroll: { paddingRight: SPACING.lg },
  filterRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm,
  },
  filterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: RADIUS.full,
    borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  filterBtnActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  filterBtnText: { ...TYPE.label, fontSize: 12, color: COLORS.muted },
  filterBtnTextActive: { color: COLORS.white },
  clearFiltersText: { ...TYPE.label, fontSize: 12, color: COLORS.accent },
  twinsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, paddingRight: SPACING.lg },
  twinCard: {
    width: '30%', alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
    paddingVertical: SPACING.md, paddingHorizontal: SPACING.sm,
  },
  twinAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.blushSoft,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  twinAvatarLetter: { fontFamily: FONTS.serif, fontSize: 20, color: COLORS.accent },
  twinName: { ...TYPE.label, fontSize: 11, color: COLORS.text, textAlign: 'center' },
  twinOverlap: { ...TYPE.caption, fontSize: 9, marginTop: 2, color: COLORS.accent },
  feedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    marginHorizontal: SPACING.lg, marginTop: SPACING.md, marginBottom: SPACING.sm,
    padding: SPACING.md,
    backgroundColor: COLORS.card, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
  },
  feedBannerText: { ...TYPE.label, fontSize: 13, color: COLORS.text, flex: 1 },

  editPillRow: { paddingRight: SPACING.lg, paddingBottom: SPACING.md, gap: 8 },
  editPill: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: RADIUS.full,
    borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    marginRight: 8,
  },
  editPillActive: { backgroundColor: COLORS.text, borderColor: COLORS.text },
  editPillText: { ...TYPE.label, color: COLORS.muted, fontSize: 13 },
  editPillTextActive: { color: COLORS.bg },

  brandGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: SPACING.sm,
    paddingRight: SPACING.lg,
  },
  brandTile: {
    width: '47%',
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
    minHeight: 80,
  },
  brandTileLabel: { fontFamily: FONTS.serif, fontSize: 16, fontWeight: '600', color: COLORS.text, textAlign: 'center' },
  brandTileCount: { ...TYPE.caption, color: COLORS.muted, marginTop: 4, textAlign: 'center' },

  accordGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, paddingRight: SPACING.lg },
  accordTile: {
    width: '23%',
    aspectRatio: 1,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  accordTileLabel: { fontFamily: FONTS.serif, fontSize: 13, fontWeight: '600', color: COLORS.text, textAlign: 'center' },
  accordTileCount: { ...TYPE.caption, color: COLORS.accent, marginTop: 4, fontSize: 11 },

  empty: { padding: SPACING.xl, alignItems: 'center', gap: SPACING.sm },
  emptyText: { ...TYPE.heading, textAlign: 'center' },
  emptyHint: { ...TYPE.bodySmall, textAlign: 'center', fontStyle: 'italic' },
  showMoreRow: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    gap: SPACING.xs,
  },
  showMoreText: { ...TYPE.caption, color: COLORS.muted, textAlign: 'center' },
  showMoreCta: { ...TYPE.label, color: COLORS.accent, fontSize: 13, letterSpacing: 0.5 },
});
