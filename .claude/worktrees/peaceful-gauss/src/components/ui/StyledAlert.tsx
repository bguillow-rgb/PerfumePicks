// In-app themed replacement for React Native's native Alert.alert. The default
// iOS dialog is white/system-blue and clashes with the app's dark-green-and-gold
// aesthetic. This component is a 1:1 signature-compatible wrapper so call sites
// can swap their import and nothing else changes.
//
// Usage:
//   import { Alert } from '@/src/components/ui/StyledAlert';
//   Alert.alert('Title', 'Message', [
//     { text: 'Cancel', style: 'cancel' },
//     { text: 'Delete', style: 'destructive', onPress: () => {...} },
//   ]);
//
// At the app root, render <StyledAlertHost /> exactly once — without it, Alert
// calls are no-ops. It's mounted inside app/_layout.tsx above the router slot.

import { Modal, View, Text, Pressable, StyleSheet, type ViewStyle, type TextStyle } from 'react-native';
import { useEffect, useState } from 'react';
import { COLORS, SPACING, RADIUS, FONTS } from '@/src/constants/theme';

export type AlertButton = {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

type AlertState = {
  id: number;
  title: string;
  message?: string;
  buttons: AlertButton[];
};

// Subscriber list — host registers once at mount, Alert.alert() broadcasts.
let listeners: ((s: AlertState) => void)[] = [];
let nextId = 1;

export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[]) {
    const state: AlertState = {
      id: nextId++,
      title,
      message,
      // Match the native Alert.alert default: a single "OK" button if none given.
      buttons: buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }],
    };
    for (const l of listeners) l(state);
  },
};

export function StyledAlertHost() {
  const [state, setState] = useState<AlertState | null>(null);

  useEffect(() => {
    const sub = (s: AlertState) => setState(s);
    listeners.push(sub);
    return () => {
      listeners = listeners.filter((l) => l !== sub);
    };
  }, []);

  const dismiss = () => setState(null);

  const handleButton = (b: AlertButton) => {
    // Close before firing onPress so nested Alerts can open without the previous
    // one eating their visible flag.
    dismiss();
    // Defer the callback so any onPress that opens another Alert doesn't race
    // with our setState dismissal.
    setTimeout(() => b.onPress?.(), 0);
  };

  const handleBackdropPress = () => {
    if (!state) return;
    // Native Alert dismisses via tap-outside only when a cancel button exists;
    // mirror that so we don't eat destructive confirmations accidentally.
    const cancel = state.buttons.find((b) => b.style === 'cancel');
    if (cancel) handleButton(cancel);
  };

  return (
    <Modal
      visible={state !== null}
      transparent
      animationType="fade"
      onRequestClose={dismiss}
    >
      <Pressable style={styles.backdrop} onPress={handleBackdropPress}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          {state && (
            <>
              <Text style={textStyles.title}>{state.title}</Text>
              {state.message ? (
                <Text style={textStyles.message}>{state.message}</Text>
              ) : null}
              <View
                style={[
                  styles.buttonRow,
                  state.buttons.length === 1 && styles.buttonRowSingle,
                ]}
              >
                {state.buttons.map((b, i) => {
                  const isDestructive = b.style === 'destructive';
                  const isCancel = b.style === 'cancel';
                  return (
                    <Pressable
                      key={i}
                      onPress={() => handleButton(b)}
                      style={({ pressed }) => [
                        styles.btn,
                        isDestructive && styles.btnDestructive,
                        isCancel && styles.btnCancel,
                        !isDestructive && !isCancel && styles.btnDefault,
                        pressed && styles.btnPressed,
                      ]}
                    >
                      <Text
                        style={[
                          textStyles.btnText,
                          isDestructive && textStyles.btnTextDestructive,
                          isCancel && textStyles.btnTextCancel,
                          !isDestructive && !isCancel && textStyles.btnTextDefault,
                        ]}
                      >
                        {b.text ?? 'OK'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Split into view-styles and text-styles so StyleSheet.create infers the
// right style type for each key — a single mixed sheet would broaden
// everything to the TextStyle|ViewStyle union and break Pressable typing.
const styles = StyleSheet.create<Record<string, ViewStyle>>({
  backdrop: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingTop: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  buttonRowSingle: {
    // Single-button alerts take the full width of the card.
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  btnPressed: {
    opacity: 0.85,
  },
  btnDefault: {
    backgroundColor: COLORS.accent,
  },
  btnCancel: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnDestructive: {
    backgroundColor: COLORS.danger,
  },
});

const textStyles = StyleSheet.create<Record<string, TextStyle>>({
  // Uppercase gold "small caps" title matches the section-title treatment used
  // throughout the cigar detail page — reads as a proper header, not a system dialog.
  title: {
    fontFamily: FONTS.display,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: COLORS.accent,
    marginBottom: SPACING.sm,
  },
  message: {
    fontFamily: FONTS.body,
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  btnText: {
    fontFamily: FONTS.body,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  btnTextDefault: {
    color: COLORS.bg,
  },
  btnTextCancel: {
    color: COLORS.text,
  },
  btnTextDestructive: {
    color: COLORS.white,
  },
});
