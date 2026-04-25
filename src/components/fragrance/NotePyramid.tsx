import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, TYPE, RADIUS, FONTS } from '@/src/constants/theme';

interface Props {
  top_notes: string[];
  heart_notes: string[];
  base_notes: string[];
}

/**
 * Notes pyramid — three tiers of chips, each labeled in editorial eyebrow
 * type with a soft cursive accent on the tier name.
 */
export function NotePyramid({ top_notes, heart_notes, base_notes }: Props) {
  return (
    <View style={styles.wrap}>
      <Tier label="Top" cursive="top" notes={top_notes} />
      <View style={styles.divider} />
      <Tier label="Heart" cursive="heart" notes={heart_notes} />
      <View style={styles.divider} />
      <Tier label="Base" cursive="base" notes={base_notes} />
    </View>
  );
}

function Tier({ label, cursive, notes }: { label: string; cursive: string; notes: string[] }) {
  return (
    <View style={styles.tier}>
      <View style={styles.headerRow}>
        <Text style={styles.eyebrow}>{label.toUpperCase()}</Text>
        <Text style={styles.cursive}>{cursive}</Text>
      </View>
      <View style={styles.chipRow}>
        {notes.length === 0 && <Text style={styles.empty}>—</Text>}
        {notes.map((n) => (
          <View key={n} style={styles.chip}>
            <Text style={styles.chipText}>{n}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
  },
  tier: { paddingVertical: SPACING.sm },
  headerRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: SPACING.sm, gap: 8 },
  eyebrow: { ...TYPE.eyebrow, fontSize: 11 },
  cursive: { fontFamily: 'PinyonScript_400Regular', fontSize: 22, color: COLORS.accent, lineHeight: 26 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.card2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  chipText: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.text, fontWeight: '400' },
  empty: { ...TYPE.bodySmall },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border, marginVertical: SPACING.sm },
});
