// Submission form rendered when both AI and manual search can't find a cigar.
// Captures the long-tail for catalog growth + trains the next corpus refresh.

import { useState } from 'react';
import {
  Modal, View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { getDeviceId } from '@/lib/deviceId';
import { track } from '@/src/lib/observability/analytics';
import { EVENTS } from '@/src/lib/observability/events';
import { COLORS, SPACING, RADIUS } from '@/src/constants/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmitted?: () => void;
  scanId?: string | null;
}

export function SuggestCigarSheet({ visible, onClose, onSubmitted, scanId }: Props) {
  const insets = useSafeAreaInsets();
  const [brand, setBrand] = useState('');
  const [line, setLine] = useState('');
  const [vitola, setVitola] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setBrand('');
    setLine('');
    setVitola('');
    setNotes('');
  };

  const handleSubmit = async () => {
    const b = brand.trim();
    const l = line.trim();
    if (!b || !l) {
      Alert.alert('Almost there', 'Brand and line are required.');
      return;
    }
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const [{ data: { user } }, deviceId] = await Promise.all([
        supabase.auth.getUser(),
        getDeviceId(),
      ]);
      await supabase.from('cigar_submissions').insert({
        user_id: user?.id ?? null,
        device_id: deviceId,
        brand: b,
        line: l,
        vitola: vitola.trim() || null,
        notes: notes.trim() || null,
        scan_image_id: scanId ?? null,
      });
      track(EVENTS.SCAN_SUGGEST_CIGAR_SUBMITTED, { brand: b, line: l });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Thanks!', "We'll add this cigar after a quick review.");
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
      <View style={[styles.screen, { paddingTop: insets.top + SPACING.md }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Suggest a Cigar</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.close}>Cancel</Text>
          </Pressable>
        </View>
        <Text style={styles.subtitle}>
          Tell us what this cigar is and we'll add it to the catalog after a quick review.
        </Text>

        <Text style={styles.label}>Brand *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Arturo Fuente"
          placeholderTextColor={COLORS.subtle}
          value={brand}
          onChangeText={setBrand}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="next"
        />

        <Text style={styles.label}>Line *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Hemingway Classic"
          placeholderTextColor={COLORS.subtle}
          value={line}
          onChangeText={setLine}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="next"
        />

        <Text style={styles.label}>Size <Text style={styles.labelDim}>(optional)</Text></Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Robusto, Toro"
          placeholderTextColor={COLORS.subtle}
          value={vitola}
          onChangeText={setVitola}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="next"
        />

        <Text style={styles.label}>Notes <Text style={styles.labelDim}>(optional)</Text></Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="Anything that'll help us find it — country, year, wrapper…"
          placeholderTextColor={COLORS.subtle}
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />

        <Pressable
          onPress={handleSubmit}
          disabled={submitting}
          style={[styles.submit, submitting && { opacity: 0.6 }, { marginBottom: insets.bottom + SPACING.md }]}
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
    fontFamily: 'Cormorant',
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
  },
  close: {
    fontFamily: 'Cormorant',
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.accent,
  },
  subtitle: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: SPACING.md,
  },
  label: {
    fontFamily: 'Cormorant',
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: SPACING.sm,
    marginBottom: 4,
  },
  labelDim: {
    fontWeight: '400',
    color: COLORS.muted,
  },
  input: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontFamily: 'Cormorant',
    fontSize: 16,
    color: COLORS.text,
  },
  multiline: {
    minHeight: 80,
  },
  submit: {
    marginTop: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.full,
    paddingVertical: 14,
  },
  submitText: {
    fontFamily: 'Cormorant',
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.bg,
    letterSpacing: 0.3,
  },
});
