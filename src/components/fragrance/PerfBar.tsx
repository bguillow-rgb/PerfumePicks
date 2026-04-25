import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, TYPE } from '@/src/constants/theme';

/** Horizontal performance bar (longevity / sillage / projection), 0..5. */
export function PerfBar({ label, value, max = 5 }: { label: string; value: number; max?: number }) {
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{value.toFixed(1)}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: SPACING.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  label: { ...TYPE.eyebrow, fontSize: 10 },
  value: { ...TYPE.eyebrow, fontSize: 11, color: COLORS.accent },
  track: { height: 4, backgroundColor: COLORS.border, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: COLORS.accent, borderRadius: 2 },
});
