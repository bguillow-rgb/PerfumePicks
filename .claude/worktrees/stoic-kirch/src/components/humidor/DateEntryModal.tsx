import { Modal, View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { COLORS, SPACING, RADIUS, FONTS } from '@/src/constants/theme';
import { Button } from '@/src/components/ui/Button';

// JS-only date entry: three numeric fields (MM / DD / YY) + shortcut chips.
// Picked over @react-native-community/datetimepicker because that module is native
// and would force an EAS rebuild — see pre-TestFlight checklist. If we want the
// iOS wheel picker later, we add the dep and eat one rebuild.

type Shortcut = { label: string; daysAgo: number };

const SHORTCUTS: Shortcut[] = [
  { label: 'Today', daysAgo: 0 },
  { label: 'Yesterday', daysAgo: 1 },
  { label: '1 week ago', daysAgo: 7 },
  { label: '1 month ago', daysAgo: 30 },
];

interface DateEntryModalProps {
  visible: boolean;
  title: string;
  // ISO timestamp or null — the current value being edited.
  value: string | null;
  onClose: () => void;
  onSave: (iso: string | null) => void;
  // Whether the "Clear" control is offered (hidden if the field is required).
  allowClear?: boolean;
}

// Split an ISO timestamp into MM/DD/YY form fields.
function isoToParts(iso: string | null): { mm: string; dd: string; yy: string } {
  if (!iso) return { mm: '', dd: '', yy: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { mm: '', dd: '', yy: '' };
  return {
    mm: String(d.getMonth() + 1).padStart(2, '0'),
    dd: String(d.getDate()).padStart(2, '0'),
    yy: String(d.getFullYear()).slice(2),
  };
}

// Compose a local-midnight ISO timestamp from MM/DD/YY strings, or null if invalid.
function partsToIso(mm: string, dd: string, yy: string): string | null {
  const m = Number(mm);
  const d = Number(dd);
  const y = Number(yy);
  if (!Number.isFinite(m) || !Number.isFinite(d) || !Number.isFinite(y)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31 || yy.length !== 2) return null;
  // YY → 20YY. Future dates (e.g. "99") collapse to 1999 which is fine for our use.
  const fullYear = 2000 + y;
  const date = new Date(fullYear, m - 1, d, 0, 0, 0, 0);
  // Reject impossible dates (e.g. Feb 31 → rolls forward).
  if (date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  if (date.getTime() > Date.now() + 24 * 60 * 60 * 1000) return null; // reject "future" beyond 1d tolerance
  return date.toISOString();
}

export function DateEntryModal({
  visible,
  title,
  value,
  onClose,
  onSave,
  allowClear = true,
}: DateEntryModalProps) {
  const [{ mm, dd, yy }, setParts] = useState(() => isoToParts(value));
  const ddRef = useRef<TextInput>(null);
  const yyRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) setParts(isoToParts(value));
  }, [visible, value]);

  const applyShortcut = (daysAgo: number) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - daysAgo);
    setParts({
      mm: String(d.getMonth() + 1).padStart(2, '0'),
      dd: String(d.getDate()).padStart(2, '0'),
      yy: String(d.getFullYear()).slice(2),
    });
  };

  const handleSave = () => {
    const iso = partsToIso(mm, dd, yy);
    onSave(iso);
    onClose();
  };

  const handleClear = () => {
    onSave(null);
    onClose();
  };

  const parsed = partsToIso(mm, dd, yy);
  const canSave = parsed !== null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{title}</Text>

          <View style={styles.row}>
            <TextInput
              style={styles.field}
              value={mm}
              onChangeText={(t) => {
                const cleaned = t.replace(/\D/g, '').slice(0, 2);
                setParts((p) => ({ ...p, mm: cleaned }));
                if (cleaned.length === 2) ddRef.current?.focus();
              }}
              placeholder="MM"
              placeholderTextColor={COLORS.subtle}
              keyboardType="number-pad"
              maxLength={2}
              returnKeyType="next"
              selectionColor={COLORS.accent}
            />
            <Text style={styles.sep}>/</Text>
            <TextInput
              ref={ddRef}
              style={styles.field}
              value={dd}
              onChangeText={(t) => {
                const cleaned = t.replace(/\D/g, '').slice(0, 2);
                setParts((p) => ({ ...p, dd: cleaned }));
                if (cleaned.length === 2) yyRef.current?.focus();
              }}
              placeholder="DD"
              placeholderTextColor={COLORS.subtle}
              keyboardType="number-pad"
              maxLength={2}
              returnKeyType="next"
              selectionColor={COLORS.accent}
            />
            <Text style={styles.sep}>/</Text>
            <TextInput
              ref={yyRef}
              style={styles.field}
              value={yy}
              onChangeText={(t) =>
                setParts((p) => ({ ...p, yy: t.replace(/\D/g, '').slice(0, 2) }))
              }
              placeholder="YY"
              placeholderTextColor={COLORS.subtle}
              keyboardType="number-pad"
              maxLength={2}
              returnKeyType="done"
              selectionColor={COLORS.accent}
            />
          </View>

          <View style={styles.chipsRow}>
            {SHORTCUTS.map((s) => (
              <Pressable
                key={s.label}
                onPress={() => applyShortcut(s.daysAgo)}
                style={styles.chip}
                hitSlop={6}
              >
                <Text style={styles.chipText}>{s.label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.actions}>
            {allowClear && (
              <Pressable onPress={handleClear} hitSlop={6} style={styles.clearBtn}>
                <Text style={styles.clearText}>Clear</Text>
              </Pressable>
            )}
            <View style={styles.actionsRight}>
              <Button title="Cancel" variant="secondary" onPress={onClose} style={styles.actionBtn} />
              <Button title="Save" onPress={handleSave} disabled={!canSave} style={styles.actionBtn} />
            </View>
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
    maxWidth: 360,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
  },
  title: {
    fontFamily: FONTS.display,
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: SPACING.md,
  },
  field: {
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontFamily: FONTS.body,
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    minWidth: 64,
    textAlign: 'center',
  },
  sep: {
    fontFamily: FONTS.body,
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.muted,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: SPACING.md,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card2,
  },
  chipText: {
    fontFamily: FONTS.body,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionsRight: {
    flexDirection: 'row',
    gap: 8,
    marginLeft: 'auto',
  },
  actionBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    minHeight: 40,
  },
  clearBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  clearText: {
    fontFamily: FONTS.body,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.danger,
  },
});
