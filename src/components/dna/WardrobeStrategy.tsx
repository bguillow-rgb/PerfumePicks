import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, RADIUS, FONTS } from '@/src/constants/theme';
import type { Fragrance } from '@/src/stores/useCatalogStore';
import type { DnaCatalogFragrance, WardrobeSlot } from '@/src/features/dna/types';
import { WARDROBE_SLOTS } from '@/src/features/dna/types';
import { deriveWardrobe } from '@/src/features/dna';

/**
 * Wardrobe Strategy + Completion (V1.2 B2/B3) — the Wardrobe-tab diagnostic.
 *
 * Reads the user's OWNED bottles against the six canonical roles, names the
 * biggest empty slot as a FORWARD action ("Fill your signature gap →"), and — only
 * once the collection is real (owned ≥ COMPLETION_FLOOR) — shows a completion %.
 *
 * Cold-start honesty: with 0–2 bottles a "% complete" number is noise, so it is
 * SUPPRESSED until there's enough of a wardrobe to diagnose. The gap, however,
 * shows from the first bottle — that's the point of the surface (what to buy next).
 */

/** Owned-count below which the completion % is meaningless and hidden. */
export const COMPLETION_FLOOR = 3;

const SLOT_LABEL: Record<WardrobeSlot, string> = {
  signature: 'Signature',
  office: 'Office',
  date: 'Date night',
  warm: 'Warm weather',
  cold: 'Cold weather',
  formal: 'Formal',
};

const SLOT_ICON: Record<WardrobeSlot, keyof typeof Ionicons.glyphMap> = {
  signature: 'star-outline',
  office: 'briefcase-outline',
  date: 'wine-outline',
  warm: 'sunny-outline',
  cold: 'snow-outline',
  formal: 'diamond-outline',
};

export function WardrobeStrategy({
  owned,
  onFillGap,
}: {
  owned: Fragrance[];
  onFillGap: (slot: WardrobeSlot) => void;
}) {
  const dnaFrags = owned as unknown as DnaCatalogFragrance[];
  const { slots, completion, biggestGap } = deriveWardrobe(dnaFrags);

  const showCompletion = owned.length >= COMPLETION_FLOOR;
  const pct = Math.round(completion * 100);

  return (
    <View style={styles.wrap} testID="wardrobe-strategy">
      <View style={styles.headerRow}>
        <Text style={styles.eyebrow}>WARDROBE STRATEGY</Text>
        {showCompletion && (
          <Text style={styles.completion} testID="wardrobe-completion">
            {pct}% complete
          </Text>
        )}
      </View>

      {/* Six-slot grid */}
      <View style={styles.slotGrid}>
        {WARDROBE_SLOTS.map((slot) => {
          const filled = slots[slot];
          return (
            <View key={slot} style={[styles.slot, filled ? styles.slotFilled : styles.slotEmpty]}>
              <Ionicons
                name={SLOT_ICON[slot]}
                size={16}
                color={filled ? COLORS.white : COLORS.muted}
              />
              <Text style={[styles.slotLabel, filled ? styles.slotLabelFilled : styles.slotLabelEmpty]}>
                {SLOT_LABEL[slot]}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Biggest gap → forward action */}
      {biggestGap && (
        <Pressable
          testID="wardrobe-gap"
          accessibilityRole="button"
          accessibilityLabel={`Fill your ${SLOT_LABEL[biggestGap]} gap`}
          style={({ pressed }) => [styles.gapBtn, pressed && { opacity: 0.85 }]}
          onPress={() => onFillGap(biggestGap)}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.gapEyebrow}>YOUR BIGGEST GAP</Text>
            <Text style={styles.gapLabel}>A {SLOT_LABEL[biggestGap].toLowerCase()} scent</Text>
          </View>
          <Ionicons name="arrow-forward" size={18} color={COLORS.white} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md },
  eyebrow: { ...TYPE.eyebrow },
  completion: { ...TYPE.label, color: COLORS.accent, fontSize: 12 },

  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  slotFilled: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  slotEmpty: { backgroundColor: COLORS.card, borderColor: COLORS.border, borderStyle: 'dashed' },
  slotLabel: { fontSize: 12, fontWeight: '600' },
  slotLabelFilled: { color: COLORS.white },
  slotLabelEmpty: { color: COLORS.muted },

  gapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.accent,
  },
  gapEyebrow: { ...TYPE.eyebrow, color: COLORS.white, opacity: 0.85, marginBottom: 2 },
  gapLabel: { fontFamily: FONTS.serif, fontSize: 17, fontWeight: '700', color: COLORS.white },
});
