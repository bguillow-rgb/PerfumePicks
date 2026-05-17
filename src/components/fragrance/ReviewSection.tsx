import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING, TYPE, RADIUS, FONTS } from '@/src/constants/theme';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useWardrobeStore } from '@/src/stores/useWardrobeStore';
import { useProStore } from '@/src/stores/useProStore';
import { ProGate } from '@/src/components/ui/ProGate';

interface Review {
  id: string;
  user_id: string;
  rating_overall: number;
  rating_longevity: number | null;
  rating_sillage: number | null;
  rating_value: number | null;
  body: string | null;
  helpful_count: number;
  created_at: string;
  profiles?: { display_name: string | null } | null;
}

interface Props {
  fragranceId: string;
}

/**
 * Community reviews section for fragrance detail.
 * Shows review form + list of reviews sorted by helpful_count.
 * Compact card-based layout per LX-1.
 */
export function ReviewSection({ fragranceId }: Props) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [myReview, setMyReview] = useState<Review | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const wardrobeItems = useWardrobeStore((s) => s.items);

  const loadReviews = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const { data: { user } } = await supabase.auth.getUser();
    setUserId(user?.id ?? null);

    const { data } = await supabase
      .from('fragrance_reviews')
      .select('*, profiles(display_name)')
      .eq('fragrance_id', fragranceId)
      .order('helpful_count', { ascending: false })
      .limit(20);

    if (data) {
      setReviews(data);
      if (user) {
        const mine = data.find((r) => r.user_id === user.id);
        if (mine) setMyReview(mine);
      }
    }
  }, [fragranceId]);

  useEffect(() => { loadReviews(); }, [loadReviews]);

  const handleSubmit = async () => {
    if (rating === 0 || !userId) return;
    setSubmitting(true);
    const { error } = await supabase.from('fragrance_reviews').upsert({
      user_id: userId,
      fragrance_id: fragranceId,
      rating_overall: rating,
      body: body.trim() || null,
    }, { onConflict: 'user_id,fragrance_id' });
    setSubmitting(false);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowForm(false);
    setRating(0);
    setBody('');
    loadReviews();
  };

  const handleVote = async (reviewId: string, value: boolean) => {
    if (!userId) return;
    await supabase.from('review_helpful_votes').upsert(
      { user_id: userId, review_id: reviewId, value },
      { onConflict: 'user_id,review_id' },
    );
    loadReviews();
  };

  const ownsFragrance = wardrobeItems.some((i) => i.fragrance_id === fragranceId);

  return (
    <View style={styles.wrap}>
      {/* Header with write-review CTA */}
      <View style={styles.headerRow}>
        <Text style={styles.count}>
          {reviews.length} review{reviews.length !== 1 ? 's' : ''}
        </Text>
        {!myReview && userId && (
          useProStore.getState().isPro ? (
            <Pressable onPress={() => setShowForm(!showForm)} style={styles.writeBtn}>
              <Ionicons name="create-outline" size={14} color={COLORS.accent} />
              <Text style={styles.writeBtnText}>Write a Review</Text>
            </Pressable>
          ) : (
            <ProGate variant="replace" label="Write reviews with Pro">
              <View />
            </ProGate>
          )
        )}
      </View>

      {/* Review form */}
      {showForm && (
        <View style={styles.form}>
          <Text style={styles.formLabel}>YOUR RATING</Text>
          <View style={styles.starRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => setRating(n)}>
                <Ionicons
                  name={n <= rating ? 'star' : 'star-outline'}
                  size={28}
                  color={n <= rating ? COLORS.accent : COLORS.muted}
                />
              </Pressable>
            ))}
          </View>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Share your thoughts (optional)"
            placeholderTextColor={COLORS.subtle}
            multiline
            style={styles.bodyInput}
            maxLength={1000}
          />
          <Pressable
            style={[styles.submitBtn, (rating === 0 || submitting) && { opacity: 0.4 }]}
            onPress={handleSubmit}
            disabled={rating === 0 || submitting}
          >
            <Text style={styles.submitText}>Submit Review</Text>
          </Pressable>
        </View>
      )}

      {/* Reviews list — compact cards */}
      {reviews.map((r) => (
        <View key={r.id} style={styles.reviewCard}>
          <View style={styles.reviewHeader}>
            <Text style={styles.reviewAuthor}>
              {r.profiles?.display_name || 'Anonymous'}
              {wardrobeItems.some((i) => i.fragrance_id === fragranceId && r.user_id === userId) && (
                <Text style={styles.ownsBadge}> · Owns this</Text>
              )}
            </Text>
            <View style={styles.reviewStars}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Ionicons
                  key={n}
                  name={n <= r.rating_overall ? 'star' : 'star-outline'}
                  size={12}
                  color={n <= r.rating_overall ? COLORS.accent : COLORS.subtle}
                />
              ))}
            </View>
          </View>
          {r.body && <Text style={styles.reviewBody} numberOfLines={4}>{r.body}</Text>}
          <View style={styles.reviewFooter}>
            <Text style={styles.reviewDate}>
              {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </Text>
            <Pressable onPress={() => handleVote(r.id, true)} style={styles.helpfulBtn}>
              <Ionicons name="thumbs-up-outline" size={12} color={COLORS.muted} />
              <Text style={styles.helpfulText}>
                {r.helpful_count > 0 ? r.helpful_count : ''} Helpful
              </Text>
            </Pressable>
          </View>
        </View>
      ))}

      {reviews.length === 0 && !showForm && (
        <Text style={styles.emptyText}>No reviews yet. Be the first!</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: SPACING.sm },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { ...TYPE.bodySmall, color: COLORS.muted },
  writeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  writeBtnText: { ...TYPE.label, fontSize: 12, color: COLORS.accent },

  form: {
    backgroundColor: COLORS.card, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.md, gap: SPACING.sm,
  },
  formLabel: { ...TYPE.eyebrow, fontSize: 10 },
  starRow: { flexDirection: 'row', gap: 4 },
  bodyInput: {
    ...TYPE.body, minHeight: 60,
    backgroundColor: COLORS.bg, borderRadius: RADIUS.md,
    padding: SPACING.sm, textAlignVertical: 'top',
  },
  submitBtn: {
    backgroundColor: COLORS.accent, borderRadius: RADIUS.full,
    paddingVertical: 10, alignItems: 'center',
  },
  submitText: { ...TYPE.label, color: COLORS.white, letterSpacing: 1 },

  reviewCard: {
    backgroundColor: COLORS.card, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.md, gap: 6,
  },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reviewAuthor: { ...TYPE.label, fontSize: 12, color: COLORS.text },
  ownsBadge: { color: COLORS.accent, fontWeight: '500' },
  reviewStars: { flexDirection: 'row', gap: 1 },
  reviewBody: { ...TYPE.bodySmall, color: COLORS.text, lineHeight: 18 },
  reviewFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  reviewDate: { ...TYPE.caption, fontSize: 10 },
  helpfulBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  helpfulText: { ...TYPE.caption, fontSize: 10 },
  emptyText: { ...TYPE.bodySmall, color: COLORS.muted, fontStyle: 'italic', textAlign: 'center', paddingVertical: SPACING.md },
});
