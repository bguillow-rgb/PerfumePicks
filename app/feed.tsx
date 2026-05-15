import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, Image, RefreshControl, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, RADIUS, FONTS } from '@/src/constants/theme';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { useSOTDFeed, type SOTDEntry } from '@/src/hooks/useSOTDFeed';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

type FeedTab = 'today' | 'following' | 'trending';

/**
 * SOTD Feed — public wear log entries from the community.
 * Today = all public wears. Following = wears from followed users.
 * Compact card layout per LX-1.
 */
export default function FeedScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<FeedTab>('today');
  const { entries, loading, hasMore, loadMore, refresh } = useSOTDFeed();

  // Following feed — filter to followed users
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('follows').select('followee_id').eq('follower_id', user.id);
      if (data) setFollowingIds(new Set(data.map((r) => r.followee_id)));
    })();
  }, []);

  const visibleEntries = tab === 'following'
    ? entries.filter((e) => followingIds.has(e.user_id))
    : tab === 'trending'
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
        <Pressable style={[styles.tabPill, tab === 'following' && styles.tabPillActive]} onPress={() => setTab('following')}>
          <Text style={[styles.tabText, tab === 'following' && styles.tabTextActive]}>Following</Text>
        </Pressable>
        <Pressable style={[styles.tabPill, tab === 'trending' && styles.tabPillActive]} onPress={() => setTab('trending')}>
          <Text style={[styles.tabText, tab === 'trending' && styles.tabTextActive]}>Trending</Text>
        </Pressable>
      </View>

      {visibleEntries.length === 0 && !loading ? (
        <EmptyState
          icon="globe-outline"
          title={tab === 'following' ? 'No wears from people you follow' : tab === 'trending' ? 'No trending wears this week' : 'No public wears yet'}
          subtitle={tab === 'following' ? 'Follow some users to see their scent of the day here.' : tab === 'trending' ? 'Trending wears are ranked by reactions over the last 7 days.' : "Be the first! Toggle 'Post as Scent of the Day' when logging a wear."}
        />
      ) : (
        <FlatList
          data={visibleEntries}
          keyExtractor={(e) => e.id}
          renderItem={({ item }) => <FeedCard entry={item} onPress={() => router.push(`/fragrance/${item.fragrance_id}`)} onUserPress={() => router.push(`/user/${item.user_id}`)} />}
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

function FeedCard({ entry, onPress, onUserPress }: { entry: SOTDEntry; onPress: () => void; onUserPress: () => void }) {
  const brand = entry.fragrances?.brands?.name ?? '';
  const fragName = entry.fragrances?.name ?? 'Unknown';
  const imageUrl = entry.fragrances?.image_url;
  const author = entry.profiles?.display_name || 'Anonymous';

  return (
    <View style={styles.card}>
      {/* Author row */}
      <Pressable style={styles.authorRow} onPress={onUserPress}>
        <View style={styles.authorAvatar}>
          <Text style={styles.authorLetter}>{author[0]?.toUpperCase() ?? '?'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.authorName}>{author}</Text>
          <Text style={styles.authorDate}>{prettyDate(entry.worn_on)}</Text>
        </View>
        {entry.occasion && (
          <View style={styles.occasionPill}>
            <Text style={styles.occasionText}>{entry.occasion}</Text>
          </View>
        )}
      </Pressable>

      {/* Fragrance row — compact card style */}
      <Pressable style={styles.fragRow} onPress={onPress}>
        {imageUrl && (
          <View style={styles.fragImageWrap}>
            <Image source={{ uri: imageUrl }} style={styles.fragImage} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.fragBrand}>{brand.toUpperCase()}</Text>
          <Text style={styles.fragName} numberOfLines={2}>{fragName}</Text>
        </View>
        {entry.rating != null && entry.rating > 0 && (
          <View style={styles.ratingBadge}>
            <Ionicons name="star" size={11} color={COLORS.accent} />
            <Text style={styles.ratingText}>{entry.rating}</Text>
          </View>
        )}
      </Pressable>

      {/* Note */}
      {entry.note && (
        <Text style={styles.noteText} numberOfLines={3}>{entry.note}</Text>
      )}
    </View>
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

  authorRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  authorAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: COLORS.blushSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  authorLetter: { fontFamily: FONTS.serif, fontSize: 16, color: COLORS.accent },
  authorName: { ...TYPE.label, fontSize: 12, color: COLORS.text },
  authorDate: { ...TYPE.caption, fontSize: 10 },
  occasionPill: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: RADIUS.full, backgroundColor: COLORS.card2,
  },
  occasionText: { fontSize: 10, color: COLORS.muted, fontWeight: '500' },

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

  noteText: { ...TYPE.bodySmall, color: COLORS.muted, fontStyle: 'italic', lineHeight: 18 },

  loadingMore: { ...TYPE.caption, textAlign: 'center', paddingVertical: SPACING.lg },
});
