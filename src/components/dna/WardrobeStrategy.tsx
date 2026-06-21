import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, LayoutAnimation } from 'react-native';
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
 * biggest empty slot as a FORWARD action ("Fill your formal scent →"), and — only
 * once the collection is real (owned ≥ COMPLETION_FLOOR) — shows coverage.
 *
 * Cold-start honesty: with 0–2 bottles a coverage number is noise, so the
 * segmented coverage bar + "n of 6" count are SUPPRESSED until there's enough
 * of a wardrobe to diagnose. The role checklist (which slots are filled) and the
 * gap CTA show from the first bottle — that's the point of the surface.
 *
 * Visual language (Chief UX redesign): accent PUNCTUATES, never carpets. The old
 * six solid-gold pills are gone; filled/empty now reads from a quiet 2-col role
 * checklist (accent vs muted icon) plus a thin segmented coverage bar. The single
 * saturated element on the card is the gap CTA — the one action we want tapped.
 */

/** Owned-count below which the coverage count is meaningless and hidden. */
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
  signature: 'star',
  office: 'briefcase',
  date: 'wine',
  warm: 'sunny',
  cold: 'snow',
  formal: 'diamond',
};

export function WardrobeStrategy({
  owned,
  onFillGap,
}: {
  owned: Fragrance[];
  onFillGap: (slot: WardrobeSlot) => void;
}) {
  const dnaFrags = owned as unknown as DnaCatalogFragrance[];
  const { slots, biggestGap } = deriveWardrobe(dnaFrags);

  const showCoverage = owned.length >= COMPLETION_FLOOR;
  const filledCount = WARDROBE_SLOTS.filter((s) => slots[s]).length;

  // Collapsed by default — the card is tall when fully open, so we surface only
  // the "n of 6" coverage line and let the user expand the role checklist + gap
  // CTA on demand. Tapping the header (chevron) toggles it.
  const [expanded, setExpanded] = useState(false);
  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((e) => !e);
  };

  return (
    <View style={styles.wrap} testID="wardrobe-strategy">
      {/* Header — tap to expand/collapse the rest of the card. */}
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={`Wardrobe coverage, ${expanded ? 'expanded' : 'collapsed'}`}
        style={styles.header}
        testID="wardrobe-coverage-toggle"
      >
        <Text style={styles.eyebrow}>WARDROBE COVERAGE</Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={COLORS.muted}
        />
      </Pressable>

      {/* Coverage bar + count — quantified progress, gated on a real wardrobe.
          Segments fill left-to-right so it reads as progress, not per-role.
          Always visible (collapsed view), no bottom margin when collapsed. */}
      {showCoverage && (
        <View
          style={[styles.coverageRow, expanded && styles.coverageRowExpanded]}
          testID="wardrobe-completion"
        >
          <View style={styles.coverageBar}>
            {WARDROBE_SLOTS.map((_, i) => (
              <View
                key={i}
                style={[styles.coverageSeg, i < filledCount ? styles.coverageSegFilled : styles.coverageSegEmpty]}
              />
            ))}
          </View>
          <Text style={styles.coverageCount}>{filledCount} of 6</Text>
        </View>
      )}

      {expanded && (
        <>
          {/* Six-role checklist — 2 columns. Filled = accent icon + ink label,
              empty = muted icon + muted label. No pills, no gold fill. */}
          <View style={styles.checklist}>
            {WARDROBE_SLOTS.map((slot) => {
              const filled = slots[slot];
              return (
                <View
                  key={slot}
                  style={styles.slotRow}
                  accessibilityLabel={`${SLOT_LABEL[slot]}: ${filled ? 'covered' : 'empty'}`}
                >
                  <Ionicons
                    name={SLOT_ICON[slot]}
                    size={15}
                    color={filled ? COLORS.accent : COLORS.subtle}
                  />
                  <Text
                    style={[styles.slotLabel, filled ? styles.slotLabelFilled : styles.slotLabelEmpty]}
                    numberOfLines={1}
                  >
                    {SLOT_LABEL[slot]}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Biggest gap → the single accent action on the card */}
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
                <Text style={styles.gapLabel} numberOfLines={1}>
                  A {SLOT_LABEL[biggestGap].toLowerCase()} scent
                </Text>
              </View>
              <Ionicons name="arrow-forward" size={18} color={COLORS.white} />
            </Pressable>
          )}
        </>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  eyebrow: { ...TYPE.eyebrow },

  // Coverage bar — thin segmented progress, accent fills left-to-right.
  coverageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  // Extra breathing room below the bar only when the checklist follows it.
  coverageRowExpanded: { marginBottom: SPACING.lg },
  coverageBar: { flex: 1, flexDirection: 'row', gap: 4 },
  coverageSeg: { flex: 1, height: 5, borderRadius: RADIUS.full },
  coverageSegFilled: { backgroundColor: COLORS.accent },
  coverageSegEmpty: { backgroundColor: COLORS.border },
  coverageCount: {
    fontFamily: FONTS.body,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.muted,
    letterSpacing: 0.3,
    flexShrink: 0,
  },

  // Role checklist — two columns, quiet.
  checklist: { flexDirection: 'row', flexWrap: 'wrap' },
  slotRow: {
    width: '50%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: 7,
  },
  slotLabel: { fontFamily: FONTS.body, fontSize: 13, flexShrink: 1 },
  slotLabelFilled: { color: COLORS.text, fontWeight: '600' },
  slotLabelEmpty: { color: COLORS.muted, fontWeight: '400' },

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
