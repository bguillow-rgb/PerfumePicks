import { Modal, View, Text, Pressable, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { COLORS, SPACING, RADIUS, FONTS } from '@/src/constants/theme';
import type { Cigar } from '@/src/types/cigar';

// Picker shown when the user taps "Add another size" on an Owned brand+line group.
// Fetches every cigar in the same brand+line from the catalog and filters out vitolas
// the user already owns in this group.

interface VitolaPickerModalProps {
  visible: boolean;
  brand: string;
  line: string;
  excludeCigarIds: string[];
  onClose: () => void;
  onPick: (cigar: Cigar) => void;
  title?: string;
}

export function VitolaPickerModal({
  visible,
  brand,
  line,
  excludeCigarIds,
  onClose,
  onPick,
  title = 'Change size',
}: VitolaPickerModalProps) {
  const [options, setOptions] = useState<Cigar[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('cigars')
          .select('*')
          .eq('brand', brand)
          .eq('line', line);
        if (cancelled) return;
        const excl = new Set(excludeCigarIds);
        const list = ((data as Cigar[]) ?? []).filter((c) => !excl.has(c.id));
        setOptions(list);
      } catch {
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, brand, line, excludeCigarIds]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>
            {brand} — {line}
          </Text>

          {loading ? (
            <ActivityIndicator color={COLORS.accent} style={{ marginVertical: SPACING.lg }} />
          ) : options.length === 0 ? (
            <Text style={styles.empty}>No other vitolas found in this line.</Text>
          ) : (
            <FlatList
              data={options}
              keyExtractor={(c) => c.id}
              style={{ maxHeight: 360 }}
              ItemSeparatorComponent={() => <View style={styles.sep} />}
              renderItem={({ item }) => (
                <Pressable style={styles.row} onPress={() => onPick(item)}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.vitola ?? item.name}
                  </Text>
                  {item.vitola && item.name && item.vitola !== item.name && (
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {item.name}
                    </Text>
                  )}
                </Pressable>
              )}
            />
          )}

          <Pressable onPress={onClose} hitSlop={6} style={styles.cancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
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
    padding: SPACING.md,
  },
  title: {
    fontFamily: FONTS.display,
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  subtitle: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: COLORS.muted,
    marginTop: 2,
    marginBottom: SPACING.md,
  },
  empty: {
    fontFamily: FONTS.body,
    fontSize: 14,
    color: COLORS.muted,
    textAlign: 'center',
    paddingVertical: SPACING.lg,
  },
  row: {
    paddingVertical: 12,
  },
  rowTitle: {
    fontFamily: FONTS.body,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  rowSub: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 2,
  },
  sep: {
    height: 1,
    backgroundColor: COLORS.border,
  },
  cancel: {
    marginTop: SPACING.sm,
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  cancelText: {
    fontFamily: FONTS.body,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.accent,
  },
});
