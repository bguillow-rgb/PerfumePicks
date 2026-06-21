import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, RADIUS } from '@/src/constants/theme';
import { ARCHETYPE_COPY } from '@/src/features/dna/revealCopy';
import { swapProgress } from '@/src/features/dna';
import { useTasteProfileStore } from '@/src/stores/useTasteProfileStore';
import type { FragranceDNA } from '@/src/features/dna/types';

/**
 * Living-archetype readout (PRD §6.6) — makes the M2 recompute engine visible.
 *
 * Renders three states purely from the persisted DNA (no re-derivation):
 *   - `pendingShift`  → the one-time "You've shifted" nudge (full variant only).
 *   - `leadSince`     → "leaning toward X" + a swap-progress meter.
 *   - `leaning`       → a subtle "leaning toward X" line (challenger crossed the
 *                       reveal ratio but isn't on the swap clock yet).
 *
 * `compact` is the one-liner used inside MyDnaCard on the You tab; `full` is the
 * richer block (banner + meter) used on the My-DNA home (taste-profile).
 */
export function LivingArchetypeReadout({
  dna,
  variant = 'full',
}: {
  dna: FragranceDNA;
  variant?: 'compact' | 'full';
}) {
  const acknowledge = useTasteProfileStore((s) => s.acknowledgeArchetypeShift);
  const { challenger, leaning, leadSince, pendingShift } = dna.archetype;

  // ── The committed swap: surface it once, then let the user dismiss it ───────
  if (pendingShift) {
    const toName = ARCHETYPE_COPY[pendingShift.to].name;
    if (variant === 'compact') {
      return (
        <View style={styles.compactRow} testID="dna-shift-compact">
          <Ionicons name="sparkles" size={14} color={COLORS.accent} />
          <Text style={styles.compactShift} numberOfLines={1}>
            Your DNA has shifted to {toName}
          </Text>
        </View>
      );
    }
    return (
      <View style={styles.banner} testID="dna-shift-banner">
        <View style={styles.bannerIcon}>
          <Ionicons name="sparkles" size={18} color={COLORS.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerTitle}>Your DNA has shifted</Text>
          <Text style={styles.bannerBody}>
            You&apos;re now {toName} — it suits you.
          </Text>
        </View>
        <Pressable
          testID="dna-shift-ack"
          style={styles.bannerBtn}
          onPress={acknowledge}
          accessibilityRole="button"
          accessibilityLabel="Dismiss DNA shift notice"
          hitSlop={8}
        >
          <Text style={styles.bannerBtnText}>Got it</Text>
        </Pressable>
      </View>
    );
  }

  // ── The lean: a runner-up pulling ahead, not yet committed ──────────────────
  if (!challenger || !(leaning || leadSince)) return null;
  const challengerName = ARCHETYPE_COPY[challenger].name;

  if (variant === 'compact') {
    return (
      <View style={styles.compactRow} testID="dna-leaning-compact">
        <Ionicons name="trending-up" size={13} color={COLORS.muted} />
        <Text style={styles.compactLean} numberOfLines={1}>
          Leaning toward {challengerName}
        </Text>
      </View>
    );
  }

  // Drive the meter WIDTH off the swap clock, but never show the raw number —
  // the boutique voice is editorial, not a gamified XP bar (chief-UX).
  const pct = leadSince
    ? Math.max(0, Math.min(100, Math.round(swapProgress(dna.archetype) * 100)))
    : 0;
  return (
    <View style={styles.leanBlock} testID="dna-leaning">
      <View style={styles.leanHeader}>
        <Ionicons name="trending-up" size={15} color={COLORS.accent} />
        <Text style={styles.leanText}>
          Leaning toward <Text style={styles.leanName}>{challengerName}</Text>
        </Text>
      </View>
      {!!leadSince && (
        <>
          <View style={styles.track} testID="dna-swap-progress">
            <View style={[styles.fill, { width: `${pct}%` }]} />
          </View>
          <Text style={styles.leanCaption}>
            If this holds, {challengerName} becomes your DNA.
          </Text>
        </>
      )}
    </View>
  );
}

const METER_HEIGHT = 6;

const styles = StyleSheet.create({
  // compact (MyDnaCard)
  compactRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.sm },
  compactShift: { ...TYPE.caption, color: COLORS.accent, flex: 1 },
  compactLean: { ...TYPE.caption, color: COLORS.subtle, flex: 1 },

  // shift banner (full) — the emotional apex: elevated, not just another card
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.md,
    marginTop: SPACING.sm,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.accent,
    shadowColor: COLORS.accent,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  bannerIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTitle: { ...TYPE.label, color: COLORS.text },
  bannerBody: { ...TYPE.bodySmall, color: COLORS.muted, marginTop: 2 },
  bannerBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.accent,
  },
  bannerBtnText: { ...TYPE.label, fontSize: 13, color: COLORS.white },

  // lean block (full) — secondary to the primary archetype, never competing
  leanBlock: { marginTop: SPACING.sm, marginBottom: SPACING.md },
  leanHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  leanText: { ...TYPE.bodySmall, color: COLORS.muted },
  leanName: { ...TYPE.label, color: COLORS.accent },
  track: {
    height: METER_HEIGHT,
    backgroundColor: COLORS.card2,
    borderRadius: METER_HEIGHT / 2,
    overflow: 'hidden',
    marginTop: SPACING.sm,
  },
  fill: { height: '100%', backgroundColor: COLORS.accent, borderRadius: METER_HEIGHT / 2 },
  leanCaption: { ...TYPE.caption, color: COLORS.subtle, marginTop: SPACING.xs + 2 },
});
