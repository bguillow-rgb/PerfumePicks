import { useState, useMemo, useEffect } from 'react';
import { ScrollView, View, Text, StyleSheet, TextInput, Pressable, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, RADIUS, FONTS } from '@/src/constants/theme';
import { DISCOVER_ACCORDS } from '@/src/constants/accords';
import { FragranceCard } from '@/src/components/fragrance/FragranceCard';
// CURATED_EDITS + ALL_BRANDS are static curation lists (constants), not
// catalog data — fine to keep importing them from the mock module since
// they don't reference fragrance objects at runtime.
import { ALL_BRANDS, CURATED_EDITS } from '@/src/mock/fragrances';
import {
  useCatalogStore,
  type Fragrance,
} from '@/src/stores/useCatalogStore';
import { useFragranceNotesStore } from '@/src/stores/useFragranceNotesStore';

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
  const [activeEdit, setActiveEdit] = useState(CURATED_EDITS[0].id);
  const notesSearch = useFragranceNotesStore((s) => s.search);

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

  const activeEditSet = CURATED_EDITS.find((e) => e.id === activeEdit) ?? CURATED_EDITS[0];
  // Curated edits reference fragrance ids; resolve via fetchMany so they
  // work against the live catalog (and demo mode via the store fallback).
  const [editFragrances, setEditFragrances] = useState<Fragrance[]>([]);
  useEffect(() => {
    if (!activeEditSet.ids?.length) { setEditFragrances([]); return; }
    let cancelled = false;
    fetchMany(activeEditSet.ids).then((rows) => {
      if (!cancelled) setEditFragrances(rows);
    });
    return () => { cancelled = true; };
  }, [activeEditSet.ids, fetchMany]);

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
      </View>

      {query.length > 0 ? (
        <SearchResults results={searchResults} query={query} fragranceHref={fragranceHref} />
      ) : (
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          <Section eyebrow="CURATED EDITS" cursive="for every mood">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.editPillRow}
            >
              {CURATED_EDITS.map((e) => (
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
                <FragranceCard key={f.id} fragrance={f} onPress={() => router.push(fragranceHref(f.id) as any)} />
              ))}
            </ScrollView>
          </Section>

          <Section eyebrow="BY HOUSE" cursive="explore brands">
            <View style={styles.brandGrid}>
              {ALL_BRANDS.map((b) => {
                const count = pool.filter((f) => f.brand === b).length;
                return (
                  <Pressable
                    key={b}
                    style={styles.brandTile}
                    onPress={() => router.push(`/brand/${encodeURIComponent(b)}` as any)}
                  >
                    <Text style={styles.brandTileLabel} numberOfLines={2}>{b}</Text>
                    <Text style={styles.brandTileCount}>{count}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Section>

          <Section eyebrow="BY ACCORD" cursive="follow your nose">
            <View style={styles.accordGrid}>
              {DISCOVER_ACCORDS.map((a) => {
                const matching = pool.filter((f) => f.top_accords.includes(a));
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

          <View style={{ height: SPACING.xxl }} />
        </ScrollView>
      )}
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
          <FragranceCard fragrance={item} onPress={() => router.push(fragranceHref(item.id) as any)} />
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
