// Profile surface showing the user's three active streaks. Renders as a
// Card with a subtle header and three rows, one per streak type. Guests
// see a single-CTA sign-in nudge instead of rows.
//
// Data comes from useStreakStore (already hydrated from AsyncStorage +
// pullAllStreaks on sign-in/app-active). When the store hasn't hydrated
// yet (cold start first paint) we show a minimal shimmer-less skeleton
// so the profile doesn't flash.

import { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Card } from '@/src/components/ui/Card';
import { COLORS, FONTS, RADIUS, SPACING } from '@/src/constants/theme';
import { useStreakStore } from '@/src/stores/useStreakStore';
import type { StreakState, StreakType } from '@/src/features/streaks/streaksService';
import { track } from '@/src/lib/observability/analytics';
import { EVENTS } from '@/src/lib/observability/events';

interface StreakCardProps {
  // When null, treat as signed-out and render the sign-in CTA instead
  // of streak rows.
  userId: string | null;
}

// Type-specific metadata — label + icon + short description. Single
// source of truth so the card, telemetry, and roadmap badges all draw
// from the same map.
const STREAK_META: Record<StreakType, {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  blurb: string;
}> = {
  engagement: {
    label: 'Engagement',
    icon: 'flame-outline',
    blurb: 'Open the app each day',
  },
  scan: {
    label: 'Scanning',
    icon: 'scan-outline',
    blurb: 'Identify a cigar each day',
  },
  quiz: {
    label: 'Matchmaker',
    icon: 'sparkles-outline',
    blurb: 'Take the quiz each day',
  },
};

const TYPE_ORDER: StreakType[] = ['engagement', 'scan', 'quiz'];

function relativeLastActivity(iso: string | null): string | null {
  if (!iso) return null;
  const todayTz = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local
  if (iso === todayTz) return 'today';
  // Simple 1-day diff check via Date math — we don't need richer relative
  // time than "yesterday" / "N days ago" for this surface.
  try {
    const prev = new Date(iso + 'T00:00:00');
    const today = new Date(todayTz + 'T00:00:00');
    const diffDays = Math.round((today.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) return 'yesterday';
    if (diffDays >= 2 && diffDays <= 14) return `${diffDays} days ago`;
    return iso; // older than two weeks — show raw date
  } catch {
    return iso;
  }
}

export function StreakCard({ userId }: StreakCardProps) {
  const router = useRouter();
  const streaks = useStreakStore((s) => s.streaks);
  const hasHydrated = useStreakStore((s) => s.hasHydrated);

  // Fire a STREAK_VIEWED event once per mount when the card is visible
  // to a signed-in user. Not on every re-render — useEffect with empty
  // deps is fine here because the card doesn't remount frequently on
  // the profile tab.
  useEffect(() => {
    if (!userId) return;
    track(EVENTS.STREAK_VIEWED, {});
  }, [userId]);

  // Signed-out: nudge to sign in. Non-blocking — we don't gate anything
  // else on this; just turn what would be an empty card into an upsell.
  if (!userId) {
    return (
      <Card style={styles.card}>
        <Text style={styles.header}>Streaks</Text>
        <Text style={styles.nudgeBody}>
          Sign in to track your daily engagement, scan, and quiz streaks.
        </Text>
        <Pressable
          onPress={() => router.push('/auth/login')}
          style={styles.nudgeBtn}
          hitSlop={8}
        >
          <Text style={styles.nudgeBtnText}>Sign in</Text>
          <Ionicons name="arrow-forward" size={14} color={COLORS.accent} />
        </Pressable>
      </Card>
    );
  }

  // First render before AsyncStorage hydrates — show the header with a
  // tiny spinner so the profile doesn't reflow when the store fills in.
  if (!hasHydrated) {
    return (
      <Card style={styles.card}>
        <Text style={styles.header}>Streaks</Text>
        <View style={styles.loadingRow}>
          <ActivityIndicator color={COLORS.accent} size="small" />
        </View>
      </Card>
    );
  }

  // Derive the "most recent activity across all streaks" for the footer.
  // Null if no activity yet on any streak.
  const mostRecentActivity = TYPE_ORDER.map((t) => streaks[t]?.last_activity_date)
    .filter((d): d is string => !!d)
    .sort()
    .pop() ?? null;

  return (
    <Card style={styles.card}>
      <Text style={styles.header}>Streaks</Text>

      {TYPE_ORDER.map((type) => {
        const data: StreakState | undefined = streaks[type];
        const current = data?.current_streak ?? 0;
        const best = data?.best_streak ?? 0;
        const meta = STREAK_META[type];
        return (
          <View key={type} style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={styles.iconCircle}>
                <Ionicons name={meta.icon} size={18} color={COLORS.accent} />
              </View>
              <View>
                <Text style={styles.rowLabel}>{meta.label}</Text>
                <Text style={styles.rowBlurb}>{meta.blurb}</Text>
              </View>
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.currentValue}>{current}</Text>
              <Text style={styles.currentLabel}>current</Text>
              <Text style={styles.bestValue}>Best {best}</Text>
            </View>
          </View>
        );
      })}

      {mostRecentActivity && (
        <Text style={styles.footer}>
          Last activity: {relativeLastActivity(mostRecentActivity) ?? mostRecentActivity}
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: SPACING.md,
  },
  header: {
    fontFamily: FONTS.display,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: COLORS.accent,
    textTransform: 'uppercase',
    marginBottom: SPACING.sm,
  },
  loadingRow: {
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.accentDim,
  },
  rowLabel: {
    fontFamily: FONTS.body,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  rowBlurb: {
    fontFamily: FONTS.body,
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 1,
  },
  rowRight: {
    alignItems: 'flex-end',
    minWidth: 80,
  },
  currentValue: {
    fontFamily: FONTS.display,
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.accent,
    lineHeight: 24,
  },
  currentLabel: {
    fontFamily: FONTS.body,
    fontSize: 10,
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: -2,
  },
  bestValue: {
    fontFamily: FONTS.body,
    fontSize: 11,
    color: COLORS.subtle,
    marginTop: 4,
  },
  footer: {
    fontFamily: FONTS.body,
    fontSize: 11,
    color: COLORS.muted,
    marginTop: SPACING.sm,
    fontStyle: 'italic',
  },
  nudgeBody: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: COLORS.muted,
    marginBottom: SPACING.sm,
    lineHeight: 18,
  },
  nudgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  nudgeBtnText: {
    fontFamily: FONTS.body,
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.accent,
    letterSpacing: 0.3,
  },
});
