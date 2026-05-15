import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, TYPE, RADIUS } from '@/src/constants/theme';

interface EmptyStateProps {
  title: string;
  subtitle?: string;
  /** Ionicons icon name shown above the title. */
  icon?: keyof typeof Ionicons.glyphMap;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * Shared empty-state card used across M2 stub screens.
 * Reduces 50 design decisions to 50 copy decisions.
 */
export function EmptyState({ title, subtitle, icon, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      {icon && (
        <View style={styles.iconCircle}>
          <Ionicons name={icon} size={28} color={COLORS.accent} />
        </View>
      )}
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {actionLabel && onAction && (
        <Pressable style={styles.cta} onPress={onAction}>
          <Text style={styles.ctaText}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    margin: SPACING.lg,
    padding: SPACING.xl,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    gap: SPACING.sm,
  },
  iconCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: COLORS.blushSoft,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  title: {
    fontFamily: FONTS.serif,
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
  },
  subtitle: {
    ...TYPE.bodySmall,
    color: COLORS.muted,
    textAlign: 'center',
    paddingHorizontal: SPACING.md,
  },
  cta: {
    marginTop: SPACING.sm,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.xl,
    paddingVertical: 12,
    borderRadius: RADIUS.full,
  },
  ctaText: { ...TYPE.label, color: COLORS.white, letterSpacing: 1.5 },
});
