/**
 * Perfume Concierge — suggest-for-catalog sheet.
 *
 * Surfaced when both AI and manual search can't find a fragrance.
 * Captures the long-tail for catalog growth + trains the next corpus refresh.
 * Mirrors Pour Picks' SuggestBottleSheet architecture.
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
import { getDeviceId } from '@/src/lib/deviceId';
import { track, EVENTS } from '@/src/lib/observability';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmitted?: () => void;
  scanId?: string | null;
  prefill?: {
    brand?: string;
    name?: string;
    concentration?: string | null;
  };
}

export function SuggestFragranceSheet({
  visible,
  onClose,
  onSubmitted,
  scanId,
  prefill,
}: Props) {
  const insets = useSafeAreaInsets();
  const [brand, setBrand] = useState('');
  const [name, setName] = useState('');
  const [concentration, setConcentration] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Apply prefill only when sheet first becomes visible and user hasn't edited
  useEffect(() => {
    if (!visible || !prefill) return;
    if (brand || name || concentration) return;
    if (prefill.brand) setBrand(prefill.brand);
    if (prefill.name) setName(prefill.name);
    if (prefill.concentration) setConcentration(prefill.concentration);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const reset = () => {
    setBrand('');
    setName('');
    setConcentration('');
    setNotes('');
  };

  const handleSubmit = async () => {
    const b = brand.trim();
    const n = name.trim();
    if (!b || !n) {
      Alert.alert('Almost there', 'Brand and fragrance name are required.');
      return;
    }
    if (!isSupabaseConfigured) {
      Alert.alert('Offline', 'Suggestions require a signed-in session.');
      return;
    }
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const [{ data: { user } }, deviceId] = await Promise.all([
        supabase.auth.getUser(),
        getDeviceId(),
      ]);
      await supabase.from('fragrance_submissions').insert({
        user_id: user?.id ?? null,
        device_id: deviceId,
        brand: b,
        name: n,
        concentration: concentration.trim() || null,
        notes: notes.trim() || null,
        scan_image_id: scanId ?? null,
      });
      track(EVENTS.SCAN_SUGGEST_SUBMITTED, { brand: b, name: n });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Thanks!', "We'll add this fragrance after a quick review.");
      reset();
      onClose();
      onSubmitted?.();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to submit. Please try again.');
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
            <Text style={styles.title}>Suggest a Fragrance</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.close}>Cancel</Text>
            </Pressable>
          </View>
          <Text style={styles.subtitle}>
            Tell us what this fragrance is and we'll add it to the catalog after
            a quick review.
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
                <Text style={styles.label}>Brand / House *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Tom Ford"
                  placeholderTextColor={COLORS.subtle}
                  value={brand}
                  onChangeText={setBrand}
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="next"
                />

                <Text style={styles.label}>Fragrance Name *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Lost Cherry"
                  placeholderTextColor={COLORS.subtle}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="next"
                />

                <Text style={styles.label}>
                  Concentration{' '}
                  <Text style={styles.labelDim}>(optional)</Text>
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Eau de Parfum"
                  placeholderTextColor={COLORS.subtle}
                  value={concentration}
                  onChangeText={setConcentration}
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="next"
                />

                <Text style={styles.label}>
                  Notes{' '}
                  <Text style={styles.labelDim}>(optional)</Text>
                </Text>
                <TextInput
                  style={[styles.input, styles.multiline]}
                  placeholder="Anything that'll help us find it — notes, year, bottle color…"
                  placeholderTextColor={COLORS.subtle}
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>
            </TouchableWithoutFeedback>
          </ScrollView>

          <Pressable
            onPress={handleSubmit}
            disabled={submitting}
            style={[
              styles.submit,
              submitting && { opacity: 0.6 },
              { marginBottom: insets.bottom + SPACING.md },
            ]}
          >
            {submitting ? (
              <ActivityIndicator color={COLORS.bg} />
            ) : (
              <>
                <Ionicons name="send" size={16} color={COLORS.bg} />
                <Text style={styles.submitText}>Submit for review</Text>
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
    marginBottom: 4,
  },
  labelDim: {
    fontFamily: FONTS.body,
    fontWeight: '400',
    color: COLORS.subtle,
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
  multiline: { minHeight: 80 },
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
