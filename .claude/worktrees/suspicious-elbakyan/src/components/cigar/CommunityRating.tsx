import { View, Text, StyleSheet } from 'react-native';
import { StarRating } from '@/src/components/ui/StarRating';
import { COLORS, SPACING } from '@/src/constants/theme';

interface CommunityRatingProps {
  average: number;
  count: number;
  /** 'compact' for cards, 'full' for detail pages */
  variant?: 'compact' | 'full';
}

export function CommunityRating({ average, count, variant = 'compact' }: CommunityRatingProps) {
  if (count === 0) return null;

  if (variant === 'compact') {
    return (
      <View style={styles.compactRow}>
        <StarRating value={average} size={12} />
        <Text style={styles.compactText}>
          {average.toFixed(1)} ({count})
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.fullContainer}>
      <Text style={styles.fullLabel}>Stick Picks Community Rating</Text>
      <View style={styles.fullRow}>
        <StarRating value={average} size={20} />
        <Text style={styles.fullScore}>{average.toFixed(1)}</Text>
        <Text style={styles.fullCount}>
          {count} review{count !== 1 ? 's' : ''}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Compact — for browse/quiz/humidor cards
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  compactText: {
    fontFamily: 'Cormorant',
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.muted,
  },

  // Full — for cigar detail pages
  fullContainer: {
    marginBottom: SPACING.md,
  },
  fullLabel: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.accent,
    marginBottom: SPACING.xs,
  },
  fullRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fullScore: {
    fontFamily: 'Cormorant',
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  fullCount: {
    fontFamily: 'Cormorant',
    fontSize: 13,
    color: COLORS.muted,
  },
});
