import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Card } from '@/src/components/ui/Card';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { COLORS, SPACING } from '@/src/constants/theme';
import { StarRating } from '@/src/components/ui/StarRating';
import type { JournalEntry } from '@/src/types/cigar';

export default function JournalScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const listRef = useRef<FlatList>(null);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('journal_entries')
        .select('*, cigar:cigars(*)')
        .order('smoked_at', { ascending: false })
        .limit(50);
      setEntries((data as JournalEntry[]) ?? []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchEntries();
    }, [fetchEntries])
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + SPACING.sm }]}>
      <Text style={styles.title}>Smoking Journal</Text>

      <FlatList
        ref={listRef}
        data={entries}
        keyExtractor={(e) => e.id}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={true}
        indicatorStyle="white"
        bounces={true}
        alwaysBounceVertical={true}
        onContentSizeChange={() => listRef.current?.flashScrollIndicators()}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80, flexGrow: 1 }}
        ListEmptyComponent={
          <EmptyState
            title="No smokes logged yet"
            subtitle="After you smoke a cigar, log it here with a rating and tasting notes."
            actionLabel="Browse Cigars"
            onAction={() => router.push('/(tabs)/browse')}
          />
        }
        renderItem={({ item }) => (
          <Card
            style={styles.entryCard}
            onPress={() => item.cigar_id && router.push(`/(tabs)/cigar/${item.cigar_id}`)}
          >
            <View style={styles.entryHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.entryName}>{item.cigar?.line ?? item.cigar?.name ?? 'Unknown Cigar'}</Text>
                <Text style={styles.entryBrand}>{item.cigar?.brand ?? ''}</Text>
              </View>
              <StarRating value={item.rating} size={14} />
            </View>
            {item.notes ? (
              <Text style={styles.entryNotes} numberOfLines={2}>{item.notes}</Text>
            ) : null}
            <Text style={styles.entryDate}>
              {new Date(item.smoked_at).toLocaleDateString()}
            </Text>
          </Card>
        )}
      />
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
    marginBottom: SPACING.md,
  },
  entryCard: {
    marginBottom: SPACING.sm,
  },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  entryName: {
    fontFamily: 'Cormorant',
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  entryBrand: {
    fontFamily: 'Cormorant',
    fontSize: 13,
    color: COLORS.muted,
    marginTop: 2,
  },
  entryNotes: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    color: COLORS.muted,
    marginTop: 8,
    lineHeight: 20,
  },
  entryDate: {
    fontFamily: 'Cormorant',
    fontSize: 12,
    color: COLORS.subtle,
    marginTop: 8,
  },
});
