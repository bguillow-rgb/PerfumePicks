import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, TYPE, RADIUS, FONTS } from '@/src/constants/theme';

interface Props {
  top_notes: string[];
  heart_notes: string[];
  base_notes: string[];
}

/**
 * Notes pyramid — three horizontal rows in a single card.
 * Compact layout: label column (56pt) + notes joined with · separator.
 */
export function NotePyramid({ top_notes, heart_notes, base_notes }: Props) {
  return (
    <View style={styles.card}>
      <Row label="TOP" notes={top_notes} />
      <Row label="HEART" notes={heart_notes} />
      <Row label="BASE" notes={base_notes} />
    </View>
  );
}

function Row({ label, notes }: { label: string; notes: string[] }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.notes} numberOfLines={1} ellipsizeMode="tail">
        {notes.length > 0 ? notes.join(' · ') : '—'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  label: {
    ...TYPE.eyebrow,
    fontSize: 10,
    width: 56,
  },
  notes: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: COLORS.text,
    flex: 1,
  },
});
