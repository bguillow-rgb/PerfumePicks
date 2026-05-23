import { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, TextInput,
  ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, FONTS, RADIUS } from '@/src/constants/theme';
import { useLayeringStore } from '@/src/stores/useLayeringStore';
import { useCatalogStore } from '@/src/stores/useCatalogStore';
import type { Fragrance } from '@/src/stores/useCatalogStore';

interface Props {
  visible: boolean;
  fragrance: Fragrance | null;   // the "base" fragrance this was opened from
  onClose: () => void;
  onSaved?: (id: string) => void;
}

/**
 * LayeringSheet — lets the user pick a second fragrance from their catalog
 * to log as a layering pair with the current fragrance.
 */
export function LayeringSheet({ visible, fragrance, onClose, onSaved }: Props) {
  const add = useLayeringStore((s) => s.add);
  const catalogItems = useCatalogStore((s) => s.items);
  const allEntries = useLayeringStore((s) => s.entries);
  const existing = useMemo(
    () => fragrance
      ? allEntries.filter((e) => e.fragrance_a_id === fragrance.id || e.fragrance_b_id === fragrance.id)
      : [],
    [allEntries, fragrance?.id],
  );

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Fragrance | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!visible) { setSearch(''); setSelected(null); setNote(''); }
  }, [visible]);

  const filtered = search.trim().length < 2
    ? []
    : catalogItems
        .filter((f) =>
          f.id !== fragrance?.id &&
          (f.name.toLowerCase().includes(search.toLowerCase()) ||
           f.brand.toLowerCase().includes(search.toLowerCase())),
        )
        .slice(0, 8);

  const handleSave = () => {
    if (!fragrance || !selected) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const id = add(fragrance.id, selected.id, note.trim() || undefined);
    onSaved?.(id);
    onClose();
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
          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.eyebrow}>LOG A LAYER</Text>
            <Text style={styles.cursive}>pair & record</Text>
            <Text style={styles.fragName}>{fragrance.name}</Text>
            <Text style={styles.fragBrand}>{fragrance.brand}</Text>

            {/* Past combos */}
            {existing.length > 0 && (
              <View style={styles.pastWrap}>
                <Text style={styles.sectionLabel}>PREVIOUS COMBOS</Text>
                {existing.slice(0, 3).map((e) => {
                  const other = catalogItems.find(
                    (f) => f.id === (e.fragrance_a_id === fragrance.id ? e.fragrance_b_id : e.fragrance_a_id),
                  );
                  return (
                    <View key={e.id} style={styles.pastRow}>
                      <Ionicons name="git-merge-outline" size={14} color={COLORS.accent} />
                      <Text style={styles.pastText}>{other?.name ?? 'Unknown'}</Text>
                      {other && <Text style={styles.pastBrand}>· {other.brand}</Text>}
                    </View>
                  );
                })}
              </View>
            )}

            {/* Search */}
            <View style={styles.fieldWrap}>
              <Text style={styles.sectionLabel}>LAYER WITH</Text>
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search by name or brand…"
                placeholderTextColor={COLORS.subtle}
                style={styles.searchInput}
              />
              {filtered.map((f) => (
                <Pressable
                  key={f.id}
                  style={[styles.resultRow, selected?.id === f.id && styles.resultRowActive]}
                  onPress={() => { Haptics.selectionAsync(); setSelected(f); setSearch(`${f.name} – ${f.brand}`); }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.resultName}>{f.name}</Text>
                    <Text style={styles.resultBrand}>{f.brand}</Text>
                  </View>
                  {selected?.id === f.id && (
                    <Ionicons name="checkmark-circle" size={18} color={COLORS.accent} />
                  )}
                </Pressable>
              ))}
            </View>

            {/* Note */}
            <View style={styles.fieldWrap}>
              <Text style={styles.sectionLabel}>NOTE (OPTIONAL)</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="How did they work together?"
                placeholderTextColor={COLORS.subtle}
                multiline
                maxLength={300}
                style={styles.noteInput}
              />
            </View>
          </ScrollView>

          <View style={styles.ctaWrap}>
            <Pressable onPress={onClose} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={!selected}
              style={[styles.saveBtn, !selected && { opacity: 0.4 }]}
            >
              <Ionicons name="git-merge-outline" size={16} color={COLORS.white} style={{ marginRight: 6 }} />
              <Text style={styles.saveText}>Save Combo</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
    maxHeight: '88%',
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
  fragName: { fontFamily: FONTS.serif, fontSize: 22, fontWeight: '600', color: COLORS.text, marginTop: SPACING.sm, lineHeight: 26 },
  fragBrand: { ...TYPE.bodySmall, marginTop: 2 },
  sectionLabel: { ...TYPE.eyebrow, marginBottom: SPACING.sm },
  pastWrap: { marginTop: SPACING.lg },
  pastRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  pastText: { ...TYPE.bodySmall, fontWeight: '600' },
  pastBrand: { ...TYPE.caption, color: COLORS.muted },
  fieldWrap: { marginTop: SPACING.lg },
  searchInput: {
    ...TYPE.body,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 12,
    marginBottom: 4,
  },
  resultRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: COLORS.card,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border,
  },
  resultRowActive: { backgroundColor: COLORS.blushSoft },
  resultName: { ...TYPE.body, fontWeight: '600' },
  resultBrand: { ...TYPE.caption, color: COLORS.muted },
  noteInput: {
    ...TYPE.body,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 12,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  ctaWrap: {
    flexDirection: 'row', gap: SPACING.sm,
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border,
  },
  cancelBtn: { paddingVertical: 14, paddingHorizontal: SPACING.lg, borderRadius: RADIUS.full },
  cancelText: { ...TYPE.label, color: COLORS.muted, letterSpacing: 1 },
  saveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.accent, paddingVertical: 14, borderRadius: RADIUS.full,
  },
  saveText: { ...TYPE.label, color: COLORS.white, letterSpacing: 1.5 },
});
