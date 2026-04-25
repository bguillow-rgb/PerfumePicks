import { View, Text, StyleSheet, FlatList, Pressable, ScrollView, TextInput } from 'react-native';
import { Alert } from '@/src/components/ui/StyledAlert';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { Card } from '@/src/components/ui/Card';
import { Badge } from '@/src/components/ui/Badge';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { StarRating } from '@/src/components/ui/StarRating';
import { CommunityRating } from '@/src/components/cigar/CommunityRating';
import { useCommunityRatings } from '@/src/hooks/useCommunityRating';
import { StatusChips } from '@/src/components/ui/StatusChip';
import { DateEntryModal } from '@/src/components/humidor/DateEntryModal';
import { VitolaPickerModal } from '@/src/components/humidor/VitolaPickerModal';
import { COLORS, SPACING, RADIUS } from '@/src/constants/theme';
import { useProStore } from '@/src/stores/useProStore';
import type { HumidorItem, CigarReview, Cigar } from '@/src/types/cigar';

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

  // Reset filter when navigated to with ?filter=all param + refetch on focus
  // (returning from cigar detail after marking as smoked, etc).
  useFocusEffect(
    useCallback(() => {
      if (filterParam === 'all') setFilter(isPro ? 'all' : 'owned');
      fetchItems();
    }, [fetchItems, filterParam, isPro])
  );

  // B2 fix: useFocusEffect only fires on focus events, NOT when fetchItems'
  // identity changes mid-focus. Tapping a filter chip updates `filter` state
  // and fetchItems identity, but the list never refetched until the user
  // tab-away-and-back triggered a focus event — producing the user-reported
  // "filter chips don't light up / view only sometimes changes" bug. This
  // plain useEffect re-runs on every fetchItems identity change and covers
  // the in-focus filter-flip case the focus effect misses.
  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

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

  // Per-stick effective price (cents): custom_price_cents (from inline edit) wins
  // over purchase_price_cents (legacy), which in turn wins over the seeded MSRP.
  const effectivePriceCents = (item: HumidorItem): number => {
    if (item.custom_price_cents != null) return item.custom_price_cents;
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

  // Owned-card redesign: group by brand+line so "Padrón 1964 Torpedo" and
  // "Padrón 1964 Exclusivo" collapse into a single card with a sub-row per vitola.
  type OwnedGroup = {
    key: string;
    brand: string;
    line: string;
    items: HumidorItem[];
    latest_updated_at: string;
  };
  const ownedGroups: OwnedGroup[] = useMemo(() => {
    if (filter !== 'owned') return [];
    const map = new Map<string, OwnedGroup>();
    for (const item of items) {
      if (item.status !== 'owned') continue;
      const brand = item.cigar?.brand ?? 'Unknown';
      const line = item.cigar?.line ?? item.cigar?.name ?? 'Unknown';
      const key = `${brand}::${line}`;
      const existing = map.get(key);
      if (existing) {
        existing.items.push(item);
        if (item.updated_at > existing.latest_updated_at) {
          existing.latest_updated_at = item.updated_at;
        }
      } else {
        map.set(key, {
          key,
          brand,
          line,
          items: [item],
          latest_updated_at: item.updated_at,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      b.latest_updated_at.localeCompare(a.latest_updated_at)
    );
  }, [filter, items]);

  // Inline-edit / modal state for owned rows.
  const [editingPriceItemId, setEditingPriceItemId] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState('');
  const [dateModal, setDateModal] = useState<{ item: HumidorItem } | null>(null);
  // Swap-vitola picker target. The user taps a vitola label in a group to swap
  // it for a different size from the same brand+line. Changing the size clears
  // the per-item price override so the new vitola's seeded price takes over.
  const [vitolaSwap, setVitolaSwap] = useState<{ item: HumidorItem; group: OwnedGroup } | null>(null);
  // How many catalog vitolas exist for each brand+line currently owned. Used
  // to decide whether a vitola row should show an "editable" chevron.
  const [vitolaCounts, setVitolaCounts] = useState<Map<string, number>>(new Map());

  const openPriceEdit = (item: HumidorItem) => {
    const cents = effectivePriceCents(item);
    setPriceDraft(cents > 0 ? (cents / 100).toFixed(2) : '');
    setEditingPriceItemId(item.id);
  };

  const commitPriceEdit = async (item: HumidorItem) => {
    const raw = priceDraft.trim();
    setEditingPriceItemId(null);
    // Empty → clear override (falls back to legacy or seeded MSRP).
    const next: number | null = raw === '' ? null : Math.round(Number(raw) * 100);
    if (next !== null && (!Number.isFinite(next) || next < 0)) return;
    if (next === item.custom_price_cents) return;
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, custom_price_cents: next } : i))
    );
    try {
      await supabase
        .from('humidor_items')
        .update({ custom_price_cents: next })
        .eq('id', item.id);
    } catch {
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, custom_price_cents: item.custom_price_cents } : i
        )
      );
    }
  };

  const saveAcquiredAt = async (item: HumidorItem, iso: string | null) => {
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, acquired_at: iso } : i))
    );
    try {
      await supabase
        .from('humidor_items')
        .update({ acquired_at: iso })
        .eq('id', item.id);
    } catch {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, acquired_at: item.acquired_at } : i))
      );
    }
  };

  // Swap a single humidor row to a different vitola in the same brand+line.
  // We also null out price_override_cents so the effective price falls back to
  // the new vitola's seeded MSRP — the old override was tied to the old size.
  const swapItemVitola = async (item: HumidorItem, toCigar: Cigar) => {
    try {
      const { data, error } = await supabase
        .from('humidor_items')
        .update({ cigar_id: toCigar.id, custom_price_cents: null })
        .eq('id', item.id)
        .select('*, cigar:cigars(*)')
        .single();
      if (error) throw error;
      if (data) {
        setItems((prev) => prev.map((i) => (i.id === item.id ? (data as HumidorItem) : i)));
      } else {
        fetchItems();
      }
    } catch {
      Alert.alert('Error', 'Failed to change size. Try again.');
    } finally {
      setVitolaSwap(null);
    }
  };

  // Count how many catalog vitolas exist for each brand+line currently owned.
  // A single paged query per (brand IN ...) covers them all; we filter the
  // line locally so we don't need supabase's weaker multi-column .in() support.
  useEffect(() => {
    if (ownedGroups.length === 0) {
      if (vitolaCounts.size > 0) setVitolaCounts(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      const brands = Array.from(new Set(ownedGroups.map((g) => g.brand)));
      const lines = new Set(ownedGroups.map((g) => g.line));
      const { data } = await supabase
        .from('cigars')
        .select('brand,line')
        .in('brand', brands);
      if (cancelled) return;
      const counts = new Map<string, number>();
      for (const row of (data as { brand: string; line: string }[]) ?? []) {
        if (!lines.has(row.line)) continue;
        const k = `${row.brand}::${row.line}`;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      setVitolaCounts(counts);
    })();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownedGroups.map((g) => g.key).join('|')]);

  // Resting indicator: whole days since acquired_at. Shown as "Xd resting"
  // once >= 1 day; "Acquired today" on day zero; "Set acquired date" if null.
  const restingDays = (item: HumidorItem): number | null => {
    if (!item.acquired_at) return null;
    const start = new Date(item.acquired_at).getTime();
    if (!Number.isFinite(start)) return null;
    const days = Math.floor((Date.now() - start) / (1000 * 60 * 60 * 24));
    return days >= 0 ? days : null;
  };

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
              // UX Eyes P1: add a `pressed` opacity nudge so tapping an
              // already-active chip visibly registers. Prior behavior
              // left the chip static on re-tap, reading as "tap didn't
              // work."
              style={({ pressed }) => [
                styles.chip,
                filter === f && styles.chipActive,
                locked && styles.chipLocked,
                pressed && { opacity: 0.75 },
              ]}
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
      ) : filter === 'owned' ? (
        <FlatList
          ref={listRef}
          data={ownedGroups}
          keyExtractor={(g) => g.key}
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={true}
          indicatorStyle="white"
          bounces={true}
          alwaysBounceVertical={true}
          onContentSizeChange={() => listRef.current?.flashScrollIndicators()}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80, flexGrow: 1 }}
          ListEmptyComponent={
            <EmptyState
              title="No cigars owned yet"
              subtitle="Mark cigars you have on hand as owned."
              actionLabel="Browse Cigars"
              onAction={() => router.push('/(tabs)/browse')}
            />
          }
          renderItem={({ item: group }) => {
            const firstCigarId = group.items[0]?.cigar_id;
            const groupRating = firstCigarId ? ratingsMap.get(firstCigarId) : null;

            return (
              <Card style={styles.itemCard}>
                <Pressable
                  onPress={() =>
                    firstCigarId &&
                    router.push(`/(tabs)/cigar/${firstCigarId}?from=humidor&status=owned`)
                  }
                >
                  <View style={styles.itemHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemName}>{group.line}</Text>
                      <Text style={styles.itemBrand}>{group.brand}</Text>
                      {groupRating && groupRating.count > 0 ? (
                        <CommunityRating
                          average={groupRating.average}
                          count={groupRating.count}
                          variant="compact"
                        />
                      ) : null}
                    </View>
                    <Badge label="owned" color={COLORS.success} />
                  </View>
                </Pressable>

                {(() => {
                  const catalogCount = vitolaCounts.get(group.key) ?? 0;
                  // Alternatives exist if the catalog has more vitolas in this
                  // brand+line than the user currently owns in the group.
                  const hasAlternatives = catalogCount > group.items.length;
                  return group.items.map((item: HumidorItem) => {
                    const qty = item.quantity ?? 1;
                    const perStickCents = effectivePriceCents(item);
                    const lineTotalCents = itemValueCents(item);
                    const isEditing = editingPriceItemId === item.id;
                    const days = restingDays(item);
                    const vitolaLabel =
                      item.cigar?.vitola ?? item.cigar?.name ?? 'Vitola';

                    return (
                      <View key={item.id} style={styles.vitolaRow}>
                        <View style={styles.vitolaTopRow}>
                          <Pressable
                            onPress={
                              hasAlternatives
                                ? () => setVitolaSwap({ item, group })
                                : undefined
                            }
                            disabled={!hasAlternatives}
                            hitSlop={4}
                            style={styles.vitolaLabelPressable}
                          >
                            <Text style={styles.vitolaLabel} numberOfLines={1}>
                              {vitolaLabel}
                            </Text>
                            {hasAlternatives && (
                              <Ionicons
                                name="chevron-down"
                                size={14}
                                color={COLORS.accent}
                                style={styles.vitolaChevron}
                              />
                            )}
                          </Pressable>
                          <Pressable
                            onPress={() => handleDelete(item)}
                            hitSlop={8}
                            style={styles.vitolaDelete}
                          >
                            <Ionicons
                              name="close-circle-outline"
                              size={18}
                              color={COLORS.muted}
                            />
                          </Pressable>
                        </View>

                      <View style={styles.vitolaControls}>
                        <View style={styles.qtyStepper}>
                          <Pressable
                            onPress={() => updateQuantity(item, -1)}
                            hitSlop={8}
                            style={[styles.qtyBtn, qty <= 1 && styles.qtyBtnDisabled]}
                            disabled={qty <= 1}
                          >
                            <Ionicons
                              name="remove"
                              size={16}
                              color={qty <= 1 ? COLORS.subtle : COLORS.text}
                            />
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
                          {isEditing ? (
                            <View style={styles.priceEditRow}>
                              <Text style={styles.priceDollar}>$</Text>
                              <TextInput
                                autoFocus
                                value={priceDraft}
                                onChangeText={(t) =>
                                  setPriceDraft(t.replace(/[^0-9.]/g, '').slice(0, 7))
                                }
                                onBlur={() => commitPriceEdit(item)}
                                onSubmitEditing={() => commitPriceEdit(item)}
                                keyboardType="decimal-pad"
                                returnKeyType="done"
                                selectionColor={COLORS.accent}
                                style={styles.priceInput}
                                placeholder="0.00"
                                placeholderTextColor={COLORS.subtle}
                              />
                            </View>
                          ) : (
                            <Pressable onPress={() => openPriceEdit(item)} hitSlop={6}>
                              <Text style={styles.perStickText}>
                                {perStickCents > 0
                                  ? `${fmtUSD(perStickCents)} ea`
                                  : 'Set price'}
                              </Text>
                            </Pressable>
                          )}
                          <Text style={styles.lineTotalText}>
                            {lineTotalCents > 0 ? fmtUSD(lineTotalCents) : ''}
                          </Text>
                        </View>
                      </View>

                      <Pressable
                        onPress={() => setDateModal({ item })}
                        hitSlop={6}
                        style={styles.restingRow}
                      >
                        <Ionicons
                          name="time-outline"
                          size={12}
                          color={COLORS.muted}
                        />
                        <Text style={styles.restingText}>
                          {days === null
                            ? 'Set acquired date'
                            : days === 0
                            ? 'Acquired today'
                            : `${days}d resting`}
                        </Text>
                      </Pressable>
                    </View>
                  );
                  });
                })()}
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
              title={filter === 'wishlist' ? 'Your wishlist is empty' : 'No smokes logged yet'}
              subtitle={
                filter === 'wishlist'
                  ? 'Browse cigars and add ones you want to try.'
                  : 'Mark cigars here after you\u2019ve smoked them.'
              }
              actionLabel="Browse Cigars"
              onAction={() => router.push('/(tabs)/browse')}
            />
          }
          renderItem={({ item }) => {
            const review = item.status === 'smoked' ? myReviews.get(item.cigar_id) : null;
            const isSmoked = item.status === 'smoked';

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

      <DateEntryModal
        visible={dateModal !== null}
        title="Acquired on"
        value={dateModal?.item.acquired_at ?? null}
        onClose={() => setDateModal(null)}
        onSave={(iso) => {
          if (dateModal) saveAcquiredAt(dateModal.item, iso);
        }}
      />

      {vitolaSwap && (
        <VitolaPickerModal
          visible
          brand={vitolaSwap.group.brand}
          line={vitolaSwap.group.line}
          // Exclude vitolas already owned in this group so the update can't
          // violate the (user_id, cigar_id, status) unique constraint.
          excludeCigarIds={vitolaSwap.group.items.map((i) => i.cigar_id)}
          onClose={() => setVitolaSwap(null)}
          onPick={(cigar) => swapItemVitola(vitolaSwap.item, cigar)}
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
  // Owned-card redesign: per-vitola sub-row inside a brand+line group card.
  vitolaRow: {
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  vitolaTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  // Wraps label + chevron. Becomes the tap target when alternatives exist.
  vitolaLabelPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: SPACING.sm,
  },
  vitolaLabel: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    flexShrink: 1,
  },
  vitolaChevron: {
    marginLeft: 4,
  },
  vitolaDelete: {
    padding: 4,
  },
  vitolaControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  priceDollar: {
    fontFamily: 'Cormorant',
    fontSize: 11,
    color: COLORS.muted,
  },
  priceInput: {
    fontFamily: 'Cormorant',
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    minWidth: 60,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.accent,
    paddingVertical: 0,
    paddingHorizontal: 2,
    textAlign: 'right',
  },
  restingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  restingText: {
    fontFamily: 'Cormorant',
    fontSize: 11,
    color: COLORS.muted,
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
