// Edit Cigars — picker. Search + tap to jump into the edit form at
// /admin/edit-cigar/[id]. Uses the same query shape as Browse so
// admins get a familiar surface.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Card } from '@/src/components/ui/Card';
import { AdminOnly } from '@/src/features/admin/AdminOnly';
import { COLORS, RADIUS, SPACING } from '@/src/constants/theme';
import type { Cigar } from '@/src/types/cigar';

export default function EditCigarPickerScreen() {
  return (
    <AdminOnly>
      <Picker />
    </AdminOnly>
  );
}

function Picker() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Cigar[]>([]);
  const [loading, setLoading] = useState(false);

  // Debounced search mirroring the Browse tab's pattern. 300ms delay
  // collapses rapid keystrokes into a single query.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const { data } = await supabase
        .from('cigars')
        .select('*')
        .or(
          `brand.ilike.${q}%,` +
            `name.ilike.%${q}%,` +
            `line.ilike.%${q}%,` +
            `vitola.ilike.%${q}%`,
        )
        .order('brand')
        .limit(50);
      setResults((data as Cigar[]) ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => runSearch(query), 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, runSearch]);

  return (
    <View style={styles.screen}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search by brand, line, or vitola"
        placeholderTextColor={COLORS.subtle}
        style={styles.input}
        autoCorrect={false}
      />
      {loading ? (
        <ActivityIndicator color={COLORS.accent} style={{ marginTop: SPACING.lg }} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {query.trim()
                ? 'No matches. Try a different term.'
                : 'Start typing to find a cigar to edit.'}
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/admin/edit-cigar/${item.id}` as never)}
            >
              <Card style={styles.row}>
                <Text style={styles.title}>
                  {item.line ?? item.name}
                </Text>
                <Text style={styles.sub}>
                  {item.brand} · {item.vitola ?? '—'} · {item.origin ?? '—'}
                </Text>
              </Card>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
    padding: SPACING.md,
  },
  input: {
    fontFamily: 'Cormorant',
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  list: {
    gap: SPACING.sm,
    paddingBottom: SPACING.xxl,
  },
  row: {
    padding: SPACING.md,
  },
  title: {
    fontFamily: 'Cormorant',
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  sub: {
    fontFamily: 'Cormorant',
    fontSize: 13,
    color: COLORS.muted,
    marginTop: 2,
  },
  empty: {
    fontFamily: 'Cormorant',
    color: COLORS.muted,
    textAlign: 'center',
    padding: SPACING.lg,
  },
});
