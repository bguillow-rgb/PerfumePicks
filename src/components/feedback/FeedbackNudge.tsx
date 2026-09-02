/**
 * FeedbackNudge — an inline "anything missing?" card at the foot of Home.
 *
 * Replaces the floating FeedbackBubble (a FAB on every screen reads as
 * un-premium). Rendered as a normal card, not floating chrome. Tapping it opens
 * the same FeedbackSheet the Profile "Send feedback" row uses. Dismiss is
 * session-only (local state on a screen that stays mounted), so the card returns
 * on the next cold start: dismissable, but it comes back.
 */

import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, RADIUS, SPACING, TYPE } from '@/src/constants/theme';
import { FeedbackSheet } from '@/src/components/feedback/FeedbackSheet';

export function FeedbackNudge() {
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);

  if (dismissed) return null;

  return (
    <>
      <View style={styles.card}>
        <Pressable
          style={styles.main}
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Send feedback"
        >
          <Ionicons
            name="chatbubble-ellipses-outline"
            size={20}
            color={COLORS.accent}
            style={styles.icon}
          />
          <View style={styles.copy}>
            <Text style={[TYPE.body, styles.title]}>Anything missing?</Text>
            <Text style={[TYPE.bodySmall, styles.sub]}>
              Tell me what would make Perfume Picks better.
            </Text>
          </View>
        </Pressable>
        <Pressable
          onPress={() => setDismissed(true)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        >
          <Ionicons name="close" size={16} color={COLORS.muted} />
        </Pressable>
      </View>
      <FeedbackSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  icon: { marginRight: SPACING.md },
  copy: { flex: 1 },
  title: { color: COLORS.text },
  sub: { color: COLORS.muted, marginTop: 2 },
});
