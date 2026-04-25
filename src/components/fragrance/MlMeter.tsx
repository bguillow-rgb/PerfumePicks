import { View, Text, StyleSheet } from 'react-native';
import { COLORS, TYPE } from '@/src/constants/theme';

/**
 * Vertical mL fill indicator — looks like a tiny perfume bottle filled
 * proportional to remaining mL. Used in the wardrobe grid.
 */
export function MlMeter({ size_ml, remaining_ml }: { size_ml: number; remaining_ml: number }) {
  const pct = Math.max(0, Math.min(1, remaining_ml / Math.max(size_ml, 0.1)));
  const isLow = pct < 0.2;
  return (
    <View style={styles.wrap}>
      <View style={styles.bottle}>
        <View style={[styles.fill, { height: `${pct * 100}%`, backgroundColor: isLow ? COLORS.danger : COLORS.accent }]} />
      </View>
      <Text style={styles.label}>{remaining_ml.toFixed(remaining_ml < 10 ? 1 : 0)}/{size_ml}ml</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  bottle: {
    width: 14,
    height: 36,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.accent,
    overflow: 'hidden',
    backgroundColor: COLORS.card2,
    justifyContent: 'flex-end',
  },
  fill: { width: '100%', borderRadius: 2 },
  label: { ...TYPE.caption, fontSize: 10, marginTop: 4 },
});
