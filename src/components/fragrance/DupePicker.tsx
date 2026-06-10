import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Image, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, RADIUS, FONTS } from '@/src/constants/theme';
import { useCatalogStore, type Fragrance, type DupeResult } from '@/src/stores/useCatalogStore';
import { useProStore } from '@/src/stores/useProStore';
import { useRouter } from 'expo-router';
import { DupeList } from './DupeList';

interface Props {
  /** Optional pre-selected original (e.g. Home module seeds it from a wishlist item). */
  initialOriginal?: Fragrance;
  placeholder?: string;
  /** Fires whenever the selected original changes (pick or clear), so a parent
   *  can keep surrounding copy in sync with what's actually selected. */
  onOriginalChange?: (f: Fragrance | undefined) => void;
}

/**
 * Dupe finder (PRD §7.1). Search/select any fragrance → see its ranked cheaper
 * dupes. Freemium: get_dupes() reveals the top FREE_DUPE_LIMIT closest dupes to
 * everyone (the proof the engine works), and a locked footer teases the rest
 * ("N more dupes — unlock with Pro"). The withheld rows never leave Postgres;
 * get_dupe_count gives us the total so we can show how many remain locked.
 * Consumed by the Discover hero and the Home module.
 */
export function DupePicker({ initialOriginal, placeholder = 'Less expensive options for…', onOriginalChange }: Props) {
  const router = useRouter();
  const search = useCatalogStore((s) => s.search);
  const fetchDupes = useCatalogStore((s) => s.fetchDupes);
  const fetchDupeCount = useCatalogStore((s) => s.fetchDupeCount);
  const isPro = useProStore((s) => s.isPro);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Fragrance[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Fragrance | undefined>(initialOriginal);
  const [dupes, setDupes] = useState<DupeResult[]>([]);
  const [dupeCount, setDupeCount] = useState(0);
  const [loadingDupes, setLoadingDupes] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced typeahead.
  useEffect(() => {
    if (selected) return; // results list hidden once a pick is made
    const q = query.trim();
    if (debounce.current) clearTimeout(debounce.current);
    if (q.length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    debounce.current = setTimeout(async () => {
      const rows = await search(q, 8);
      setResults(rows);
      setSearching(false);
    }, 250);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [query, selected, search]);

  const loadDupes = useCallback(async (original: Fragrance) => {
    setLoadingDupes(true);
    const [rows, count] = await Promise.all([
      fetchDupes(original.id),       // returns top-N for non-Pro, all for Pro (gated server-side)
      fetchDupeCount(original.id),
    ]);
    setDupes(rows);
    setDupeCount(count);
    setLoadingDupes(false);
  }, [fetchDupes, fetchDupeCount]);

  // Load whenever a selection is made (incl. the initialOriginal).
  useEffect(() => {
    if (selected) loadDupes(selected);
  }, [selected, loadDupes]);

  const pick = (f: Fragrance) => {
    setSelected(f);
    setResults([]);
    setQuery('');
    onOriginalChange?.(f);
  };

  const reset = () => {
    setSelected(undefined);
    setDupes([]);
    setDupeCount(0);
    onOriginalChange?.(undefined);
  };

  return (
    <View style={styles.wrap}>
      {/* Search field OR selected-original chip */}
      {selected ? (
        <View style={styles.selectedChip}>
          <Pressable
            style={styles.selectedTap}
            onPress={() => router.push(`/fragrance/${selected.id}`)}
            hitSlop={6}
          >
            <Image source={{ uri: selected.image_url }} style={styles.selectedImage} />
            <View style={styles.selectedText}>
              <Text style={styles.selectedBrand} numberOfLines={1}>{selected.brand.toUpperCase()}</Text>
              <Text style={styles.selectedName} numberOfLines={1}>{selected.name}</Text>
            </View>
          </Pressable>
          <Pressable onPress={reset} hitSlop={10} accessibilityLabel="Clear selection">
            <Ionicons name="close-circle" size={20} color={COLORS.subtle} />
          </Pressable>
        </View>
      ) : (
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={COLORS.subtle} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={placeholder}
            placeholderTextColor={COLORS.subtle}
            style={styles.input}
            autoCorrect={false}
            returnKeyType="search"
          />
          {searching && <ActivityIndicator size="small" color={COLORS.accent} />}
        </View>
      )}

      {/* Typeahead results */}
      {!selected && results.length > 0 && (
        <View style={styles.results}>
          {results.map((f) => (
            <Pressable key={f.id} style={styles.resultRow} onPress={() => pick(f)}>
              <Image source={{ uri: f.image_url }} style={styles.resultImage} />
              <View style={{ flex: 1 }}>
                <Text style={styles.resultBrand} numberOfLines={1}>{f.brand.toUpperCase()}</Text>
                <Text style={styles.resultName} numberOfLines={1}>{f.name}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={COLORS.subtle} />
            </Pressable>
          ))}
        </View>
      )}

      {/* Results for the selected original — top-N revealed, rest gated */}
      {selected && (
        <DupeList
          dupes={dupes}
          loading={loadingDupes}
          lockedCount={isPro ? 0 : Math.max(0, dupeCount - dupes.length)}
          onUnlock={() => router.push('/paywall')}
          emptyState={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No close dupes yet for {selected.name}.</Text>
              <Pressable onPress={() => router.push(`/fragrance/${selected.id}`)}>
                <Text style={styles.emptyCta}>See similar fragrances →</Text>
              </Pressable>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: SPACING.sm },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    height: 46,
  },
  input: { flex: 1, ...TYPE.body, fontSize: 15, paddingVertical: 0 },
  results: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  resultImage: { width: 40, height: 40, borderRadius: RADIUS.sm, backgroundColor: COLORS.card2 },
  resultBrand: { ...TYPE.eyebrow, fontSize: 9 },
  resultName: { fontFamily: FONTS.serif, fontSize: 15, fontWeight: '600', color: COLORS.text },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.card2,
    borderRadius: RADIUS.full,
    padding: 6,
    paddingRight: SPACING.md,
  },
  selectedTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  selectedImage: { width: 36, height: 36, borderRadius: RADIUS.full, backgroundColor: COLORS.card },
  selectedText: { flex: 1 },
  selectedBrand: { ...TYPE.eyebrow, fontSize: 9 },
  selectedName: { fontFamily: FONTS.serif, fontSize: 15, fontWeight: '600', color: COLORS.text },
  empty: { paddingVertical: SPACING.md, gap: 6, alignItems: 'center' },
  emptyText: { ...TYPE.bodySmall, textAlign: 'center' },
  emptyCta: { ...TYPE.label, color: COLORS.accent, fontSize: 13 },
});
