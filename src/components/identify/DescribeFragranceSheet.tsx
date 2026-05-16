/**
 * Perfume Concierge — text-only describe fallback.
 *
 * Surfaced from the no-match/error state in result.tsx when the image scan
 * didn't match the catalog. The user types what they remember and we run
 * a second LLM pass via the identify-bottle Edge Function with mode='describe'.
 */

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { describeBottle, type IdentifyResult } from '@/src/features/identify/identifyService';
import { track, EVENTS } from '@/src/lib/observability';
import { captureException } from '@/src/lib/observability';

interface Props {
  visible: boolean;
  onClose: () => void;
  onMatch: (result: IdentifyResult) => void;
  onNoMatch: () => void;
}

const PROMPT_HINTS = [
  'Brand / house name (e.g. Tom Ford)',
  'Fragrance name or line',
  'Notes you remember (vanilla, oud, rose)',
  'Bottle shape, color, or where you bought it',
];

export function DescribeFragranceSheet({ visible, onClose, onMatch, onNoMatch }: Props) {
  const insets = useSafeAreaInsets();
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setDescription('');
      track(EVENTS.SCAN_DESCRIBE_OPENED, {});
    }
  }, [visible]);

  const handleSubmit = async () => {
    const text = description.trim();
    if (text.length < 10) {
      Alert.alert(
        'A bit more, please',
        'Add a few details — brand, name, notes, anything you remember.'
      );
      return;
    }
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const result = await describeBottle(text);
      track(EVENTS.SCAN_DESCRIBE_SUBMITTED, {
        fragrance_id: result.fragranceId ?? null,
        confidence: result.confidence,
      });
      if (result.fragranceId) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onMatch(result);
      } else {
        track(EVENTS.SCAN_DESCRIBE_NO_MATCH, { confidence: result.confidence });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        onNoMatch();
      }
    } catch (e: any) {
      captureException(e, { area: 'describe_bottle' });
      Alert.alert('Could not identify', e?.message ?? 'Please try again.');
    } finally {
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
            <Text style={styles.title}>Describe the Fragrance</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.close}>Cancel</Text>
            </Pressable>
          </View>
          <Text style={styles.subtitle}>
            Couldn't get a clean photo? Tell us what you remember and we'll try
            to identify it without an image.
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
                <Text style={styles.label}>What do you remember?</Text>
                <TextInput
                  style={[styles.input, styles.multiline]}
                  placeholder="E.g., Tom Ford private blend, dark bottle, smells like vanilla and tobacco"
                  placeholderTextColor={COLORS.subtle}
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={6}
                  textAlignVertical="top"
                  maxLength={1000}
                  autoFocus
                />
                <Text style={styles.charCount}>
                  {description.length} / 1000
                </Text>

                <Text style={styles.hintsLabel}>HELPFUL DETAILS</Text>
                <View style={styles.hintsList}>
                  {PROMPT_HINTS.map((h) => (
                    <View key={h} style={styles.hintRow}>
                      <Ionicons
                        name="ellipse"
                        size={6}
                        color={COLORS.accent}
                        style={{ marginTop: 6 }}
                      />
                      <Text style={styles.hintText}>{h}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </TouchableWithoutFeedback>
          </ScrollView>

          <Pressable
            onPress={handleSubmit}
            disabled={submitting || description.trim().length < 10}
            style={[
              styles.submit,
              (submitting || description.trim().length < 10) && { opacity: 0.6 },
              { marginBottom: insets.bottom + SPACING.md },
            ]}
          >
            {submitting ? (
              <ActivityIndicator color={COLORS.bg} />
            ) : (
              <>
                <Ionicons name="sparkles" size={16} color={COLORS.bg} />
                <Text style={styles.submitText}>Identify from description</Text>
              </>
            )}
          </Pressable>
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
    fontSize: 22,
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
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: SPACING.md,
  },
  label: {
    fontFamily: FONTS.body,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: SPACING.sm,
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
  multiline: { minHeight: 140 },
  charCount: {
    fontFamily: FONTS.body,
    fontSize: 11,
    color: COLORS.subtle,
    textAlign: 'right',
    marginTop: 4,
  },
  hintsLabel: {
    fontFamily: FONTS.body,
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.subtle,
    letterSpacing: 1.2,
    marginTop: SPACING.lg,
    marginBottom: SPACING.xs,
  },
  hintsList: { gap: 6 },
  hintRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  hintText: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: COLORS.muted,
    flex: 1,
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
    color: COLORS.bg,
    letterSpacing: 0.3,
  },
});
