import { View, Text, StyleSheet } from 'react-native';
import { COLORS, FONTS, RADIUS } from '@/src/constants/theme';

interface MeterProps {
  label: string;
  value: number; // 1-5
  max?: number;
}

const LABELS: Record<string, Record<number, string>> = {
  Strength: { 1: 'Mild', 2: 'Mild-Med', 3: 'Medium', 4: 'Med-Full', 5: 'Full' },
  Body: { 1: 'Light', 2: 'Light-Med', 3: 'Medium', 4: 'Med-Full', 5: 'Full' },
  Price: { 1: 'Value', 2: 'Affordable', 3: 'Mid-Range', 4: 'Premium', 5: 'Top-Shelf' },
};

export function Meter({ label, value, max = 5 }: MeterProps) {
  const clamped = Math.min(Math.max(Math.round(value), 1), max);
  const pct = Math.min(Math.max(value / max, 0), 1);
  const valueLabel = LABELS[label]?.[clamped] ?? `${clamped}/${max}`;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{valueLabel}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  label: {
    fontFamily: FONTS.body,
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.muted,
  },
  value: {
    fontFamily: FONTS.body,
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  track: {
    height: 6,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.border,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.accent,
  },
});
