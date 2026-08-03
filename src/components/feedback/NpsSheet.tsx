// NPS sheet — "How likely are you to recommend Perfume Picks?" 0-10, optional
// comment. Independent of the App Store review prompt (a low score never routes
// to StoreReview). The score + comment land in the feedback hub as kind:'nps'.

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, FONTS, RADIUS, SPACING } from '@/src/constants/theme';
import { submitFeedback } from '@/src/lib/feedback';
import { track, captureException, EVENTS } from '@/src/lib/observability';

interface Props {
  visible: boolean;
  /** Hide the sheet. Always fires; releases the modal gate. */
  onClose: () => void;
  /**
   * The user actually answered — a confirmed write, or an explicit "Not now".
   * Only this starts the 90-day cooldown. A failed submit must NOT fire it, or
   * a network blip costs the user a quarter and costs us the response.
   */
  onResolved: () => void;
}

const SCORES = Array.from({ length: 11 }, (_, i) => i); // 0..10

export function NpsSheet({ visible, onClose, onResolved }: Props) {
  const insets = useSafeAreaInsets();
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (visible) {
      setScore(null);
      setComment('');
      setSubmitting(false);
      setSent(false);
      setFailed(false);
      track(EVENTS.NPS_SHOWN, {});
    }
  }, [visible]);

  const handleSubmit = async () => {
    if (score === null || submitting) return;
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const text = comment.trim();
    try {
      const result = await submitFeedback({
        kind: 'nps',
        rating: score,
        message: text || undefined,
      });
      if (result.ok) {
        track(EVENTS.NPS_SUBMITTED, { score, has_comment: text.length > 0 });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setSent(true);
        onResolved();
        setTimeout(onClose, 1200);
      } else {
        // Stay open and let them retry. Closing here is what made a backend
        // failure indistinguishable from a normal dismiss.
        track(EVENTS.NPS_SUBMIT_FAILED, { score, reason: result.reason ?? 'unknown' });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setSubmitting(false);
        setFailed(true);
      }
    } catch (e) {
      captureException(e, { area: 'nps_submit' });
      track(EVENTS.NPS_SUBMIT_FAILED, { score, reason: 'exception' });
      setSubmitting(false);
      setFailed(true);
    }
  };

  const handleDismiss = () => {
    if (!sent) {
      track(EVENTS.NPS_DISMISSED, {});
      // Explicit decline still counts as answered — start the cooldown so we
      // don't re-ask next launch.
      onResolved();
    }
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleDismiss}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.screen, { paddingTop: insets.top + SPACING.md }]}>
          <View style={styles.header}>
            <Text style={styles.title}>{sent ? 'Thank you' : 'Quick question'}</Text>
            <Pressable onPress={handleDismiss} hitSlop={12} testID="nps-dismiss">
              <Text style={styles.close}>{sent ? 'Done' : 'Not now'}</Text>
            </Pressable>
          </View>

          {sent ? (
            <View style={styles.sentWrap} testID="nps-thanks">
              <Ionicons name="checkmark-circle" size={56} color={COLORS.accent} />
              <Text style={styles.sentBody}>Appreciate it — this helps a lot.</Text>
            </View>
          ) : (
            <>
              <Text style={styles.subtitle}>
                How likely are you to recommend Perfume Picks to a friend?
              </Text>

              <ScrollView
                style={{ flex: 1 }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: insets.bottom + SPACING.md }}
              >
                <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
                  <View>
                    <View style={styles.scoreRow}>
                      {SCORES.map((n) => {
                        const active = n === score;
                        return (
                          <Pressable
                            key={n}
                            testID={`nps-score-${n}`}
                            onPress={() => setScore(n)}
                            style={[styles.scoreChip, active && styles.scoreChipActive]}
                          >
                            <Text style={[styles.scoreText, active && styles.scoreTextActive]}>
                              {n}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <View style={styles.scaleLabels}>
                      <Text style={styles.scaleLabel}>Not likely</Text>
                      <Text style={styles.scaleLabel}>Very likely</Text>
                    </View>

                    <Text style={styles.label}>Why? (optional)</Text>
                    <TextInput
                      testID="nps-comment"
                      style={[styles.input, styles.multiline]}
                      placeholder="Tell us more"
                      placeholderTextColor={COLORS.subtle}
                      value={comment}
                      onChangeText={setComment}
                      multiline
                      numberOfLines={4}
                      textAlignVertical="top"
                      maxLength={1000}
                    />

                    {failed && (
                      <Text style={styles.error} testID="nps-error">
                        {"That didn't send. Check your connection and try again."}
                      </Text>
                    )}

                    <Pressable
                      testID="nps-submit"
                      onPress={handleSubmit}
                      disabled={score === null || submitting}
                      style={[
                        styles.submit,
                        (score === null || submitting) && { opacity: 0.6 },
                        { marginTop: SPACING.lg },
                      ]}
                    >
                      {submitting ? (
                        <ActivityIndicator color={COLORS.white} />
                      ) : (
                        <Text style={styles.submitText}>{failed ? 'Try again' : 'Submit'}</Text>
                      )}
                    </Pressable>
                  </View>
                </TouchableWithoutFeedback>
              </ScrollView>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingHorizontal: SPACING.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  title: {
    fontFamily: FONTS.serif,
    fontSize: 24,
    fontWeight: '600',
    color: COLORS.text,
  },
  close: {
    fontFamily: FONTS.body,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.accent,
  },
  subtitle: {
    fontFamily: FONTS.body,
    fontSize: 15,
    color: COLORS.muted,
    marginBottom: SPACING.md,
  },
  scoreRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  scoreChip: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreChipActive: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accent,
  },
  scoreText: {
    fontFamily: FONTS.body,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.muted,
  },
  scoreTextActive: {
    color: COLORS.white,
  },
  scaleLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
  },
  scaleLabel: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: COLORS.subtle,
  },
  label: {
    fontFamily: FONTS.body,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: SPACING.lg,
    marginBottom: 6,
  },
  input: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontFamily: FONTS.body,
    fontSize: 16,
    color: COLORS.text,
  },
  error: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: COLORS.danger,
    marginTop: SPACING.md,
  },
  multiline: {
    minHeight: 100,
  },
  submit: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.full,
    paddingVertical: 14,
  },
  submitText: {
    fontFamily: FONTS.body,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
    letterSpacing: 0.3,
  },
  sentWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  sentBody: {
    fontFamily: FONTS.body,
    fontSize: 15,
    color: COLORS.muted,
    textAlign: 'center',
    paddingHorizontal: SPACING.xl,
  },
});
