// In-app feedback sheet — a private, always-on line to the founder. Surfaced
// from a Profile row. The user picks a category, types a message, optionally
// leaves an email, and submits. On success a brief thank-you state shows, then
// it closes. Writes to the shared Pour Picks feedback hub (see feedback.ts).

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Modal,
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

const MIN_LEN = 10; // long enough to block accidental mid-sentence submits ("I am", "I'm not")
const MAX_LEN = 2000;

export function FeedbackSheet({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState<FeedbackCategory>('idea');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  // Keyboard handling. A pageSheet Modal + KeyboardAvoidingView measures its
  // frame wrong, automaticallyAdjustKeyboardInsets only *permits* scrolling,
  // and scrollToEnd() overshoots (it parks the email field at the keyboard and
  // shoves the message box off the top). So: pad the scroll content by the
  // measured keyboard height; on focus/growth scroll so the "Your message"
  // label sits at the top of the visible area (the chips scroll away, the
  // input stays put); and cap the input's height to the room left above the
  // keys so the caret can never be hidden — the input scrolls internally
  // instead. At large Dynamic Type with the keyboard up there is very little
  // room, and that cap is what keeps the form usable.
  const scrollRef = useRef<ScrollView>(null);
  const scrollH = useRef(0); // ScrollView frame height
  const inputRect = useRef({ y: 0, h: 0 }); // message input, in content coords
  const [kbHeight, setKbHeight] = useState(0);
  const [inputCap, setInputCap] = useState(200);
  const LABEL_ALLOWANCE = 36; // "Your message" label + its margins
  const revealInput = () => {
    const y = Math.max(0, inputRect.current.y - LABEL_ALLOWANCE);
    scrollRef.current?.scrollTo({ y, animated: true });
  };
  // Defer a frame so onLayout has reported the latest sizes first.
  const revealInputSoon = () => requestAnimationFrame(revealInput);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      const h = e.endCoordinates.height;
      setKbHeight(h);
      // Room left above the keys, minus the label and the char counter.
      const visible = scrollH.current - h;
      setInputCap(visible > 0 ? Math.max(96, visible - LABEL_ALLOWANCE - 32) : 200);
      revealInputSoon();
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      setKbHeight(0);
      setInputCap(200);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

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
        <View style={[styles.screen, { paddingTop: insets.top + SPACING.md }]}>
          {/* Send lives in the header, never pinned above the keyboard — a
              bottom-anchored button sits directly on the iOS predictive-text
              bar and collects accidental mid-sentence submits. */}
          <View style={styles.header}>
            <Pressable onPress={onClose} hitSlop={12} style={styles.headerSide}>
              <Text style={styles.close} numberOfLines={1}>
                {sent ? 'Done' : 'Cancel'}
              </Text>
            </Pressable>
            <Text style={styles.title}>Send Feedback</Text>
            <View style={[styles.headerSide, styles.headerSideRight]}>
              {!sent &&
                (submitting ? (
                  <ActivityIndicator size="small" color={COLORS.accent} />
                ) : (
                  <Pressable onPress={handleSubmit} disabled={!canSubmit} hitSlop={12}>
                    <Text style={[styles.send, !canSubmit && styles.sendDisabled]} numberOfLines={1}>
                      Send
                    </Text>
                  </Pressable>
                ))}
            </View>
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
                ref={scrollRef}
                onLayout={(e) => {
                  scrollH.current = e.nativeEvent.layout.height;
                }}
                keyboardDismissMode="interactive"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: kbHeight + SPACING.xl }}
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
                      style={[
                        styles.input,
                        styles.multiline,
                        { maxHeight: inputCap, minHeight: Math.min(140, inputCap) },
                      ]}
                      placeholder="The more detail, the better."
                      placeholderTextColor={COLORS.subtle}
                      value={message}
                      onChangeText={setMessage}
                      multiline
                      numberOfLines={6}
                      textAlignVertical="top"
                      maxLength={MAX_LEN}
                      autoFocus
                      onLayout={(e) => {
                        inputRect.current = {
                          y: e.nativeEvent.layout.y,
                          h: e.nativeEvent.layout.height,
                        };
                      }}
                      onFocus={revealInputSoon}
                      onContentSizeChange={revealInputSoon}
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

            </>
          )}
        </View>
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
    flex: 1,
    textAlign: 'center',
    fontFamily: FONTS.serif,
    fontSize: 24,
    fontWeight: '600',
    color: COLORS.text,
  },
  headerSide: {
    // minWidth, not width: at large Dynamic Type "Cancel" overflowed a fixed
    // 56pt box and wrapped to "Canc / el". Let the side grow to fit.
    minWidth: 56,
  },
  headerSideRight: {
    alignItems: 'flex-end',
  },
  close: {
    fontFamily: FONTS.body,
    fontWeight: '600',
    fontSize: 15,
    color: COLORS.accent,
  },
  send: {
    fontFamily: FONTS.body,
    fontWeight: '700',
    fontSize: 15,
    color: COLORS.accent,
  },
  sendDisabled: {
    opacity: 0.4,
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
    // Cap the box so a long message scrolls inside the input (the caret stays
    // in view natively) instead of growing without bound and pushing the
    // fields below it off-screen.
    maxHeight: 200,
  },
  charCount: {
    fontFamily: FONTS.body,
    fontSize: 11,
    color: COLORS.subtle,
    textAlign: 'right',
    marginTop: 4,
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
