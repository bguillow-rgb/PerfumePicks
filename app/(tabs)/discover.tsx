import { useState, useMemo, useEffect } from 'react';
import { ScrollView, View, Text, StyleSheet, TextInput, Pressable, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, RADIUS, FONTS } from '@/src/constants/theme';
import { DISCOVER_ACCORDS } from '@/src/constants/accords';
import { FragranceCard } from '@/src/components/fragrance/FragranceCard';
import {
  MOCK_CATALOG, ALL_BRANDS, CURATED_EDITS, getFragrances, type MockFragrance,
} from '@/src/mock/fragrances';
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

  // When navigated here from the wardrobe "+" button, pass context through so
  // the fragrance detail page can navigate back to wardrobe after adding.
  const fragranceHref = (id: string) =>
    from === 'wardrobe' ? `/fragrance/${id}?from=wardrobe` : `/fragrance/${id}`;

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    // IDs matched by private notes text (body, social notes, layering combos)
    const notesMatchIds = new Set(notesSearch(q).map((n) => n.fragrance_id));
    return MOCK_CATALOG.filter((f) =>
      f.name.toLowerCase().includes(q) ||
      f.brand.toLowerCase().includes(q) ||
      f.top_accords.some((a) => a.includes(q)) ||
      f.top_notes.some((n) => n.toLowerCase().includes(q)) ||
      f.heart_notes.some((n) => n.toLowerCase().includes(q)) ||
      f.base_notes.some((n) => n.toLowerCase().includes(q)) ||
      notesMatchIds.has(f.id),
    );
  }, [query, notesSearch]);

  const activeEditSet = CURATED_EDITS.find((e) => e.id === activeEdit) ?? CURATED_EDITS[0];
  const editFragrances = getFragrances(activeEditSet.ids);

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
                const count = MOCK_CATALOG.filter((f) => f.brand === b).length;
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
                const matching = MOCK_CATALOG.filter((f) => f.top_accords.includes(a));
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

function SearchResults({ results, query, fragranceHref }: { results: MockFragrance[]; query: string; fragranceHref: (id: string) => string }) {
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
  sectionCursive: { fontFamily: 'PinyonScript_400Regular', fontSize: 22, color: COLORS.accent, lineHeight: 34 },
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
