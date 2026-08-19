import { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { COLORS, SPACING, TYPE, FONTS, RADIUS } from '@/src/constants/theme';
import { track, EVENTS } from '@/src/lib/observability';

/**
 * Slim prompt asking for the bottles the user owns. Renders only for an
 * entirely empty wardrobe, and sits at the very top of Home, above the DNA
 * card, so it is the first thing that cohort sees.
 *
 * Deliberately narrow: no section eyebrow, no progress meter, two lines of copy
 * and a button row. It is a prompt, not a content section, and everything below
 * it (the user's own Fragrance DNA) is the more interesting surface once the
 * prompt is answered.
 *
 * Two doors, because they suit different moods: browse the catalog, or point
 * the camera at a label. The camera FAB in the tab bar already opens /scan, but
 * it is an unlabelled gold disc, so nothing on Home ever told a user that
 * scanning a bottle is how you fill a shelf.
 */
export function BuildWardrobeCard({
  onBrowse,
  onScan,
}: {
  onBrowse: () => void;
  onScan: () => void;
}) {
  // Impression, so the tap-through denominator is real rather than inferred
  // from screen views.
  useEffect(() => {
    track(EVENTS.WARDROBE_NUDGE_SHOWN, {});
  }, []);

  const go = (action: 'browse' | 'scan') => {
    track(EVENTS.WARDROBE_NUDGE_TAPPED, { action });
    (action === 'scan' ? onScan : onBrowse)();
  };

  return (
    <View style={styles.wrap} testID="build-wardrobe-card">
      <View style={styles.head}>
        <View style={styles.icon}>
          <Ionicons name="library-outline" size={20} color={COLORS.accent} />
        </View>
        <View style={styles.headText}>
          <Text style={styles.title} testID="build-wardrobe-title">
            Add all the bottles you own
          </Text>
          <Text style={styles.body} testID="build-wardrobe-body">
            So we can recommend your scent of the day.
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable
          testID="build-wardrobe-browse"
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
          onPress={() => go('browse')}
          accessibilityRole="button"
          accessibilityLabel="Add a bottle to your wardrobe"
        >
          <Ionicons name="add" size={16} color={COLORS.white} />
          <Text style={styles.ctaText}>Add a bottle</Text>
        </Pressable>
        <Pressable
          testID="build-wardrobe-scan"
          style={({ pressed }) => [styles.ctaGhost, pressed && { opacity: 0.7 }]}
          onPress={() => go('scan')}
          accessibilityRole="button"
          accessibilityLabel="Scan a bottle label with the camera"
        >
          <Ionicons name="camera-outline" size={16} color={COLORS.accent} />
          <Text style={styles.ctaGhostText}>Scan a label</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    // Own horizontal insets: this card sits outside Home's <Section> chrome,
    // which only pads the left and lets rails bleed off the right edge.
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.blush,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  icon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.blushSoft,
    borderWidth: 1,
    borderColor: COLORS.blush,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headText: { flex: 1, gap: 1 },
  title: { fontFamily: FONTS.serif, fontSize: 16, fontWeight: '600', color: COLORS.text },
  body: { ...TYPE.caption, fontSize: 12, color: COLORS.muted, lineHeight: 16 },

  // Wraps so the two CTAs stack instead of truncating at large text sizes.
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  cta: {
    flexGrow: 1,
    flexBasis: 130,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.accent,
  },
  ctaText: {
    ...TYPE.caption,
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.white,
    letterSpacing: 0.3,
  },
  ctaGhost: {
    flexGrow: 1,
    flexBasis: 130,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  ctaGhostText: {
    ...TYPE.caption,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.accent,
    letterSpacing: 0.3,
  },
});
