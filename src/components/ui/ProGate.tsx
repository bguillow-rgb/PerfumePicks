import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '@/src/constants/theme';
import { useProStore } from '@/src/stores/useProStore';

interface Props {
  children: React.ReactNode;
  label?: string;
  variant?: 'overlay' | 'replace';
}

/**
 * Soft Pro gate — dims content with an unlock overlay, or replaces it
 * with a single tap-to-upgrade row. Pro users see children directly.
 */
export function ProGate({ children, label = 'Unlock with Pro', variant = 'overlay' }: Props) {
  const isPro = useProStore((s) => s.isPro);
  const router = useRouter();

  if (isPro) return <>{children}</>;

  if (variant === 'replace') {
    return (
      <Pressable
        style={styles.replaceRow}
        onPress={() => router.push('/paywall')}
      >
        <Ionicons name="lock-closed" size={14} color={COLORS.accent} />
        <Text style={styles.replaceText}>{label}</Text>
        <Ionicons name="chevron-forward" size={14} color={COLORS.accent} style={{ marginLeft: 'auto' }} />
      </Pressable>
    );
  }

  // variant === 'overlay'
  return (
    <View style={styles.overlayWrap}>
      <View style={styles.overlayDimmed} pointerEvents="none">
        {children}
      </View>
      <Pressable
        style={styles.overlayCard}
        onPress={() => router.push('/paywall')}
      >
        <Ionicons name="lock-closed" size={16} color={COLORS.accent} />
        <Text style={styles.overlayLabel}>{label}</Text>
        <Text style={styles.overlayCta}>Upgrade →</Text>
      </Pressable>
    </View>
  );
}

/** Small inline PRO badge for section headers */
export function ProBadge() {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>PRO</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Replace variant
  replaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
  },
  replaceText: {
    fontFamily: FONTS.body,
    fontSize: 14,
    color: COLORS.text,
    flex: 1,
  },

  // Overlay variant
  overlayWrap: {
    position: 'relative',
  },
  overlayDimmed: {
    opacity: 0.35,
  },
  overlayCard: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  overlayLabel: {
    fontFamily: FONTS.body,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
  },
  overlayCta: {
    ...TYPE.label,
    color: COLORS.accent,
    fontSize: 13,
    letterSpacing: 0.5,
  },

  // PRO badge
  badge: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.full,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  badgeText: {
    fontFamily: FONTS.body,
    fontSize: 8,
    fontWeight: '800',
    color: COLORS.bg,
    letterSpacing: 1,
  },
});
