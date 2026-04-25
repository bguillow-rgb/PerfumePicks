import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert, Image, TextInput, Pressable, Animated } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { track } from '@/src/lib/observability/analytics';
import { EVENTS } from '@/src/lib/observability/events';
import { supabase } from '@/lib/supabase';
import { Card } from '@/src/components/ui/Card';
import { Badge } from '@/src/components/ui/Badge';
import { Meter } from '@/src/components/ui/Meter';
import { Button } from '@/src/components/ui/Button';
import { StarRating } from '@/src/components/ui/StarRating';
import { CommunityRating } from '@/src/components/cigar/CommunityRating';
import { useCommunityRating } from '@/src/hooks/useCommunityRating';
import { COLORS, SPACING, FONTS, RADIUS } from '@/src/constants/theme';
import { useProStore } from '@/src/stores/useProStore';
import { getDrinkPairings } from '@/src/features/quiz/pairings';
import type { Cigar, HumidorItem, CigarReview } from '@/src/types/cigar';

export default function CigarDetailScreen() {
  const { id, from, status: passedStatus } = useLocalSearchParams<{ id: string; from?: string; status?: string }>();
  const isPro = useProStore((s) => s.isPro);
  const hasHydrated = useProStore((s) => s.hasHydrated);
  // Treat as Pro until persisted state rehydrates — avoids briefly showing the
  // locked/free variant of Pro-gated UI on every screen mount for actual Pro users.
  const treatAsPro = !hasHydrated || isPro;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [cigar, setCigar] = useState<Cigar | null>(null);
  const [loading, setLoading] = useState(true);
  const [similar, setSimilar] = useState<Cigar[]>([]);
  const [humidorItems, setHumidorItems] = useState<HumidorItem[]>([]);
  const [statuses, setStatuses] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState('');
  const [editingNotes, setEditingNotes] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);

  // Status helpers — use both fetched data AND passed param as fallback
  const isSmoked = statuses.has('smoked') || passedStatus === 'smoked';
  const isOwned = statuses.has('owned') || passedStatus === 'owned';
  const isWishlisted = statuses.has('wishlist') || passedStatus === 'wishlist';
  const hasAnyStatus = humidorItems.length > 0 || !!passedStatus;
  const primaryItem = humidorItems.length > 0
    ? humidorItems.reduce((a, b) => (a.updated_at > b.updated_at ? a : b))
    : null;

  // Review state
  const [myReview, setMyReview] = useState<CigarReview | null>(null);
  const [editingReview, setEditingReview] = useState(false);
  const [overallRating, setOverallRating] = useState(0);
  const [drawRating, setDrawRating] = useState(0);
  const [burnRating, setBurnRating] = useState(0);
  const [flavorRating, setFlavorRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [savingReview, setSavingReview] = useState(false);

  // Community rating
  const communityRating = useCommunityRating(id);

  const fetchHumidorItems = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from('humidor_items')
        .select('*')
        .eq('user_id', user.id)
        .eq('cigar_id', id);
      if (error) {
        console.warn('fetchHumidorItems error:', error.message);
        return;
      }
      const items = (data as HumidorItem[]) ?? [];
      setHumidorItems(items);
      setStatuses(new Set(items.map((i) => i.status)));
      // Load notes from the most recent item
      if (items.length > 0) {
        const primary = items.reduce((a, b) => (a.updated_at > b.updated_at ? a : b));
        setNotes(primary.notes ?? '');
      }
    } catch (e: any) {
      console.warn('fetchHumidorItems exception:', e?.message);
    }
  };

  const fetchMyReview = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('cigar_reviews')
        .select('*')
        .eq('user_id', user.id)
        .eq('cigar_id', id)
        .maybeSingle();
      if (data) {
        const review = data as CigarReview;
        setMyReview(review);
        setOverallRating(review.overall_rating);
        setDrawRating(review.draw_rating ?? 0);
        setBurnRating(review.burn_rating ?? 0);
        setFlavorRating(review.flavor_rating ?? 0);
        setReviewText(review.review_text ?? '');
      }
    } catch {
      // Table may not exist yet — non-blocking
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from('cigars').select('*').eq('id', id).single();
        const c = data as Cigar | null;
        setCigar(c);

        if (c) {
          const { data: simData } = await supabase
            .from('cigars')
            .select('*')
            .neq('id', id)
            .or(`brand.eq.${c.brand},strength.eq.${c.strength}`)
            .limit(30);
          // Dedupe by (brand, line) so different vitolas of the same line collapse to one card.
          const seen = new Set<string>();
          const deduped: Cigar[] = [];
          for (const row of (simData as Cigar[]) ?? []) {
            const key = `${row.brand}::${row.line ?? row.name}`;
            if (seen.has(key)) continue;
            seen.add(key);
            deduped.push(row);
            if (deduped.length >= 4) break;
          }
          setSimilar(deduped);
        }

        await fetchHumidorItems();
        await fetchMyReview();
      } catch {
        setCigar(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleSaveNotes = async () => {
    if (!primaryItem) return;
    setSavingNotes(true);
    try {
      // Save notes on all humidor items for this cigar
      const { error } = await supabase
        .from('humidor_items')
        .update({ notes: notes.trim() || null })
        .eq('id', primaryItem.id);
      if (error) throw error;
      await fetchHumidorItems();
      setEditingNotes(false);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to save notes');
    } finally {
      setSavingNotes(false);
    }
  };

  const handleDeleteNotes = () => {
    Alert.alert('Delete Notes', 'Are you sure you want to delete your notes?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!primaryItem) return;
          setSavingNotes(true);
          try {
            const { error } = await supabase
              .from('humidor_items')
              .update({ notes: null })
              .eq('id', primaryItem.id);
            if (error) throw error;
            setNotes('');
            await fetchHumidorItems();
            setEditingNotes(false);
          } catch (e: any) {
            Alert.alert('Error', e?.message ?? 'Failed to delete notes');
          } finally {
            setSavingNotes(false);
          }
        },
      },
    ]);
  };

  const handleSaveReview = async () => {
    if (overallRating === 0) {
      Alert.alert('Required', 'Please set an overall rating.');
      return;
    }
    setSavingReview(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sign in required');

      const payload = {
        user_id: user.id,
        cigar_id: id,
        overall_rating: overallRating,
        draw_rating: drawRating > 0 ? drawRating : null,
        burn_rating: burnRating > 0 ? burnRating : null,
        flavor_rating: flavorRating > 0 ? flavorRating : null,
        review_text: reviewText.trim() || null,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('cigar_reviews')
        .upsert(payload, { onConflict: 'user_id,cigar_id' })
        .select()
        .single();

      if (error) throw error;
      setMyReview(data as CigarReview);
      setEditingReview(false);
      Alert.alert('Saved', 'Your review has been saved. Thanks for sharing!');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to save review');
    } finally {
      setSavingReview(false);
    }
  };

  const handleDeleteReview = () => {
    Alert.alert('Delete Review', 'Are you sure you want to delete your review?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!myReview) return;
          try {
            await supabase.from('cigar_reviews').delete().eq('id', myReview.id);
            setMyReview(null);
            setOverallRating(0);
            setDrawRating(0);
            setBurnRating(0);
            setFlavorRating(0);
            setReviewText('');
            setEditingReview(false);
          } catch {
            Alert.alert('Error', 'Failed to delete review');
          }
        },
      },
    ]);
  };

  const handleAddToHumidor = async (status: 'wishlist' | 'owned' | 'smoked') => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Sign In Required', 'Sign in to save cigars to your humidor.');
        return;
      }

      // Check if this status already exists
      const existing = humidorItems.find((i) => i.status === status);
      if (existing) {
        Alert.alert('Already saved', `This cigar is already in your ${status} list.`);
        return;
      }

      // Insert the new status row (upsert to handle both old and new constraint)
      const { error } = await supabase.from('humidor_items').upsert({
        user_id: user.id,
        cigar_id: id,
        status,
      }, { onConflict: 'user_id,cigar_id,status', ignoreDuplicates: true });
      if (error) {
        // Fallback for old constraint
        const { error: fallbackError } = await supabase.from('humidor_items').upsert({
          user_id: user.id,
          cigar_id: id,
          status,
        }, { onConflict: 'user_id,cigar_id' });
        if (fallbackError) throw fallbackError;
      }

      // If logging a smoke, remove from owned (cigar has been consumed)
      if (status === 'smoked') {
        const ownedItem = humidorItems.find((i) => i.status === 'owned');
        if (ownedItem) {
          await supabase.from('humidor_items').delete().eq('id', ownedItem.id);
        }
        // Also remove from wishlist if present (they've now smoked it)
        const wishItem = humidorItems.find((i) => i.status === 'wishlist');
        if (wishItem) {
          await supabase.from('humidor_items').delete().eq('id', wishItem.id);
        }
      }

      const label = status === 'smoked' ? 'Smoke logged!' : `Added to your ${status} list.`;
      Alert.alert('Saved', label);
      await fetchHumidorItems();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to save');
    }
  };

  if (loading) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  if (!cigar) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Cigar not found</Text>
        <Button title="Go Back" variant="ghost" onPress={() => router.back()} style={{ marginTop: SPACING.md }} />
      </View>
    );
  }

  const showReviewForm = isSmoked && (editingReview || !myReview);
  const showReviewDisplay = isSmoked && myReview && !editingReview;

  const fromScan = from === 'scan';

  // Undo snackbar — only shows when we arrived via scan-confirm. Fades in ~300ms
  // after mount, auto-dismisses at 4.5s. Tapping Undo removes the humidor row
  // the scan flow just inserted and routes back to the scanner.
  const [undoVisible, setUndoVisible] = useState(false);
  const undoOpacity = useRef(new Animated.Value(0)).current;
  const undoUsedRef = useRef(false);
  useEffect(() => {
    if (!fromScan || !cigar) return;
    setUndoVisible(true);
    Animated.sequence([
      Animated.delay(300),
      Animated.timing(undoOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.delay(4500),
      Animated.timing(undoOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) setUndoVisible(false);
    });
  }, [fromScan, cigar?.id]);

  const handleUndo = async () => {
    if (undoUsedRef.current || !cigar) return;
    undoUsedRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    track(EVENTS.SCAN_UNDO_TAPPED, { cigar_id: cigar.id });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Remove the 'owned' row the scan flow just inserted. Leave other
        // statuses (wishlist/smoked) alone — user may have set those manually.
        await supabase
          .from('humidor_items')
          .delete()
          .eq('user_id', user.id)
          .eq('cigar_id', cigar.id)
          .eq('status', 'owned');
      }
    } catch {
      // Non-blocking
    }
    setUndoVisible(false);
    router.replace('/identify/camera');
  };

  return (
    <>
    <ScrollView
      style={[styles.screen]}
      contentContainerStyle={{
        paddingTop: insets.top + SPACING.md,
        paddingBottom: insets.bottom + (fromScan ? 110 : 40),
      }}
      showsVerticalScrollIndicator={true}
      indicatorStyle="white"
      bounces={true}
      alwaysBounceVertical={true}
    >
      {/* Back / Home button */}
      <Button
        title={from === 'scan' ? 'Home' : from === 'humidor' ? 'Humidor' : 'Back'}
        variant="ghost"
        onPress={() => {
          if (from === 'scan') router.replace('/(tabs)');
          else if (from === 'humidor') router.replace('/(tabs)/humidor');
          else router.back();
        }}
        style={styles.backBtn}
      />

      {/* Hero */}
      <View style={styles.hero}>
        {cigar.image_url ? (
          <Image
            source={{ uri: cigar.image_url }}
            style={styles.heroImg}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.heroImage}>
            <Ionicons name="leaf-outline" size={48} color={COLORS.accent} />
          </View>
        )}
      </View>

      {/* Title */}
      <Text style={styles.brand}>{cigar.brand}</Text>
      <Text style={styles.name}>{cigar.line ?? cigar.name}</Text>
      {cigar.vitola && <Text style={styles.vitola}>{cigar.vitola}</Text>}
      {cigar.origin && (
        <Text style={styles.origin}>{cigar.origin}</Text>
      )}

      {/* Community Rating */}
      {communityRating && communityRating.count > 0 && (
        <View style={styles.communitySection}>
          <CommunityRating
            average={communityRating.average}
            count={communityRating.count}
            variant="full"
          />
        </View>
      )}

      {/* Meters */}
      <Card style={styles.metersCard}>
        <Meter label="Strength" value={cigar.strength} />
        <Meter label="Body" value={cigar.body} />
        <Meter label="Price" value={cigar.price_tier} />
      </Card>

      {/* Flavors */}
      {cigar.flavors.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Flavor Notes</Text>
          <View style={styles.flavors}>
            {cigar.flavors.map((f) => (
              <Badge key={f} label={f} />
            ))}
          </View>
        </View>
      )}

      {/* Description */}
      {cigar.description && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tasting Notes</Text>
          <Text style={styles.description}>{cigar.description}</Text>
        </View>
      )}

      {/* Details grid */}
      <Card style={styles.detailsGrid}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Wrapper</Text>
          <Text style={styles.detailValue}>{cigar.wrapper ?? '—'}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Binder</Text>
          <Text style={styles.detailValue}>{cigar.binder ?? '—'}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Filler</Text>
          <Text style={styles.detailValue}>{cigar.filler?.join(', ') ?? '—'}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Origin</Text>
          <Text style={styles.detailValue}>{cigar.origin ?? '—'}</Text>
        </View>
      </Card>

      {/* Drink Pairings — treat as Pro pre-hydration to avoid locked-state flash */}
      {(treatAsPro ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pair It With</Text>
          {getDrinkPairings(cigar).map((p, i) => (
            <View key={i} style={styles.pairingRow}>
              <Text style={styles.pairingDrink}>{p.drink}</Text>
              <Text style={styles.pairingReason}>{p.reason}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Pressable onPress={() => router.push('/paywall')} style={styles.section}>
          <Text style={styles.sectionTitle}>Pair It With</Text>
          <View style={styles.proLockedRow}>
            <Ionicons name="lock-closed-outline" size={16} color={COLORS.accent} />
            <Text style={styles.proLockedText}>Upgrade to Pro for drink pairings</Text>
          </View>
        </Pressable>
      ))}

      {/* My Review — only for smoked cigars */}
      {isSmoked && (
        <View style={styles.section}>
          <View style={styles.reviewHeader}>
            <Text style={styles.sectionTitle}>My Review</Text>
            {myReview && !editingReview && (
              <View style={styles.reviewActions}>
                <Pressable onPress={() => setEditingReview(true)} hitSlop={8}>
                  <Ionicons name="pencil-outline" size={18} color={COLORS.accent} />
                </Pressable>
                <Pressable onPress={handleDeleteReview} hitSlop={8}>
                  <Ionicons name="trash-outline" size={18} color={COLORS.muted} />
                </Pressable>
              </View>
            )}
          </View>

          {showReviewDisplay && (
            <Card style={styles.reviewCard}>
              <View style={styles.ratingDisplayRow}>
                <Text style={styles.ratingLabel}>Overall</Text>
                <StarRating value={myReview.overall_rating} size={18} />
              </View>
              {myReview.draw_rating && (
                <View style={styles.ratingDisplayRow}>
                  <Text style={styles.ratingLabel}>Draw</Text>
                  <StarRating value={myReview.draw_rating} size={14} />
                </View>
              )}
              {myReview.burn_rating && (
                <View style={styles.ratingDisplayRow}>
                  <Text style={styles.ratingLabel}>Burn</Text>
                  <StarRating value={myReview.burn_rating} size={14} />
                </View>
              )}
              {myReview.flavor_rating && (
                <View style={styles.ratingDisplayRow}>
                  <Text style={styles.ratingLabel}>Flavor</Text>
                  <StarRating value={myReview.flavor_rating} size={14} />
                </View>
              )}
              {myReview.review_text && (
                <Text style={styles.reviewDisplayText}>{myReview.review_text}</Text>
              )}
            </Card>
          )}

          {showReviewForm && (
            <Card style={styles.reviewCard}>
              {/* Overall — required */}
              <Text style={styles.ratingFormLabel}>Overall Rating *</Text>
              <StarRating value={overallRating} size={32} interactive onChange={setOverallRating} />

              {/* Draw */}
              <Text style={[styles.ratingFormLabel, { marginTop: SPACING.md }]}>Draw</Text>
              <StarRating value={drawRating} size={24} interactive onChange={setDrawRating} />

              {/* Burn */}
              <Text style={[styles.ratingFormLabel, { marginTop: SPACING.md }]}>Burn</Text>
              <StarRating value={burnRating} size={24} interactive onChange={setBurnRating} />

              {/* Flavor */}
              <Text style={[styles.ratingFormLabel, { marginTop: SPACING.md }]}>Flavor</Text>
              <StarRating value={flavorRating} size={24} interactive onChange={setFlavorRating} />

              {/* Review text */}
              <Text style={[styles.ratingFormLabel, { marginTop: SPACING.md }]}>Review</Text>
              <TextInput
                style={styles.reviewInput}
                value={reviewText}
                onChangeText={setReviewText}
                placeholder="Share your thoughts on this cigar..."
                placeholderTextColor={COLORS.subtle}
                multiline
                textAlignVertical="top"
              />

              <View style={styles.reviewButtons}>
                <Button
                  title={savingReview ? 'Saving...' : 'Save Review'}
                  onPress={handleSaveReview}
                  disabled={overallRating === 0 || savingReview}
                  loading={savingReview}
                  style={{ flex: 1 }}
                />
                {editingReview && (
                  <Button
                    title="Cancel"
                    variant="ghost"
                    onPress={() => {
                      if (myReview) {
                        setOverallRating(myReview.overall_rating);
                        setDrawRating(myReview.draw_rating ?? 0);
                        setBurnRating(myReview.burn_rating ?? 0);
                        setFlavorRating(myReview.flavor_rating ?? 0);
                        setReviewText(myReview.review_text ?? '');
                      }
                      setEditingReview(false);
                    }}
                    style={{ flex: 1 }}
                  />
                )}
              </View>
            </Card>
          )}
        </View>
      )}

      {/* Current status badges */}
      {hasAnyStatus && (
        <View style={styles.statusBadges}>
          {humidorItems.map((item) => (
            <Badge
              key={item.id}
              label={item.status}
              color={
                item.status === 'owned' ? COLORS.success :
                item.status === 'smoked' ? COLORS.accent :
                COLORS.info
              }
            />
          ))}
        </View>
      )}

      {/* Actions — treat as Pro pre-hydration to avoid Pro/free button flash */}
      {(treatAsPro ? (
        <View style={styles.actions}>
          {!isWishlisted && !isOwned && !isSmoked && (
            <Button title="Add to Wishlist" onPress={() => handleAddToHumidor('wishlist')} />
          )}
          {!isOwned && (
            <Button title="Mark as Owned" variant="secondary" onPress={() => handleAddToHumidor('owned')} />
          )}
          {!isSmoked && (
            <Button title="Log a Smoke" variant="secondary" onPress={() => handleAddToHumidor('smoked')} />
          )}
          {hasAnyStatus && (
            <Button
              title="Remove from Humidor"
              variant="ghost"
              onPress={() => {
                Alert.alert(
                  'Remove from Humidor',
                  `Are you sure you want to remove ${cigar.line ?? cigar.name} from all lists?`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Remove',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          for (const item of humidorItems) {
                            await supabase.from('humidor_items').delete().eq('id', item.id);
                          }
                          setHumidorItems([]);
                          setNotes('');
                          Alert.alert('Removed', 'Cigar removed from your humidor.');
                        } catch {
                          Alert.alert('Error', 'Failed to remove cigar');
                        }
                      },
                    },
                  ]
                );
              }}
              textStyle={{ color: '#CC4444' }}
            />
          )}
        </View>
      ) : (
        <View style={styles.actions}>
          {!isOwned && (
            <Button title="Mark as Owned" onPress={() => handleAddToHumidor('owned')} />
          )}
          <Button title="Wishlist, Smoked & More · Pro" variant="secondary" onPress={() => router.push('/paywall')} />
        </View>
      ))}

      {/* Notes */}
      {primaryItem && (
        <View style={styles.section}>
          <View style={styles.notesHeader}>
            <Text style={styles.sectionTitle}>My Notes</Text>
            {primaryItem.notes && !editingNotes && (
              <View style={styles.notesActions}>
                <Pressable onPress={() => setEditingNotes(true)} hitSlop={8}>
                  <Ionicons name="pencil-outline" size={18} color={COLORS.accent} />
                </Pressable>
                <Pressable onPress={handleDeleteNotes} hitSlop={8}>
                  <Ionicons name="trash-outline" size={18} color={COLORS.muted} />
                </Pressable>
              </View>
            )}
          </View>
          {editingNotes || !primaryItem.notes ? (
            <View>
              <TextInput
                style={styles.notesInput}
                value={notes}
                onChangeText={setNotes}
                placeholder="Add notes about this cigar..."
                placeholderTextColor={COLORS.subtle}
                multiline
                textAlignVertical="top"
              />
              <View style={styles.notesButtons}>
                <Button
                  title={savingNotes ? 'Saving...' : 'Save Notes'}
                  onPress={handleSaveNotes}
                  style={{ flex: 1 }}
                />
                {editingNotes && (
                  <Button
                    title="Cancel"
                    variant="ghost"
                    onPress={() => {
                      setNotes(primaryItem.notes ?? '');
                      setEditingNotes(false);
                    }}
                    style={{ flex: 1 }}
                  />
                )}
              </View>
            </View>
          ) : (
            <Pressable onPress={() => setEditingNotes(true)}>
              <Card style={styles.notesDisplay}>
                <Text style={styles.notesText}>{primaryItem.notes}</Text>
              </Card>
            </Pressable>
          )}
        </View>
      )}

      {/* Similar cigars */}
      {similar.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Similar Cigars</Text>
          {similar.slice(0, 4).map((s) => (
            <Card key={s.id} style={styles.similarCard} onPress={() => router.push(`/(tabs)/cigar/${s.id}`)}>
              <Text style={styles.similarName}>{s.line ?? s.name}</Text>
              <Text style={styles.similarBrand}>{s.brand}</Text>
            </Card>
          ))}
        </View>
      )}
    </ScrollView>

    {/* Undo snackbar — only after scan-confirm, only while the window is open */}
    {fromScan && undoVisible && (
      <Animated.View
        style={[
          styles.undoSnackbar,
          { opacity: undoOpacity, bottom: insets.bottom + 92 },
        ]}
      >
        <Text style={styles.undoText}>Wrong cigar?</Text>
        <Pressable onPress={handleUndo} hitSlop={12} style={styles.undoAction}>
          <Ionicons name="arrow-undo" size={16} color={COLORS.accent} />
          <Text style={styles.undoActionText}>Undo</Text>
        </Pressable>
      </Animated.View>
    )}

    {/* Scan-another FAB — only after a scan-confirm, so humidor scanning feels continuous */}
    {fromScan && (
      <Pressable
        onPress={() => router.replace('/identify/camera')}
        style={[styles.scanFab, { bottom: insets.bottom + 24 }]}
        hitSlop={8}
      >
        <Ionicons name="scan" size={20} color={COLORS.bg} />
        <Text style={styles.scanFabText}>Scan Another</Text>
      </Pressable>
    )}
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingHorizontal: SPACING.md,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontFamily: 'Cormorant',
    fontSize: 18,
    color: COLORS.text,
    fontWeight: '700',
  },
  backBtn: {
    alignSelf: 'flex-start',
    marginBottom: SPACING.sm,
  },
  scanFab: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.full,
    paddingVertical: 14,
    paddingHorizontal: 22,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  scanFabText: {
    fontFamily: 'Cormorant',
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.bg,
    letterSpacing: 0.3,
  },
  undoSnackbar: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(10, 26, 15, 0.95)',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.full,
    paddingVertical: 10,
    paddingHorizontal: 18,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  undoText: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  undoAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  undoActionText: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.accent,
    letterSpacing: 0.3,
  },
  hero: {
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  heroImg: {
    width: 160,
    height: 160,
    borderRadius: 24,
    backgroundColor: COLORS.card,
  },
  heroImage: {
    width: 120,
    height: 120,
    borderRadius: 24,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    fontFamily: 'Cormorant',
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.accent,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  name: {
    fontFamily: FONTS.display,
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },
  vitola: {
    fontFamily: 'Cormorant',
    fontSize: 15,
    color: COLORS.muted,
    textAlign: 'center',
    marginTop: 4,
  },
  origin: {
    fontFamily: 'Cormorant',
    fontSize: 13,
    color: COLORS.subtle,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: SPACING.md,
  },
  communitySection: {
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  metersCard: {
    marginBottom: SPACING.md,
  },
  section: {
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontFamily: 'Cormorant',
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  flavors: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  description: {
    fontFamily: 'Cormorant',
    fontSize: 15,
    color: COLORS.muted,
    lineHeight: 22,
  },
  pairingRow: {
    marginBottom: SPACING.sm,
  },
  pairingDrink: {
    fontFamily: 'Cormorant',
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  pairingReason: {
    fontFamily: 'Cormorant',
    fontSize: 13,
    color: COLORS.muted,
    lineHeight: 18,
    marginTop: 2,
  },
  proLockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: SPACING.sm,
  },
  proLockedText: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.accent,
  },
  detailsGrid: {
    marginBottom: SPACING.md,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  detailLabel: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.muted,
  },
  detailValue: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  statusBadges: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: SPACING.sm,
  },
  actions: {
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },

  // Review styles
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  reviewActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  reviewCard: {
    marginBottom: 0,
  },
  ratingDisplayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  ratingLabel: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.muted,
  },
  reviewDisplayText: {
    fontFamily: 'Cormorant',
    fontSize: 15,
    color: COLORS.text,
    lineHeight: 22,
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  ratingFormLabel: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 6,
  },
  reviewInput: {
    fontFamily: 'Cormorant',
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    color: COLORS.text,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 100,
    marginTop: 4,
  },
  reviewButtons: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },

  // Notes styles
  notesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  notesActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  notesInput: {
    fontFamily: 'Cormorant',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    color: COLORS.text,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 100,
  },
  notesButtons: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  notesDisplay: {
    marginBottom: 0,
  },
  notesText: {
    fontFamily: 'Cormorant',
    fontSize: 15,
    color: COLORS.muted,
    lineHeight: 22,
  },
  similarCard: {
    marginBottom: SPACING.sm,
  },
  similarName: {
    fontFamily: 'Cormorant',
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  similarBrand: {
    fontFamily: 'Cormorant',
    fontSize: 13,
    color: COLORS.muted,
    marginTop: 2,
  },
});
