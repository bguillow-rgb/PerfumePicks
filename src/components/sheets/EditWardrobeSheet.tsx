import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, TextInput,
  ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, FONTS, RADIUS } from '@/src/constants/theme';
import { useWardrobeStore, type WardrobeItem, type WardrobeStatus, type UnitType } from '@/src/stores/useWardrobeStore';
import type { Fragrance } from '@/src/stores/useCatalogStore';

interface Props {
  visible: boolean;
  item: WardrobeItem | null;
  fragrance: Fragrance | null;
  onClose: () => void;
  onDelete: () => void;
}

const STATUS_OPTIONS: { id: WardrobeStatus; label: string }[] = [
  { id: 'have',    label: 'In Rotation' },
  { id: 'want',    label: 'Wishlist' },
  { id: 'tested',  label: 'Tested' },
  { id: 'sold_on', label: 'Sold On' },
];

export function EditWardrobeSheet({ visible, item, fragrance, onClose, onDelete }: Props) {
  const update = useWardrobeStore((s) => s.update);

  const [status, setStatus] = useState<WardrobeStatus>('have');
  const [remainingMl, setRemainingMl] = useState('');
  const [notes, setNotes] = useState('');

  // Sync local state when item changes
  useEffect(() => {
    if (item) {
      setStatus(item.status);
      setRemainingMl(item.remaining_ml > 0 ? String(item.remaining_ml) : '');
      setNotes(item.notes ?? '');
    }
  }, [item]);

  const handleSave = () => {
    if (!item) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const rem = Number(remainingMl);
    update(item.id, {
      status,
      remaining_ml: Number.isFinite(rem) && rem >= 0 ? rem : item.remaining_ml,
      notes: notes.trim() || null,
    });
    onClose();
  };

  if (!item || !fragrance) return null;

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
            <Text style={styles.eyebrow}>EDIT</Text>
            <Text style={styles.cursive}>update your entry</Text>
            <Text style={styles.fragName}>{fragrance.name}</Text>
            <Text style={styles.fragBrand}>{fragrance.brand}</Text>

            {/* Status */}
            <Section label="Status">
              <View style={styles.pillRow}>
                {STATUS_OPTIONS.map((s) => (
                  <Pressable
                    key={s.id}
                    onPress={() => { Haptics.selectionAsync(); setStatus(s.id); }}
                    style={[styles.pill, status === s.id && styles.pillActive]}
                  >
                    <Text style={[styles.pillText, status === s.id && styles.pillTextActive]}>
                      {s.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Section>

            {/* Remaining mL — only relevant for have/tested */}
            {(status === 'have' || status === 'tested') && (
              <Section label="Remaining (mL)">
                <View style={styles.mlField}>
                  <TextInput
                    value={remainingMl}
                    onChangeText={setRemainingMl}
                    keyboardType="decimal-pad"
                    style={styles.mlInput}
                    placeholder="0"
                    placeholderTextColor={COLORS.subtle}
                  />
                  <Text style={styles.mlSuffix}>ml</Text>
                </View>
                <Text style={styles.mlHint}>Bottle size: {item.size_ml} ml</Text>
              </Section>
            )}

            {/* Notes */}
            <Section label="Private Notes">
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Your thoughts, where you bought it, what it reminds you of..."
                placeholderTextColor={COLORS.subtle}
                multiline
                style={styles.noteInput}
              />
            </Section>
          </ScrollView>

          <View style={styles.ctaWrap}>
            <Pressable onPress={onDelete} style={styles.deleteBtn}>
              <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
            </Pressable>
            <Pressable onPress={onClose} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={handleSave} style={styles.saveBtn}>
              <Text style={styles.saveText}>Save</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: SPACING.lg }}>
      <Text style={styles.sectionLabel}>{label.toUpperCase()}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(42,31,24,0.45)' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: SPACING.lg,
    maxHeight: '85%',
  },
  handle: {
    alignSelf: 'center',
    width: 44, height: 5, borderRadius: 3,
    backgroundColor: COLORS.border,
    marginTop: 8, marginBottom: 4,
  },
  body: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.xl },
  eyebrow: { ...TYPE.eyebrow },
  cursive: { fontFamily: 'PinyonScript_400Regular', fontSize: 28, color: COLORS.accent, lineHeight: 34, marginTop: 2 },
  fragName: { fontFamily: FONTS.serif, fontSize: 26, fontWeight: '600', color: COLORS.text, marginTop: SPACING.sm, lineHeight: 30 },
  fragBrand: { ...TYPE.bodySmall, marginTop: 2 },
  sectionLabel: { ...TYPE.eyebrow, marginBottom: SPACING.sm },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: RADIUS.full,
    borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  pillActive: { backgroundColor: COLORS.text, borderColor: COLORS.text },
  pillText: { ...TYPE.label, fontSize: 13, color: COLORS.muted },
  pillTextActive: { color: COLORS.bg },
  mlField: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 12, paddingVertical: 10,
    width: 120,
  },
  mlInput: { flex: 1, ...TYPE.body, fontSize: 18, padding: 0, color: COLORS.text },
  mlSuffix: { ...TYPE.bodySmall, marginLeft: 4 },
  mlHint: { ...TYPE.caption, color: COLORS.muted, marginTop: 6 },
  noteInput: {
    ...TYPE.body,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 12,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  ctaWrap: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border,
  },
  deleteBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  cancelBtn: {
    paddingVertical: 14, paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.full,
  },
  cancelText: { ...TYPE.label, color: COLORS.muted, letterSpacing: 1 },
  saveBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.accent,
    paddingVertical: 14,
    borderRadius: RADIUS.full,
  },
  saveText: { ...TYPE.label, color: COLORS.white, letterSpacing: 1.5 },
});
