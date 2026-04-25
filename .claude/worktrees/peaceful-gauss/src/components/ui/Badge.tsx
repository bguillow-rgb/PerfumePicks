import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { COLORS, FONTS, RADIUS } from '@/src/constants/theme';

interface BadgeProps {
  label: string;
  color?: string;
  style?: ViewStyle;
}

export function Badge({ label, color, style }: BadgeProps) {
  return (
    <View style={[styles.badge, color && { borderColor: color }, style]}>
      <Text style={[styles.text, color && { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card2,
  },
  text: {
    fontFamily: FONTS.body,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
  },
});
