import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS } from '@/src/constants/theme';

interface StarRatingProps {
  value: number;
  max?: number;
  size?: number;
  color?: string;
  emptyColor?: string;
  interactive?: boolean;
  onChange?: (value: number) => void;
}

export function StarRating({
  value,
  max = 5,
  size = 24,
  color = COLORS.accent,
  emptyColor = COLORS.border,
  interactive = false,
  onChange,
}: StarRatingProps) {
  const handlePress = (star: number) => {
    if (!interactive || !onChange) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange(star);
  };

  const stars = [];
  for (let i = 1; i <= max; i++) {
    // Support half-star display for averages
    const filled = i <= Math.floor(value);
    const half = !filled && i - 0.5 <= value;
    const iconName = filled ? 'star' : half ? 'star-half' : 'star-outline';

    const star = (
      <Pressable
        key={i}
        onPress={() => handlePress(i)}
        disabled={!interactive}
        hitSlop={interactive ? 6 : 0}
        style={interactive ? styles.touchTarget : undefined}
      >
        <Ionicons
          name={iconName}
          size={size}
          color={filled || half ? color : emptyColor}
        />
      </Pressable>
    );
    stars.push(star);
  }

  return <View style={styles.row}>{stars}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  touchTarget: {
    padding: 2,
  },
});
