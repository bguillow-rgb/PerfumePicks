import { useState, useMemo, useEffect } from 'react';
import { ScrollView, View, Text, StyleSheet, TextInput, Pressable, FlatList, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, RADIUS, FONTS } from '@/src/constants/theme';
import { DISCOVER_ACCORDS } from '@/src/constants/accords';
import { interpretMood, rankByMood, MOOD_SUGGESTIONS } from '@/src/constants/moodLexicon';
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

/** Cap celebrity names to 2 + "& N more" to prevent subtitle overflow. */
function capNames(names: string[]): string {
  if (names.length <= 2) return names.join(', ');
  return `${names[0]}, ${names[1]} & ${names.length - 2} more`;
}

/**
 * Recognizable houses to pin to the front of the "By House" grid, in display
 * order. Without this, brands are ranked by raw SKU count — which lets a niche
 * house that dumped hundreds of variants (e.g. Sucreabeille ~700) bury marquee
 * designer houses like Chanel (~74) and Dior (~42). "By House" is an editorial
 * surface, so we pin known houses first and backfill the rest by count.
 * Matched case-insensitively against the pool's canonical brand names
 * (already normalized via scripts/data/brand-aliases.json at ETL time); any
 * name not present in the pool is simply skipped.
 */
const MARQUEE_HOUSES = [
  'Chanel', 'Dior', 'Tom Ford', 'Creed', 'Yves Saint Laurent', 'Versace',
  'Giorgio Armani', 'Gucci', 'Maison Francis Kurkdjian', 'Parfums de Marly',
  'Jean Paul Gaultier', 'Paco Rabanne', 'Dolce & Gabbana', 'Givenchy',
  'Guerlain', 'Hermès', 'Prada', 'Valentino', 'Carolina Herrera', 'Xerjoff',
  'Mugler', 'Viktor & Rolf', 'Burberry', 'Calvin Klein', 'Marc Jacobs',
  'Azzaro', 'Bvlgari', 'Lancôme', 'Lattafa',
];

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

  // Catalog store selectors — declared up front so the effects below (celebrity
  // picks, collab recs) can reference them without a use-before-declaration TDZ.
  const fetchEnriched = useCatalogStore((s) => s.fetchEnriched);
  const fetchMany = useCatalogStore((s) => s.fetchMany);
  const searchStore = useCatalogStore((s) => s.search);

  // Celebrity Picks — fragrances worn by famous people, with celeb names.
  const [celebrityPicks, setCelebrityPicks] = useState<{ fragrance: Fragrance; celebrities: string }[]>([]);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    (async () => {
      const { data } = await supabase
        .from('fragrance_celebrities')
        .select('fragrance_id, celebrity_name')
        .eq('verified', true)
        .limit(100);
      if (!data?.length) return;
      // Group celebrity names by fragrance
      const namesByFrag = new Map<string, string[]>();
      for (const r of data as any[]) {
        const names = namesByFrag.get(r.fragrance_id) ?? [];
        names.push(r.celebrity_name);
        namesByFrag.set(r.fragrance_id, names);
      }
      const ids = [...namesByFrag.keys()];
      const frags = await fetchMany(ids);
      setCelebrityPicks(
        frags.slice(0, RAIL_SIZE).map((f) => ({
          fragrance: f,
          celebrities: capNames(namesByFrag.get(f.id) ?? []),
        })),
      );
    })();
  }, [fetchMany]);

  // Pull the active catalog pool once so the "By House" + "By Accord"
  // counts and the curated-edit fallback have real data behind them.
  const [pool, setPool] = useState<Fragrance[]>([]);
  const [poolLoading, setPoolLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    // Use fetchEnriched so all pool frags have real accord/score data —
    // curated edits and accord filters need populated top_accords to work.
    fetchEnriched(8000, 0, ['feminine', 'unisex']).then((rows) => {
      if (!cancelled) { setPool(rows); setPoolLoading(false); }
    });
    return () => { cancelled = true; };
  }, [fetchEnriched]);

  // When navigated here from the wardrobe "+" button, pass context through so
  // the fragrance detail page can navigate back to wardrobe after adding.
  const fragranceHref = (id: string) =>
    from === 'wardrobe' ? `/fragrance/${id}?from=wardrobe` : `/fragrance/${id}`;

  // Mood/vibe interpretation of the query (PRD §7.2). Non-null only when the
  // query carries vibe words; drives the mood-ranked branch + banner below.
  const mood = useMemo(() => interpretMood(query), [query]);

  // Debounced async search against Supabase; falls back to MOCK_CATALOG
  // in demo mode via the store's search() method.
  const [searchResults, setSearchResults] = useState<Fragrance[]>([]);
  // `searching` is true from the moment query is set until results arrive.
  // We pass null to SearchResults during this window to suppress "No matches".
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    const q = query.trim();
    if (!q) { setSearchResults([]); setSearching(false); return; }
    // Mood branch: rank the already-loaded enriched pool by accord/score match
    // instead of a literal keyword lookup. Falls through to literal search if
    // the pool isn't ready yet.
    if (mood && pool.length > 0) {
      setSearchResults(rankByMood(pool, mood, 200));
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const t = setTimeout(() => {
      searchStore(q, 200, ['feminine', 'unisex']).then((rows) => {
        if (cancelled) return;
        // Augment with private-note matches: any of our owned fragrances
        // whose notes text contains the query also surface.
        const notesMatchIds = notesSearch(q.toLowerCase()).map((n) => n.fragrance_id);
        if (notesMatchIds.length === 0) { setSearchResults(rows); setSearching(false); return; }
        // Fetch any note-matches that aren't already in the results.
        const have = new Set(rows.map((r) => r.id));
        const missing = notesMatchIds.filter((id) => !have.has(id));
        if (missing.length === 0) { setSearchResults(rows); setSearching(false); return; }
        fetchMany(missing).then((extra) => {
          if (!cancelled) { setSearchResults([...rows, ...extra]); setSearching(false); }
        });
      });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, mood, pool, notesSearch, searchStore, fetchMany]);

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
    const images = new Map<string, string>();
    for (const f of filteredPool) {
      counts.set(f.brand, (counts.get(f.brand) ?? 0) + 1);
      if (!images.has(f.brand) && f.image_url) images.set(f.brand, f.image_url);
    }
    const toEntry = (brand: string) => ({
      brand,
      count: counts.get(brand) ?? 0,
      imageUrl: images.get(brand) ?? null,
    });
    // Pin recognizable houses first (in MARQUEE_HOUSES order), matched
    // case-insensitively to the pool's canonical brand names, so a niche house
    // with hundreds of SKUs can't bury Chanel/Dior. Backfill the rest by count.
    const byLower = new Map<string, string>();
    for (const b of counts.keys()) byLower.set(b.toLowerCase(), b);
    const pinned: string[] = [];
    const pinnedSet = new Set<string>();
    for (const name of MARQUEE_HOUSES) {
      const actual = byLower.get(name.toLowerCase());
      if (actual && !pinnedSet.has(actual)) { pinned.push(actual); pinnedSet.add(actual); }
    }
    const backfill = [...counts.keys()]
      .filter((b) => !pinnedSet.has(b))
      .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
    return [...pinned, ...backfill].slice(0, 20).map(toEntry);
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
        {/* Search + inline filter button */}
        <View style={styles.searchRow}>
          <View style={[styles.searchBar, styles.searchBarFlex]}>
            <Ionicons name="search-outline" size={18} color={COLORS.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search notes, brands, or a vibe…"
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
          <Pressable style={[styles.filterBtn, filtersActive(filters) && styles.filterBtnActive]} onPress={() => setFilterSheetOpen(true)} accessibilityLabel={filtersActive(filters) ? 'Filtered' : 'Filter'}>
            <Ionicons name="funnel-outline" size={16} color={filtersActive(filters) ? COLORS.white : COLORS.muted} />
            <Text style={[styles.filterBtnText, filtersActive(filters) && styles.filterBtnTextActive]}>
              {filtersActive(filters) ? 'Filtered' : 'Filter'}
            </Text>
          </Pressable>
        </View>
        {filtersActive(filters) && (
          <Pressable style={styles.clearFiltersBtn} onPress={() => setFilters(EMPTY_FILTERS)}>
            <Text style={styles.clearFiltersText}>Clear filters</Text>
          </Pressable>
        )}
        {query.length === 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.vibeRow}
          >
            {MOOD_SUGGESTIONS.map((v) => (
              <Pressable key={v} style={styles.vibeChip} onPress={() => setQuery(v)}>
                <Ionicons name="sparkles-outline" size={12} color={COLORS.accent} />
                <Text style={styles.vibeChipText}>{v}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>

      {query.length > 0 ? (
        <View style={styles.resultsWrap}>
          {mood && (
            <View style={styles.moodBanner}>
              <Ionicons name="sparkles-outline" size={14} color={COLORS.accent} />
              <Text style={styles.moodBannerText}>
                Showing <Text style={styles.moodBannerEmph}>{mood.labels.join(', ')}</Text> scents
              </Text>
            </View>
          )}
          <SearchResults results={searching ? null : searchResults} query={query} fragranceHref={fragranceHref} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          {filtersActive(filters) && filteredPool.length === 0 && (
            <EmptyState
              icon="funnel-outline"
              title="No matches"
              subtitle="No fragrances match your filters. Try loosening them."
              actionLabel="Clear Filters"
              onAction={() => setFilters(EMPTY_FILTERS)}
            />
          )}

          {/* Suppress all data-driven sections until pool is ready */}
          {poolLoading ? null : <>

          {/* Celebrity Picks — fragrances worn by famous people */}
          {celebrityPicks.length > 0 && (
            <Section eyebrow="CELEBRITY PICKS" cursive="famous fans">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
                {celebrityPicks.map(({ fragrance: f, celebrities }) => (
                  <FragranceCard key={f.id} fragrance={f} variant="compact" subtitle={celebrities} onPress={() => router.push(fragranceHref(f.id) as any)} />
                ))}
              </ScrollView>
            </Section>
          )}

          <Section eyebrow="BY HOUSE" cursive="explore brands">
            <View style={styles.brandGrid}>
              {topBrands.map(({ brand, count, imageUrl }) => (
                <Pressable
                  key={brand}
                  style={styles.brandTile}
                  onPress={() => router.push(`/brand/${encodeURIComponent(brand)}` as any)}
                  accessibilityLabel={brand}
                >
                  {imageUrl ? (
                    <Image source={{ uri: imageUrl }} style={styles.brandTileImage} resizeMode="cover" />
                  ) : null}
                  <View style={[styles.brandTileOverlay, !imageUrl && styles.brandTileOverlayPlain]} />
                  <Text style={[styles.brandTileLabel, imageUrl && styles.brandTileLabelOnImage]} numberOfLines={2}>{brand}</Text>
                  <Text style={[styles.brandTileCount, imageUrl && styles.brandTileCountOnImage]}>{count}</Text>
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

          {/* R17: Browse by Mood — Curated Edits demoted below search surfaces */}
          <Section eyebrow="BROWSE BY MOOD" cursive="curated edits">
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
          </>}
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

function SearchResults({ results, query, fragranceHref }: { results: Fragrance[] | null; query: string; fragranceHref: (id: string) => string }) {
  const router = useRouter();
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? (results ?? []) : (results ?? []).slice(0, SEARCH_PAGE_SIZE);
  const hiddenCount = (results?.length ?? 0) - SEARCH_PAGE_SIZE;

  // Reset show-all when query changes so stale expanded state doesn't carry over.
  useEffect(() => { setShowAll(false); }, [query]);

  // null = still searching (debounce window) — render nothing to avoid flash.
  if (results === null) return null;
  if (results.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No matches for "{query}"</Text>
        <Text style={styles.emptyHint}>Try a brand, note, or accord. Or take the quiz.</Text>
      </View>
    );
  }
  return (
    <FlatList
      data={visible}
      keyExtractor={(f) => f.id}
      renderItem={({ item }) => (
        <View style={{ paddingHorizontal: SPACING.lg, marginBottom: SPACING.md }}>
          <FragranceCard fragrance={item} variant="compact" fullWidth onPress={() => router.push(fragranceHref(item.id) as any)} />
        </View>
      )}
      contentContainerStyle={{ paddingTop: SPACING.md, paddingBottom: SPACING.xxl }}
      ListFooterComponent={
        !showAll && hiddenCount > 0 ? (
          <Pressable style={styles.showMoreRow} onPress={() => setShowAll(true)}>
            <Text style={styles.showMoreText}>Showing top {SEARCH_PAGE_SIZE} of {results?.length} results</Text>
            <Text style={styles.showMoreCta}>Show all →</Text>
          </Pressable>
        ) : (results?.length ?? 0) > SEARCH_PAGE_SIZE ? (
          <Text style={styles.showMoreText}>
            Showing all {results?.length} results
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
  searchRow: { flexDirection: 'row', alignItems: 'stretch', gap: SPACING.sm },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
  },
  searchBarFlex: { flex: 1 },
  searchInput: { ...TYPE.body, flex: 1, padding: 0 },
  container: { paddingBottom: SPACING.xxl },
  section: { paddingLeft: SPACING.lg, marginTop: SPACING.xl },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: SPACING.md, paddingRight: SPACING.lg },
  sectionEyebrow: { ...TYPE.eyebrow },
  sectionCursive: { fontFamily: 'PinyonScript_400Regular', fontSize: 22, color: COLORS.accent, lineHeight: 34, paddingLeft: 6 },
  hScroll: { paddingRight: SPACING.lg },
  filterBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  filterBtnActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  filterBtnText: { ...TYPE.label, fontSize: 13, color: COLORS.muted },
  filterBtnTextActive: { color: COLORS.white },
  clearFiltersBtn: { alignSelf: 'flex-start', paddingTop: SPACING.sm },
  clearFiltersText: { ...TYPE.label, fontSize: 12, color: COLORS.accent },
  vibeRow: { paddingTop: SPACING.sm, paddingRight: SPACING.lg, gap: 8 },
  vibeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: RADIUS.full,
    borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    marginRight: 8,
  },
  vibeChipText: { ...TYPE.label, fontSize: 12, color: COLORS.text },
  resultsWrap: { flex: 1 },
  moodBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginHorizontal: SPACING.lg, marginTop: SPACING.md,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    backgroundColor: COLORS.blushSoft, borderRadius: RADIUS.md,
  },
  moodBannerText: { ...TYPE.bodySmall, color: COLORS.muted, flex: 1 },
  moodBannerEmph: { color: COLORS.text, fontWeight: '700' },
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
    aspectRatio: 1,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    overflow: 'hidden',
    alignItems: 'center', justifyContent: 'flex-end',
    paddingBottom: SPACING.sm,
    paddingHorizontal: SPACING.sm,
  },
  brandTileImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%', height: '100%',
  },
  brandTileOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,6,2,0.68)',
  },
  brandTileOverlayPlain: {
    backgroundColor: 'transparent',
  },
  brandTileLabel: { fontFamily: FONTS.serif, fontSize: 15, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  brandTileLabelOnImage: {
    color: '#ffffff',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  brandTileCount: { ...TYPE.caption, color: COLORS.muted, marginTop: 2, textAlign: 'center' },
  brandTileCountOnImage: {
    color: 'rgba(255,255,255,0.9)',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

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
