import { View, Text, StyleSheet } from 'react-native';
import { COLORS, RADIUS, TYPE } from '@/src/constants/theme';

/**
 * Accord chip with intensity meter beneath it.
 * Used on the fragrance detail page.
 */
export function AccordChip({ label, intensity }: { label: string; intensity: number }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.pill}>
        <Text style={styles.label}>{label.replace(/-/g, ' ')}</Text>
      </View>
      <View style={styles.bar}>
        <View style={[styles.barFill, { width: `${(intensity / 5) * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginRight: 10, marginBottom: 12, alignItems: 'flex-start' },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 6,
  },
  label: { ...TYPE.bodySmall, color: COLORS.text, fontWeight: '500' },
  bar: {
    width: '100%',
    height: 3,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: { height: '100%', backgroundColor: COLORS.accent, borderRadius: 2 },
});
