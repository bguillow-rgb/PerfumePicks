import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, FONTS, RADIUS } from '@/src/constants/theme';
import { useCatalogStore, NO_GENDER_FILTER } from '@/src/stores/useCatalogStore';
import type { PickerCandidate } from '@/src/features/quiz/pickerGrid';
import {
  SEARCH_RESULT_LIMIT,
  SEARCH_DEBOUNCE_MS,
  isSearchResultComplete,
} from '@/src/features/dna/pickerSearch';
import { requestCatalogAddition } from '@/src/features/dna/catalogRequests';
import { track, EVENTS } from '@/src/lib/observability';

/** Where a tapped result tile sits on screen — the docking flight's origin. */
export interface ResultOrigin {
  x: number;
  y: number;
}

interface Props {
  /** Search expanded state — controlled by the screen so back can collapse it. */
  open: boolean;
  onOpen: () => void;
  /** Collapse: clears the query + shelf, keeps every pick. */
  onClose: () => void;
  /** Tap on a COMPLETE result — screen runs the pick/dock/dupe/cap logic. */
  onPick: (f: PickerCandidate, origin: ResultOrigin | null) => void;
  /** Tap on a gated ("Details coming soon") result — enqueue enrich-on-demand. */
  onEnrichRequest: (f: PickerCandidate) => void;
}

/**
 * Picker search — entry affordance + in-place field + horizontal result shelf
 * (FEATURE_PICKER_SEARCH.md). Lives between the picker header and the grid; the
 * grid stays visible above/below. No modal, no navigation, no tray.
 */
export function PickerSearch({ open, onOpen, onClose, onPick, onEnrichRequest }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PickerCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  /** True once a debounced search for the CURRENT query has resolved. */
  const [settled, setSettled] = useState(false);
  /** The query string the user has tapped "Request it" on (shows the receipt). */
  const [requested, setRequested] = useState<string | null>(null);
  const requestSeq = useRef(0);
  const inputRef = useRef<TextInput>(null);

  // Collapse resets the ephemeral view state — un-picked results never persist.
  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setSearching(false);
      setSettled(false);
      setRequested(null);
    }
  }, [open]);

  // Debounced catalog search: name+brand ilike over is_active (useCatalogStore
  // .search), short shelf (limit 12). A new query replaces the shelf wholesale.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    setRequested(null); // a new/changed query clears any prior "Requested" receipt
    if (!q) {
      setResults([]);
      setSearching(false);
      setSettled(false);
      return;
    }
    setSearching(true);
    setSettled(false);
    const seq = ++requestSeq.current;
    const timer = setTimeout(async () => {
      // NO_GENDER_FILTER: the grid above is browsing (filtered by the audience
      // preference), but this is the user naming a bottle they ALREADY OWN to
      // seed their DNA. Someone whose preference is Men's may still own a
      // feminine bottle, and telling them it does not exist is the same failure
      // as the scan lookup — a false "not in our catalog" for a bottle in hand.
      const found = (await useCatalogStore
        .getState()
        .search(q, SEARCH_RESULT_LIMIT, NO_GENDER_FILTER)) as unknown as PickerCandidate[];
      if (seq !== requestSeq.current) return; // stale — a newer query replaced us
      setResults(found);
      setSearching(false);
      setSettled(true);
      if (found.length === 0) {
        track(EVENTS.SEARCH_NO_RESULTS, {
          query: q.slice(0, 60),
          query_length: q.length,
          surface: 'dna_picker',
        });
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [open, query]);

  if (!open) {
    // Entry affordance: one muted line beneath the count sub-copy, above the
    // grid. Ownership framing — search reads optional by construction.
    return (
      <Pressable
        onPress={onOpen}
        style={styles.affordance}
        hitSlop={6}
        testID="dna-search-affordance"
        accessibilityLabel="Search for a bottle you own"
      >
        <Ionicons name="search-outline" size={16} color={COLORS.muted} />
        <Text style={styles.affordanceText} numberOfLines={1}>
          Own a bottle you don’t see?{' '}
          <Text style={styles.affordanceLink}>Search for it.</Text>
        </Text>
      </Pressable>
    );
  }

  const q = query.trim();
  const showHint = q.length === 0;
  const showNoResults = q.length > 0 && settled && results.length === 0;
  const showShelf = q.length > 0 && results.length > 0;

  return (
    <View style={styles.wrap} testID="dna-search-open">
      <View style={styles.fieldRow}>
        <Ionicons name="search-outline" size={16} color={COLORS.muted} />
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Search by brand or bottle"
          placeholderTextColor={COLORS.subtle}
          autoFocus
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="done"
          // Keyboard dismiss (Done) collapses the field, keeps all picks.
          onSubmitEditing={onClose}
          testID="dna-search-input"
        />
        {searching && <ActivityIndicator size="small" color={COLORS.muted} />}
        <Pressable
          onPress={onClose}
          hitSlop={10}
          testID="dna-search-close"
          accessibilityLabel="Close search"
        >
          <Ionicons name="close" size={18} color={COLORS.muted} />
        </Pressable>
      </View>

      {showHint && (
        <Text style={styles.hint} testID="dna-search-hint">
          Type a brand or bottle — like Baccarat Rouge 540
        </Text>
      )}

      {showNoResults && (
        <View testID="dna-search-no-results">
          <Text style={styles.hint}>
            No match for “{q}”. Check the spelling — or it may not be in our catalog yet.
          </Text>
          {requested === q ? (
            <View style={styles.requestedRow} testID="dna-search-requested">
              <Ionicons name="checkmark-circle" size={15} color={COLORS.accent} />
              <Text style={styles.requestedText}>Requested — we’ll look at adding it.</Text>
            </View>
          ) : (
            <Pressable
              onPress={() => {
                setRequested(q);
                track(EVENTS.SEARCH_REQUEST_SUBMITTED, { query: q.slice(0, 60), surface: 'dna_picker' });
                void requestCatalogAddition(q, 'dna_picker');
              }}
              hitSlop={8}
              style={styles.requestBtn}
              testID="dna-search-request"
              accessibilityLabel={`Request ${q} be added to the catalog`}
            >
              <Ionicons name="add-circle-outline" size={15} color={COLORS.accent} />
              <Text style={styles.requestBtnText}>Request “{q}”</Text>
            </Pressable>
          )}
        </View>
      )}

      {showShelf && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          contentContainerStyle={styles.shelf}
          testID="dna-search-shelf"
        >
          {results.map((f) => {
            const complete = isSearchResultComplete(f);
            return (
              <Pressable
                key={f.id}
                style={[styles.result, !complete && styles.resultGated]}
                onPress={(e) => {
                  // Touch point = the docking flight's origin. Defensive: the
                  // event payload is absent under test renderers.
                  const pageX = e?.nativeEvent?.pageX;
                  const pageY = e?.nativeEvent?.pageY;
                  if (complete) {
                    onPick(
                      f,
                      Number.isFinite(pageX) && Number.isFinite(pageY)
                        ? { x: pageX as number, y: pageY as number }
                        : null,
                    );
                  } else {
                    onEnrichRequest(f);
                  }
                }}
                testID={complete ? 'dna-search-result' : 'dna-search-result-gated'}
                accessibilityLabel={`${f.brand} ${f.name}${complete ? '' : ', details coming soon'}`}
              >
                <Image source={{ uri: f.image_url }} style={styles.resultImg} contentFit="cover" />
                <Text style={styles.resultBrand} numberOfLines={1}>{f.brand}</Text>
                <Text style={styles.resultName} numberOfLines={1}>{f.name}</Text>
                {!complete && (
                  <Text style={styles.resultGatedLabel} numberOfLines={1}>
                    Details coming soon
                  </Text>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Entry affordance row (closed state).
  affordance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  affordanceText: { ...TYPE.bodySmall, color: COLORS.muted, flexShrink: 1 },
  affordanceLink: { color: COLORS.accent, textDecorationLine: 'underline' },

  // Expanded (in-place) state.
  wrap: { marginTop: 8 },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  input: {
    flex: 1,
    ...TYPE.bodySmall,
    color: COLORS.text,
    padding: 0,
  },
  hint: { ...TYPE.caption, color: COLORS.muted, marginTop: 6, lineHeight: 16 },

  // No-catalog-match → "Request it" affordance (Phase 3 demand loop).
  requestBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  requestBtnText: { ...TYPE.bodySmall, color: COLORS.accent, fontWeight: '600' },
  requestedRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  requestedText: { ...TYPE.caption, color: COLORS.muted },

  // Result shelf — short, horizontal, visually LIGHTER than grid tiles (the
  // gold ring on docked tiles is the point; results never compete with it).
  shelf: {
    gap: SPACING.sm,
    paddingTop: SPACING.sm,
    paddingBottom: 2,
  },
  result: {
    width: 92,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 5,
  },
  resultGated: { opacity: 0.45 },
  resultImg: {
    width: '100%',
    aspectRatio: 0.82,
    borderRadius: 4,
    backgroundColor: COLORS.blushSoft,
  },
  resultBrand: { ...TYPE.caption, fontSize: 10, marginTop: 4, color: COLORS.muted },
  resultName: { fontFamily: FONTS.serif, fontSize: 12, fontWeight: '600', color: COLORS.text },
  resultGatedLabel: { ...TYPE.caption, fontSize: 9, color: COLORS.subtle, marginTop: 2 },
});
