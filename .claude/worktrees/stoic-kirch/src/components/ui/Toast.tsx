// Lightweight bottom-center toast — one message at a time, non-blocking.
//
// Design intent: feel premium through restraint. Gold pill on the dark bg,
// fades in quick (150ms), holds briefly (~2.4s), fades out (350ms). No
// backdrop, no dismiss button — if a new toast fires while one is up, the
// current one is replaced.
//
// Pub/sub matches the StyledAlert pattern so the API feels consistent:
//   - Toast.show('Your message', { iconName: 'flame-outline' })
//   - <ToastHost /> mounted once at the app root
//
// Unlike StyledAlert, this component is purely informational — no
// callback, no modal semantics, no queue. That's deliberate: gamification
// toasts should never make the app feel busy.

import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING, FONTS } from '@/src/constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface ToastState {
  id: number;
  message: string;
  iconName?: IoniconName;
  durationMs: number;
}

// Subscriber registry. Set (not array) so identity-keyed deletion is O(1)
// and the same closure can never be subscribed twice even under Fast
// Refresh / StrictMode double-invocation.
const listeners = new Set<(s: ToastState) => void>();
let nextId = 1;

const DEFAULT_DURATION_MS = 2400;

export const Toast = {
  show(message: string, opts?: { iconName?: IoniconName; durationMs?: number }) {
    const state: ToastState = {
      id: nextId++,
      message,
      iconName: opts?.iconName,
      durationMs: opts?.durationMs ?? DEFAULT_DURATION_MS,
    };
    for (const l of listeners) l(state);
  },
};

export function ToastHost() {
  const [state, setState] = useState<ToastState | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translate = useRef(new Animated.Value(10)).current;
  const insets = useSafeAreaInsets();
  // Track a single dismiss timer so replacing a toast doesn't leave the
  // previous one's timer running and dismissing the new one early.
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const sub = (s: ToastState) => {
      // Interrupt any in-flight dismiss timer — we're showing a new toast
      // and the old timer would otherwise cut this one short.
      if (dismissTimerRef.current !== null) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
      setState(s);
    };
    listeners.add(sub);
    return () => {
      listeners.delete(sub);
      if (dismissTimerRef.current !== null) clearTimeout(dismissTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!state) return;
    // Reset to below-and-invisible before animating in so replacements
    // animate from the same spot.
    opacity.setValue(0);
    translate.setValue(10);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.timing(translate, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();

    dismissTimerRef.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 350, useNativeDriver: true }),
        Animated.timing(translate, { toValue: 10, duration: 350, useNativeDriver: true }),
      ]).start(({ finished }) => {
        // Only clear if this is still the same toast — a replacement could
        // have arrived mid-fade and bumped state to something new.
        if (finished) {
          setState((current) => (current?.id === state.id ? null : current));
        }
      });
      dismissTimerRef.current = null;
    }, state.durationMs);

    return () => {
      // Don't clear the timer here — we want the show/hide cycle to
      // complete. Cleanup on unmount is handled by the subscriber effect.
    };
  }, [state, opacity, translate]);

  if (!state) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrap,
        {
          bottom: insets.bottom + 28,
          opacity,
          transform: [{ translateY: translate }],
        },
      ]}
    >
      <View style={styles.pill}>
        {state.iconName && (
          <Ionicons name={state.iconName} size={16} color={COLORS.accent} style={styles.icon} />
        )}
        <Text style={styles.text} numberOfLines={2}>
          {state.message}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    // zIndex ensures the toast paints above route surfaces; on Android we
    // additionally set elevation so it rises above cards with their own
    // shadow layers.
    zIndex: 9999,
    ...(Platform.OS === 'android' ? { elevation: 24 } : {}),
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.card,
    borderColor: COLORS.accent,
    borderWidth: 1,
    borderRadius: RADIUS.full,
    maxWidth: 320,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  icon: {
    marginRight: 8,
  },
  text: {
    fontFamily: FONTS.body,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    letterSpacing: 0.2,
  },
});
