import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, TextInput,
  ScrollView, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, FONTS, RADIUS } from '@/src/constants/theme';
import { useReviewsStore, type FragranceReview } from '@/src/stores/useReviewsStore';
import type { Fragrance } from '@/src/stores/useCatalogStore';

interface Props {
  visible: boolean;
  fragrance: Fragrance | null;
  existing?: FragranceReview | null;
  onClose: () => void;
  onSaved?: (id: string) => void;
}

/**
 * ReviewSheet — bottom sheet for writing or editing a community review.
 * Rating is required; title and body are optional.
 */
export function ReviewSheet({ visible, fragrance, existing, onClose, onSaved }: Props) {
  const upsert = useReviewsStore((s) => s.upsert);
  const remove = useReviewsStore((s) => s.remove);

  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => {
    if (!visible) return;
    if (existing) {
      setRating(existing.rating);
      setTitle(existing.title ?? '');
      setBody(existing.body ?? '');
    } else {
      setRating(0);
      setTitle('');
      setBody('');
    }
  }, [visible, existing]);

  const handleSave = () => {
    if (!fragrance || rating === 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const id = upsert({
      fragrance_id: fragrance.id,
      rating,
      title: title.trim().length > 0 ? title.trim() : undefined,
      body: body.trim().length > 0 ? body.trim() : undefined,
    });
    onSaved?.(id);
    onClose();
  };

  const handleDelete = () => {
    if (!existing) return;
    Alert.alert('Delete Review', 'Remove your review permanently?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: () => {
          remove(existing.id);
          onClose();
        },
      },
    ]);
  };

  if (!fragrance) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrap}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            <Text style={styles.eyebrow}>{existing ? 'EDIT REVIEW' : 'WRITE A REVIEW'}</Text>
            <Text style={styles.cursive}>{existing ? 'update your take' : 'share your verdict'}</Text>
            <Text style={styles.fragName}>{fragrance.name}</Text>
            <Text style={styles.fragBrand}>{fragrance.brand}</Text>

            {/* Star rating */}
            <View style={styles.starsSection}>
              <Text style={styles.sectionLabel}>YOUR RATING</Text>
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Pressable
                    key={n}
                    onPress={() => { Haptics.selectionAsync(); setRating(n === rating ? 0 : n); }}
                    hitSlop={8}
                  >
                    <Ionicons
                      name={n <= rating ? 'star' : 'star-outline'}
                      size={40}
                      color={n <= rating ? COLORS.accent : COLORS.muted}
                    />
                  </Pressable>
                ))}
              </View>
              {rating === 0 && (
                <Text style={styles.ratingHint}>Tap a star — rating is required</Text>
              )}
              {rating > 0 && (
                <Text style={styles.ratingLabel}>{RATING_LABELS[rating]}</Text>
              )}
            </View>

            {/* Title */}
            <View style={styles.fieldWrap}>
              <Text style={styles.sectionLabel}>HEADLINE (OPTIONAL)</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Sum it up in a few words…"
                placeholderTextColor={COLORS.subtle}
                maxLength={80}
                style={styles.titleInput}
              />
            </View>

            {/* Body */}
            <View style={styles.fieldWrap}>
              <Text style={styles.sectionLabel}>YOUR REVIEW (OPTIONAL)</Text>
              <TextInput
                value={body}
                onChangeText={setBody}
                placeholder="How does it wear? Who is it for? Any surprises?"
                placeholderTextColor={COLORS.subtle}
                multiline
                maxLength={1000}
                style={styles.bodyInput}
              />
              <Text style={styles.charCount}>{body.length}/1000</Text>
            </View>
          </ScrollView>

          <View style={styles.ctaWrap}>
            {existing ? (
              <Pressable onPress={handleDelete} style={styles.deleteBtn}>
                <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
              </Pressable>
            ) : (
              <Pressable onPress={onClose} style={styles.cancelBtn}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
            )}
            <Pressable
              onPress={handleSave}
              disabled={rating === 0}
              style={[styles.saveBtn, rating === 0 && { opacity: 0.4 }]}
            >
              <Ionicons name="checkmark" size={16} color={COLORS.white} style={{ marginRight: 6 }} />
              <Text style={styles.saveText}>{existing ? 'Update Review' : 'Submit Review'}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const RATING_LABELS: Record<number, string> = {
  1: 'Not for me',
  2: 'Below expectations',
  3: 'Decent',
  4: 'Really good',
  5: 'Absolute favourite',
};

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(42,31,24,0.45)' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: SPACING.lg,
    maxHeight: '90%',
  },
  handle: {
    alignSelf: 'center',
    width: 44, height: 5, borderRadius: 3,
    backgroundColor: COLORS.border,
    marginTop: 8, marginBottom: 4,
  },
  body: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.xl },
  eyebrow: { ...TYPE.eyebrow },
  cursive: { fontFamily: 'PinyonScript_400Regular', fontSize: 28, color: COLORS.accent, lineHeight: 44, marginTop: 2, paddingLeft: 8 },
  fragName: { fontFamily: FONTS.serif, fontSize: 26, fontWeight: '600', color: COLORS.text, marginTop: SPACING.sm, lineHeight: 30 },
  fragBrand: { ...TYPE.bodySmall, marginTop: 2 },

  starsSection: { marginTop: SPACING.xl, alignItems: 'center' },
  sectionLabel: { ...TYPE.eyebrow, marginBottom: SPACING.sm },
  starsRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: 4 },
  ratingHint: { ...TYPE.caption, color: COLORS.muted, fontStyle: 'italic', marginTop: SPACING.sm },
  ratingLabel: { ...TYPE.body, color: COLORS.accent, fontWeight: '600', marginTop: SPACING.sm },

  fieldWrap: { marginTop: SPACING.xl },
  titleInput: {
    ...TYPE.body,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  bodyInput: {
    ...TYPE.body,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 12,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  charCount: { ...TYPE.caption, color: COLORS.subtle, textAlign: 'right', marginTop: 4 },

  ctaWrap: {
    flexDirection: 'row', gap: SPACING.sm,
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border,
  },
  cancelBtn: {
    paddingVertical: 14, paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.full,
  },
  cancelText: { ...TYPE.label, color: COLORS.muted, letterSpacing: 1 },
  deleteBtn: {
    width: 48, height: 48,
    borderRadius: RADIUS.full,
    borderWidth: 1, borderColor: COLORS.danger,
    alignItems: 'center', justifyContent: 'center',
  },
  saveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.accent,
    paddingVertical: 14,
    borderRadius: RADIUS.full,
  },
  saveText: { ...TYPE.label, color: COLORS.white, letterSpacing: 1.5 },
});
