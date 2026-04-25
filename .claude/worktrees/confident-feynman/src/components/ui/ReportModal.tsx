import { Modal, View, Text, Pressable, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { getDeviceId } from '@/lib/deviceId';
import { Alert } from '@/src/components/ui/StyledAlert';
import { COLORS, SPACING, RADIUS, FONTS } from '@/src/constants/theme';

// Content-report sheet. Required by Apple App Review Guideline 1.2 so every
// piece of user-generated content has a one-tap report path. Inserts a row
// into `content_reports` for admin review.

export type ReportTargetKind = 'cigar_image' | 'cigar_review' | 'cigar_submission';

export type ReportReason = 'inappropriate' | 'trademark' | 'spam' | 'incorrect' | 'other';

const REASON_LABELS: Record<ReportReason, string> = {
  inappropriate: 'Inappropriate or offensive',
  trademark: 'Trademark / rights issue',
  spam: 'Spam or junk',
  incorrect: 'Inaccurate or misleading',
  other: 'Other',
};

interface ReportModalProps {
  visible: boolean;
  targetKind: ReportTargetKind;
  targetId: string;
  /** Optional cigar id — used to group reports when target is an image / review. */
  cigarId?: string;
  onClose: () => void;
}

export function ReportModal({ visible, targetKind, targetId, cigarId, onClose }: ReportModalProps) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setReason(null);
      setDetails('');
      setSubmitting(false);
    }
  }, [visible]);

  const submit = async () => {
    if (!reason) return;
    setSubmitting(true);
    try {
      const [{ data: authData }, deviceId] = await Promise.all([
        supabase.auth.getUser(),
        getDeviceId(),
      ]);
      const { error } = await supabase.from('content_reports').insert({
        reporter_user_id: authData?.user?.id ?? null,
        reporter_device_id: deviceId,
        target_kind: targetKind,
        target_id: targetId,
        cigar_id: cigarId ?? null,
        reason,
        details: details.trim() || null,
      });
      if (error) throw error;
      onClose();
      Alert.alert(
        'Report received',
        "Thanks — we'll review this within 24 hours and remove it if it violates our guidelines.",
      );
    } catch (e: any) {
      Alert.alert('Could not submit', e?.message ?? 'Please try again later.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Report this content</Text>
          <Text style={styles.subtitle}>
            Reports are reviewed within 24 hours. Thanks for keeping Stick Picks clean.
          </Text>

          <View style={styles.reasons}>
            {(Object.keys(REASON_LABELS) as ReportReason[]).map((k) => {
              const selected = reason === k;
              return (
                <Pressable
                  key={k}
                  onPress={() => setReason(k)}
                  style={[styles.reasonRow, selected && styles.reasonRowSelected]}
                >
                  <Ionicons
                    name={selected ? 'radio-button-on' : 'radio-button-off'}
                    size={18}
                    color={selected ? COLORS.accent : COLORS.muted}
                  />
                  <Text style={[styles.reasonText, selected && styles.reasonTextSelected]}>
                    {REASON_LABELS[k]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <TextInput
            style={styles.details}
            value={details}
            onChangeText={setDetails}
            placeholder="Add more detail (optional)"
            placeholderTextColor={COLORS.subtle}
            multiline
            maxLength={500}
          />

          <View style={styles.actions}>
            <Pressable onPress={onClose} style={styles.cancelBtn} hitSlop={6}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={submit}
              disabled={!reason || submitting}
              style={[styles.submitBtn, (!reason || submitting) && { opacity: 0.5 }]}
            >
              {submitting ? (
                <ActivityIndicator color={COLORS.bg} />
              ) : (
                <Text style={styles.submitText}>Submit report</Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
  },
  sheet: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingTop: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  title: {
    fontFamily: FONTS.display,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: COLORS.accent,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: COLORS.muted,
    lineHeight: 19,
    marginBottom: SPACING.md,
  },
  reasons: {
    gap: 2,
    marginBottom: SPACING.md,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: RADIUS.sm,
  },
  reasonRowSelected: {
    backgroundColor: COLORS.card2,
  },
  reasonText: {
    fontFamily: FONTS.body,
    fontSize: 14,
    color: COLORS.text,
  },
  reasonTextSelected: {
    fontWeight: '700',
  },
  details: {
    fontFamily: FONTS.body,
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    padding: SPACING.sm,
    color: COLORS.text,
    fontSize: 14,
    minHeight: 70,
    textAlignVertical: 'top',
    marginBottom: SPACING.sm,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  cancelText: {
    fontFamily: FONTS.body,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.muted,
  },
  submitBtn: {
    backgroundColor: COLORS.accent,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 140,
  },
  submitText: {
    fontFamily: FONTS.body,
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.bg,
  },
});
