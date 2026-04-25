import { View, Text, StyleSheet, FlatList, Pressable, Alert, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useState, useCallback, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { Card } from '@/src/components/ui/Card';
import { Badge } from '@/src/components/ui/Badge';
import { Button } from '@/src/components/ui/Button';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { StarRating } from '@/src/components/ui/StarRating';
import { CommunityRating } from '@/src/components/cigar/CommunityRating';
import { useCommunityRatings } from '@/src/hooks/useCommunityRating';
import { StatusChips } from '@/src/components/ui/StatusChip';
import { COLORS, SPACING, RADIUS } from '@/src/constants/theme';
import { useProStore } from '@/src/stores/useProStore';
import type { HumidorItem, CigarReview } from '@/src/types/cigar';

type GroupedHumidorItem = {
  cigar_id: string;
  cigar: HumidorItem['cigar'];
  statuses: string[];
  items: HumidorItem[];
  latest_updated_at: string;
};

const FILTERS = ['all', 'wishlist', 'owned', 'smoked'] as const;
type Filter = typeof FILTERS[number];

const FILTER_LABELS: Record<Filter, string> = {
  all: 'All',
  wishlist: 'Wishlist',
  owned: 'Owned',
  smoked: 'Smoked',
};

export default function HumidorScreen() {
  const router = useRouter();
  const { filter: filterParam } = useLocalSearchParams<{ filter?: string }>();
  const insets = useSafeAreaInsets();
  const isPro = useProStore((s) => s.isPro);
  const hasHydrated = useProStore((s) => s.hasHydrated);
  const [filter, setFilter] = useState<Filter>('all');
  const [items, setItems] = useState<HumidorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [myReviews, setMyReviews] = useState<Map<string, CigarReview>>(new Map());
  const listRef = useRef<FlatList>(null);

  // Treat user as Pro until the persisted state has rehydrated. Otherwise Pro users
  // see a flash of the free/locked UI on every navigation while AsyncStorage loads.
  const treatAsPro = !hasHydrated || isPro;
  const availableFilters: readonly Filter[] = treatAsPro ? FILTERS : ['owned'];
  if (hasHydrated && !isPro && filter !== 'owned') {
    // Force owned filter for free users
    setTimeout(() => setFilter('owned'), 0);
  }

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase
        .from('humidor_items')
        .select('*, cigar:cigars(*)')
        .order('updated_at', { ascending: false });
      if (filter !== 'all') {
        q = q.eq('status', filter);
      }
      const { data } = await q;
      const fetchedItems = (data as HumidorItem[]) ?? [];
      setItems(fetchedItems);

      // Fetch user's reviews for smoked cigars
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const smokedIds = fetchedItems
            .filter((i) => i.status === 'smoked')
            .map((i) => i.cigar_id);
          if (smokedIds.length > 0) {
            const { data: reviews } = await supabase
              .from('cigar_reviews')
              .select('*')
              .eq('user_id', user.id)
              .in('cigar_id', smokedIds);
            const reviewMap = new Map<string, CigarReview>();
            for (const r of (reviews ?? []) as CigarReview[]) {
              reviewMap.set(r.cigar_id, r);
            }
            setMyReviews(reviewMap);
          } else {
            setMyReviews(new Map());
          }
        }
      } catch {
        // Reviews fetch non-blocking
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  // Reset filter when navigated to with ?filter=all param
  useFocusEffect(
    useCallback(() => {
      if (filterParam === 'all') setFilter(isPro ? 'all' : 'owned');
      fetchItems();
    }, [fetchItems, filterParam, isPro])
  );

  const handleDelete = (item: HumidorItem) => {
    const cigarName = item.cigar?.line ?? item.cigar?.name ?? 'this cigar';
    Alert.alert(
      'Remove from Humidor',
      `Are you sure you want to remove ${cigarName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await supabase.from('humidor_items').delete().eq('id', item.id);
              setItems((prev) => prev.filter((i) => i.id !== item.id));
            } catch {
              Alert.alert('Error', 'Failed to remove cigar');
            }
          },
        },
      ]
    );
  };

  const ratingsMap = useCommunityRatings(items.map((i) => i.cigar_id));

  // Per-stick effective price (cents): user's purchase price overrides the seeded MSRP
  const effectivePriceCents = (item: HumidorItem): number => {
    if (item.purchase_price_cents != null) return item.purchase_price_cents;
    return item.cigar?.price_usd_cents ?? 0;
  };
  const itemValueCents = (item: HumidorItem): number =>
    effectivePriceCents(item) * (item.quantity ?? 1);
  const fmtUSD = (cents: number): string => {
    const dollars = cents / 100;
    return dollars >= 100
      ? `$${dollars.toFixed(0)}`
      : `$${dollars.toFixed(2)}`;
  };

  // Total owned value across all owned items
  const ownedItems = items.filter((i) => i.status === 'owned');
  const ownedTotalCents = ownedItems.reduce((sum, i) => sum + itemValueCents(i), 0);
  const ownedStickCount = ownedItems.reduce((sum, i) => sum + (i.quantity ?? 1), 0);

  // Quantity mutation — updates optimistically then writes to DB
  const updateQuantity = async (item: HumidorItem, delta: number) => {
    const next = Math.max(1, (item.quantity ?? 1) + delta);
    if (next === item.quantity) return;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, quantity: next } : i)));
    try {
      await supabase.from('humidor_items').update({ quantity: next }).eq('id', item.id);
    } catch {
      // Revert on failure
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, quantity: item.quantity } : i)));
    }
  };

  // Group items by cigar_id for the "all" tab to avoid duplicate cards
  const grouped: GroupedHumidorItem[] = (() => {
    if (filter !== 'all') return [];
    const map = new Map<string, GroupedHumidorItem>();
    for (const item of items) {
      const existing = map.get(item.cigar_id);
      if (existing) {
        if (!existing.statuses.includes(item.status)) {
          existing.statuses.push(item.status);
        }
        existing.items.push(item);
        if (item.updated_at > existing.latest_updated_at) {
          existing.latest_updated_at = item.updated_at;
        }
      } else {
        map.set(item.cigar_id, {
          cigar_id: item.cigar_id,
          cigar: item.cigar,
          statuses: [item.status],
          items: [item],
          latest_updated_at: item.updated_at,
        });
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => b.latest_updated_at.localeCompare(a.latest_updated_at)
    );
  })();

  const filtered = items;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + SPACING.sm }]}>
      <Text style={styles.title}>
        <Text style={{ fontStyle: 'italic' }}>my</Text>
        Humidor
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filtersContent}
        style={styles.filtersScroll}
      >
        {FILTERS.map((f) => {
          const locked = !treatAsPro && !availableFilters.includes(f);
          return (
            <Pressable
              key={f}
              onPress={() => {
                if (locked) {
                  router.push('/paywall');
                } else {
                  setFilter(f);
                }
              }}
              style={[styles.chip, filter === f && styles.chipActive, locked && styles.chipLocked]}
            >
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={1.3}
                style={[styles.chipText, filter === f && styles.chipTextActive, locked && styles.chipTextLocked]}
              >
                {locked ? `${FILTER_LABELS[f]} 🔒` : FILTER_LABELS[f]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {!treatAsPro && (
        <Pressable onPress={() => router.push('/paywall')} style={styles.upgradeBanner}>
          <Ionicons name="star-outline" size={16} color={COLORS.accent} />
          <Text style={styles.upgradeBannerText}>Upgrade to Pro for Wishlist, Smoked, Reviews & more</Text>
        </Pressable>
      )}

      {filter === 'owned' && ownedItems.length > 0 && (
        <View style={styles.valueBanner}>
          <View>
            <Text style={styles.valueBannerLabel}>HUMIDOR VALUE</Text>
            <Text style={styles.valueBannerTotal}>{fmtUSD(ownedTotalCents)}</Text>
          </View>
          <View style={styles.valueBannerRight}>
            <Text style={styles.valueBannerMeta}>{ownedStickCount} {ownedStickCount === 1 ? 'stick' : 'sticks'}</Text>
          </View>
        </View>
      )}

      {filter === 'all' ? (
        <FlatList
          ref={listRef}
          data={grouped}
          keyExtractor={(item) => item.cigar_id}
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={true}
          indicatorStyle="white"
          bounces={true}
          alwaysBounceVertical={true}
          onContentSizeChange={() => listRef.current?.flashScrollIndicators()}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80, flexGrow: 1 }}
          ListEmptyComponent={
            <EmptyState
              title="Your humidor is empty"
              subtitle="Save cigars from recommendations or browse to build your collection."
              actionLabel="Browse Cigars"
              onAction={() => router.push('/(tabs)/browse')}
            />
          }
          renderItem={({ item: group }) => {
            const isSmoked = group.statuses.includes('smoked');
            const review = isSmoked ? myReviews.get(group.cigar_id) : null;

            return (
              <Card
                style={styles.itemCard}
                onPress={() => router.push(`/(tabs)/cigar/${group.cigar_id}?from=humidor`)}
              >
                <View style={styles.itemHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{group.cigar?.line ?? group.cigar?.name ?? 'Unknown'}</Text>
                    <Text style={styles.itemBrand}>{group.cigar?.brand ?? ''}</Text>
                    {(() => {
                      const r = ratingsMap.get(group.cigar_id);
                      return r && r.count > 0 ? (
                        <CommunityRating average={r.average} count={r.count} variant="compact" />
                      ) : null;
                    })()}
                  </View>
                  <StatusChips statuses={group.statuses as any[]} />
                </View>

                {isSmoked && (
                  <View style={styles.reviewSection}>
                    {review ? (
                      <View style={styles.myRatingRow}>
                        <Text style={styles.myRatingLabel}>My Rating</Text>
                        <StarRating value={review.overall_rating} size={16} />
                        {review.review_text ? (
                          <Text style={styles.reviewSnippet} numberOfLines={1}>
                            {review.review_text}
                          </Text>
                        ) : null}
                      </View>
                    ) : (
                      <Pressable
                        style={styles.ratePrompt}
                        onPress={() => router.push(`/(tabs)/cigar/${group.cigar_id}?from=humidor&status=smoked`)}
                        hitSlop={4}
                      >
                        <Ionicons name="star-outline" size={16} color={COLORS.accent} />
                        <Text style={styles.ratePromptText}>Tap to rate & review</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </Card>
            );
          }}
        />
      ) : (
        <FlatList
          ref={listRef}
          data={filtered}
          keyExtractor={(item) => item.id}
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={true}
          indicatorStyle="white"
          bounces={true}
          alwaysBounceVertical={true}
          onContentSizeChange={() => listRef.current?.flashScrollIndicators()}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80, flexGrow: 1 }}
          ListEmptyComponent={
            <EmptyState
              title={
                filter === 'wishlist' ? 'Your wishlist is empty' :
                filter === 'owned' ? 'No cigars owned yet' :
                'No smokes logged yet'
              }
              subtitle={
                filter === 'wishlist' ? 'Browse cigars and add ones you want to try.' :
                filter === 'owned' ? 'Mark cigars you have on hand as owned.' :
                'After you smoke a cigar, log it here.'
              }
              actionLabel="Browse Cigars"
              onAction={() => router.push('/(tabs)/browse')}
            />
          }
          renderItem={({ item }) => {
            const review = item.status === 'smoked' ? myReviews.get(item.cigar_id) : null;
            const isSmoked = item.status === 'smoked';
            const isOwned = item.status === 'owned';
            const qty = item.quantity ?? 1;
            const perStickCents = effectivePriceCents(item);
            const lineTotalCents = itemValueCents(item);

            return (
              <Card
                style={styles.itemCard}
                onPress={() => item.cigar_id && router.push(`/(tabs)/cigar/${item.cigar_id}?from=humidor&status=${item.status}`)}
              >
                <View style={styles.itemHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{item.cigar?.line ?? item.cigar?.name ?? 'Unknown'}</Text>
                    <Text style={styles.itemBrand}>{item.cigar?.brand ?? ''}</Text>
                    {(() => {
                      const r = ratingsMap.get(item.cigar_id);
                      return r && r.count > 0 ? (
                        <CommunityRating average={r.average} count={r.count} variant="compact" />
                      ) : null;
                    })()}
                  </View>
                  <Badge
                    label={item.status}
                    color={
                      item.status === 'owned' ? COLORS.success :
                      item.status === 'smoked' ? COLORS.accent :
                      COLORS.info
                    }
                  />
                  <Pressable
                    onPress={() => handleDelete(item)}
                    hitSlop={10}
                    style={styles.deleteBtn}
                  >
                    <Ionicons name="close-circle-outline" size={20} color={COLORS.muted} />
                  </Pressable>
                </View>

                {isOwned && (
                  <View style={styles.ownedFooter}>
                    <View style={styles.qtyStepper}>
                      <Pressable
                        onPress={() => updateQuantity(item, -1)}
                        hitSlop={8}
                        style={[styles.qtyBtn, qty <= 1 && styles.qtyBtnDisabled]}
                        disabled={qty <= 1}
                      >
                        <Ionicons name="remove" size={16} color={qty <= 1 ? COLORS.subtle : COLORS.text} />
                      </Pressable>
                      <Text style={styles.qtyValue}>{qty}</Text>
                      <Pressable
                        onPress={() => updateQuantity(item, 1)}
                        hitSlop={8}
                        style={styles.qtyBtn}
                      >
                        <Ionicons name="add" size={16} color={COLORS.text} />
                      </Pressable>
                    </View>
                    <View style={styles.valueCol}>
                      <Text style={styles.perStickText}>
                        {perStickCents > 0 ? `${fmtUSD(perStickCents)} ea` : '—'}
                      </Text>
                      <Text style={styles.lineTotalText}>
                        {lineTotalCents > 0 ? fmtUSD(lineTotalCents) : ''}
                      </Text>
                    </View>
                  </View>
                )}

                {isSmoked && (
                  <View style={styles.reviewSection}>
                    {review ? (
                      <View style={styles.myRatingRow}>
                        <Text style={styles.myRatingLabel}>My Rating</Text>
                        <StarRating value={review.overall_rating} size={16} />
                        {review.review_text ? (
                          <Text style={styles.reviewSnippet} numberOfLines={1}>
                            {review.review_text}
                          </Text>
                        ) : null}
                      </View>
                    ) : (
                      <Pressable
                        style={styles.ratePrompt}
                        onPress={() => router.push(`/(tabs)/cigar/${item.cigar_id}?from=humidor&status=${item.status}`)}
                        hitSlop={4}
                      >
                        <Ionicons name="star-outline" size={16} color={COLORS.accent} />
                        <Text style={styles.ratePromptText}>Tap to rate & review</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </Card>
            );
          }}
        />
      )}
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
    marginBottom: SPACING.sm,
  },
  // Horizontally scrollable filter bar — survives Dynamic Type enlargement
  filtersScroll: {
    flexGrow: 0,
    marginBottom: SPACING.md,
  },
  filtersContent: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: SPACING.md,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  chipText: {
    fontFamily: 'Cormorant',
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.muted,
  },
  chipTextActive: {
    color: COLORS.bg,
  },
  chipLocked: {
    borderColor: COLORS.border,
    opacity: 0.5,
  },
  chipTextLocked: {
    color: COLORS.muted,
  },
  upgradeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.accent,
    paddingVertical: 10,
    paddingHorizontal: SPACING.sm,
    marginBottom: SPACING.md,
  },
  upgradeBannerText: {
    fontFamily: 'Cormorant',
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.accent,
    flex: 1,
  },
  valueBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },
  valueBannerLabel: {
    fontFamily: 'Cormorant',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: COLORS.accent,
  },
  valueBannerTotal: {
    fontFamily: 'Cormorant',
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.text,
    marginTop: 2,
  },
  valueBannerRight: {
    alignItems: 'flex-end',
  },
  valueBannerMeta: {
    fontFamily: 'Cormorant',
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.muted,
  },
  ownedFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  qtyStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.card2,
  },
  qtyBtnDisabled: {
    opacity: 0.4,
  },
  qtyValue: {
    fontFamily: 'Cormorant',
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
    minWidth: 20,
    textAlign: 'center',
  },
  valueCol: {
    alignItems: 'flex-end',
  },
  perStickText: {
    fontFamily: 'Cormorant',
    fontSize: 11,
    color: COLORS.muted,
  },
  lineTotalText: {
    fontFamily: 'Cormorant',
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
    marginTop: 1,
  },
  itemCard: {
    marginBottom: SPACING.sm,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemName: {
    fontFamily: 'Cormorant',
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  itemBrand: {
    fontFamily: 'Cormorant',
    fontSize: 13,
    color: COLORS.muted,
    marginTop: 2,
  },
  deleteBtn: {
    marginLeft: 8,
    padding: 4,
  },

  // Review section on smoked cards
  reviewSection: {
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  myRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  myRatingLabel: {
    fontFamily: 'Cormorant',
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.muted,
  },
  reviewSnippet: {
    fontFamily: 'Cormorant',
    fontSize: 12,
    color: COLORS.subtle,
    fontStyle: 'italic',
    flex: 1,
  },
  ratePrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ratePromptText: {
    fontFamily: 'Cormorant',
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.accent,
  },

  proGate: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  proGateTitle: {
    fontFamily: 'Cormorant',
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.text,
    marginTop: SPACING.md,
  },
  proGateSub: {
    fontFamily: 'Cormorant',
    fontSize: 15,
    color: COLORS.muted,
    textAlign: 'center',
    marginTop: SPACING.sm,
    lineHeight: 22,
  },
});
