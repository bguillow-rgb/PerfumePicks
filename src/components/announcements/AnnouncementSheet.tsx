/**
 * Presentational announcement card. The exact modal a user sees, driven purely
 * by props so it can be reused without drifting:
 *   - AnnouncementModal (live delivery on Home)
 *   - the composer's tap-to-preview (founder checks it before publishing)
 * No data fetching, no seen-tracking, no navigation. Callers wire behavior.
 *
 * Button model:
 *   - primaryLabel + onPrimary is the main button (always shown).
 *   - showDismiss adds a secondary link beneath it — used only when the primary
 *     button navigates somewhere, so there's still a way to just close.
 *   - An acknowledge-only message (no destination) uses the primary button itself
 *     to dismiss (e.g. "Sounds Good!"), with no secondary link.
 */

import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/src/components/ui/Button';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '@/src/constants/theme';

interface Props {
  emoji?: string | null;
  title: string;
  body: string;
  primaryLabel: string;
  onPrimary: () => void;
  /** Show a secondary dismiss link under the primary button. */
  showDismiss?: boolean;
  dismissLabel?: string;
  onDismiss: () => void;
}

export function AnnouncementSheet({
  emoji,
  title,
  body,
  primaryLabel,
  onPrimary,
  showDismiss = false,
  dismissLabel = 'Got it',
  onDismiss,
}: Props) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {emoji ? (
            <View style={styles.iconBadge}>
              <Text style={styles.emoji}>{emoji}</Text>
            </View>
          ) : null}

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>

          <Button
            title={primaryLabel}
            variant="primary"
            onPress={onPrimary}
            style={styles.cta}
          />
          {showDismiss ? (
            <Pressable
              onPress={onDismiss}
              accessibilityRole="button"
              accessibilityLabel={dismissLabel}
              hitSlop={8}
              style={styles.later}
            >
              <Text style={styles.laterText}>{dismissLabel}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(42,31,24,0.72)',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  sheet: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    alignItems: 'center',
    gap: SPACING.sm,
  },
  iconBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.card2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
  },
  emoji: { fontSize: 28 },
  title: {
    ...TYPE.heading,
    textAlign: 'center',
  },
  body: {
    ...TYPE.body,
    color: COLORS.muted,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  cta: {
    marginTop: SPACING.xs,
    alignSelf: 'stretch',
  },
  later: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  laterText: {
    ...TYPE.bodySmall,
    fontFamily: FONTS.body,
    color: COLORS.subtle,
  },
});
