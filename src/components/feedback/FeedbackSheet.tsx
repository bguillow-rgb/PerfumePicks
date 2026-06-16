// In-app feedback sheet — a private, always-on line to the founder. Surfaced
// from a Profile row. The user picks a category, types a message, optionally
// leaves an email, and submits. On success a brief thank-you state shows, then
// it closes. Writes to the shared Pour Picks feedback hub (see feedback.ts).

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
import { submitFeedback, type FeedbackCategory } from '@/src/lib/feedback';
import { track, captureException, EVENTS } from '@/src/lib/observability';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const CATEGORIES: { key: FeedbackCategory; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'bug', label: 'Something broke', icon: 'bug-outline' },
  { key: 'idea', label: 'Idea / request', icon: 'bulb-outline' },
  { key: 'love', label: 'I love it', icon: 'heart-outline' },
  { key: 'other', label: 'Other', icon: 'chatbubble-ellipses-outline' },
];

const MIN_LEN = 4;
const MAX_LEN = 2000;

export function FeedbackSheet({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState<FeedbackCategory>('idea');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  // Reset on each open so the sheet never shows stale text.
  useEffect(() => {
    if (visible) {
      setCategory('idea');
      setMessage('');
      setEmail('');
      setSubmitting(false);
      setSent(false);
      track(EVENTS.FEEDBACK_OPENED, {});
    }
  }, [visible]);

  const canSubmit = message.trim().length >= MIN_LEN && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const result = await submitFeedback({ message, category, email });
      if (result.ok) {
        track(EVENTS.FEEDBACK_SUBMITTED, { category });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setSent(true);
        setTimeout(onClose, 1400);
      } else {
        track(EVENTS.FEEDBACK_FAILED, { reason: result.reason ?? 'unknown' });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setSubmitting(false);
      }
    } catch (e: unknown) {
      captureException(e, { area: 'feedback_submit' });
      track(EVENTS.FEEDBACK_FAILED, { reason: 'throw' });
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.screen, { paddingTop: insets.top + SPACING.md }]}>
          <View style={styles.header}>
            <Text style={styles.title}>Send Feedback</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.close}>{sent ? 'Done' : 'Cancel'}</Text>
            </Pressable>
          </View>

          {sent ? (
            <View style={styles.sentWrap}>
              <Ionicons name="checkmark-circle" size={56} color={COLORS.accent} />
              <Text style={styles.sentTitle}>Thank you</Text>
              <Text style={styles.sentBody}>
                This goes straight to the founder. We read every message.
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.subtitle}>
                Tell us what&apos;s working, what isn&apos;t, or what you wish it did.
                This goes straight to the founder.
              </Text>

              <ScrollView
                style={{ flex: 1 }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: SPACING.md }}
              >
                <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
                  <View>
                    <View style={styles.chips}>
                      {CATEGORIES.map((c) => {
                        const active = c.key === category;
                        return (
                          <Pressable
                            key={c.key}
                            onPress={() => setCategory(c.key)}
                            style={[styles.chip, active && styles.chipActive]}
                          >
                            <Ionicons
                              name={c.icon}
                              size={15}
                              color={active ? COLORS.white : COLORS.muted}
                            />
                            <Text style={[styles.chipText, active && styles.chipTextActive]}>
                              {c.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    <Text style={styles.label}>Your message</Text>
                    <TextInput
                      style={[styles.input, styles.multiline]}
                      placeholder="The more detail, the better."
                      placeholderTextColor={COLORS.subtle}
                      value={message}
                      onChangeText={setMessage}
                      multiline
                      numberOfLines={6}
                      textAlignVertical="top"
                      maxLength={MAX_LEN}
                      autoFocus
                    />
                    <Text style={styles.charCount}>{message.length} / {MAX_LEN}</Text>

                    <Text style={styles.label}>Email (optional)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="So we can reply"
                      placeholderTextColor={COLORS.subtle}
                      value={email}
                      onChangeText={setEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      maxLength={200}
                    />
                  </View>
                </TouchableWithoutFeedback>
              </ScrollView>

              <Pressable
                onPress={handleSubmit}
                disabled={!canSubmit}
                style={[
                  styles.submit,
                  !canSubmit && { opacity: 0.6 },
                  { marginBottom: insets.bottom + SPACING.md },
                ]}
              >
                {submitting ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <>
                    <Ionicons name="send" size={16} color={COLORS.white} />
                    <Text style={styles.submitText}>Send feedback</Text>
                  </>
                )}
              </Pressable>
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
    fontWeight: '600',
    fontSize: 15,
    color: COLORS.accent,
  },
  subtitle: {
    fontFamily: FONTS.body,
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: SPACING.md,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
    marginBottom: SPACING.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card2,
  },
  chipActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  chipText: {
    fontFamily: FONTS.body,
    fontWeight: '500',
    fontSize: 13,
    color: COLORS.muted,
  },
  chipTextActive: {
    color: COLORS.white,
  },
  label: {
    fontFamily: FONTS.body,
    fontWeight: '600',
    fontSize: 13,
    color: COLORS.text,
    marginTop: SPACING.sm,
    marginBottom: 6,
  },
  input: {
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontFamily: FONTS.body,
    fontSize: 16,
    color: COLORS.text,
  },
  multiline: {
    minHeight: 140,
  },
  charCount: {
    fontFamily: FONTS.body,
    fontSize: 11,
    color: COLORS.subtle,
    textAlign: 'right',
    marginTop: 4,
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
    fontWeight: '600',
    fontSize: 16,
    color: COLORS.white,
    letterSpacing: 0.3,
  },
  sentWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingBottom: SPACING.xl,
  },
  sentTitle: {
    fontFamily: FONTS.serif,
    fontSize: 24,
    fontWeight: '600',
    color: COLORS.text,
  },
  sentBody: {
    fontFamily: FONTS.body,
    fontSize: 14,
    color: COLORS.muted,
    textAlign: 'center',
    paddingHorizontal: SPACING.xl,
  },
});
