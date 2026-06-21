import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, Image, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, RADIUS, FONTS } from '@/src/constants/theme';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { useSOTDFeed, type SOTDEntry } from '@/src/hooks/useSOTDFeed';

type FeedTab = 'today' | 'trending';

/**
 * SOTD Feed — anonymized community wear log entries.
 * Shows what the community is wearing, not who: no author attribution,
 * no free-text notes, no profile links. Today = all public wears.
 * Trending = ranked by reactions over the last 7 days.
 */
export default function FeedScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<FeedTab>('today');
  const { entries, loading, hasMore, loadMore, refresh } = useSOTDFeed();

  const visibleEntries = tab === 'trending'
    ? (() => {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const cutoff = weekAgo.toISOString().slice(0, 10);
        return [...entries]
          .filter((e) => e.worn_on >= cutoff)
          .sort((a, b) => (b.reaction_count ?? 0) - (a.reaction_count ?? 0));
      })()
    : entries;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={COLORS.text} />
        </Pressable>
        <Text style={styles.title}>Scent of the Day</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.tabRow}>
        <Pressable style={[styles.tabPill, tab === 'today' && styles.tabPillActive]} onPress={() => setTab('today')}>
          <Text style={[styles.tabText, tab === 'today' && styles.tabTextActive]}>Today</Text>
        </Pressable>
        <Pressable style={[styles.tabPill, tab === 'trending' && styles.tabPillActive]} onPress={() => setTab('trending')}>
          <Text style={[styles.tabText, tab === 'trending' && styles.tabTextActive]}>Trending</Text>
        </Pressable>
      </View>

      {visibleEntries.length === 0 && !loading ? (
        <EmptyState
          icon="globe-outline"
          title={tab === 'trending' ? 'No trending wears this week' : 'No public wears yet'}
          subtitle={tab === 'trending' ? 'Trending wears are ranked by reactions over the last 7 days.' : "Be the first! Toggle 'Post as Scent of the Day' when logging a wear."}
        />
      ) : (
        <FlatList
          data={visibleEntries}
          keyExtractor={(e) => e.id}
          renderItem={({ item }) => <FeedCard entry={item} onPress={() => router.push(`/fragrance/${item.fragrance_id}`)} />}
          contentContainerStyle={styles.list}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={COLORS.accent} />}
          ListFooterComponent={
            hasMore && entries.length > 0 ? (
              <Text style={styles.loadingMore}>Loading more...</Text>
            ) : entries.length > 0 ? (
              <Text style={styles.loadingMore}>You've reached the end</Text>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

function FeedCard({ entry, onPress }: { entry: SOTDEntry; onPress: () => void }) {
  const brand = entry.fragrances?.brands?.name ?? '';
  const fragName = entry.fragrances?.name ?? 'Unknown';
  const imageUrl = entry.fragrances?.image_url;

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.fragRow}>
        {imageUrl && (
          <View style={styles.fragImageWrap}>
            <Image source={{ uri: imageUrl }} style={styles.fragImage} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.fragBrand}>{brand.toUpperCase()}</Text>
          <Text style={styles.fragName} numberOfLines={2}>{fragName}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaDate}>{prettyDate(entry.worn_on)}</Text>
            {entry.occasion && (
              <View style={styles.occasionPill}>
                <Text style={styles.occasionText}>{entry.occasion}</Text>
              </View>
            )}
          </View>
        </View>
        {entry.rating != null && entry.rating > 0 && (
          <View style={styles.ratingBadge}>
            <Ionicons name="star" size={11} color={COLORS.accent} />
            <Text style={styles.ratingText}>{entry.rating}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

function prettyDate(iso: string): string {
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
      month: 'short', day: 'numeric',
    });
  } catch { return iso; }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
  },
  title: { ...TYPE.heading, textAlign: 'center' },
  tabRow: {
    flexDirection: 'row', gap: SPACING.sm,
    paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md,
  },
  tabPill: {
    paddingHorizontal: 16, paddingVertical: 7,
    borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  tabPillActive: { backgroundColor: COLORS.text, borderColor: COLORS.text },
  tabText: { ...TYPE.label, fontSize: 13, color: COLORS.muted },
  tabTextActive: { color: COLORS.bg },
  list: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl, gap: SPACING.md },

  card: {
    backgroundColor: COLORS.card, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.md, gap: SPACING.sm,
  },

  occasionPill: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: RADIUS.full, backgroundColor: COLORS.card2,
  },
  occasionText: { fontSize: 10, color: COLORS.muted, fontWeight: '500' },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: 4 },
  metaDate: { ...TYPE.caption, fontSize: 10 },

  fragRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  fragImageWrap: {
    width: 48, height: 48, borderRadius: RADIUS.md,
    overflow: 'hidden', backgroundColor: COLORS.card2,
  },
  fragImage: { width: '100%', height: '100%' },
  fragBrand: { ...TYPE.eyebrow, fontSize: 9, marginBottom: 1 },
  fragName: { fontFamily: FONTS.serif, fontWeight: '600', fontSize: 15, color: COLORS.text, lineHeight: 19 },
  ratingBadge: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ratingText: { fontSize: 13, fontWeight: '600', color: COLORS.accent },

  loadingMore: { ...TYPE.caption, textAlign: 'center', paddingVertical: SPACING.lg },
});
