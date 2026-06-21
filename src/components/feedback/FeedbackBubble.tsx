// Floating feedback bubble — an always-on, low-friction line to the founder,
// mirroring the Pour Picks pattern. Sits at the bottom-right on every main tab,
// stacked just above the gold Scan FAB. It owns its own sheet visibility so it
// can be dropped into any layout with a single <FeedbackBubble />.
//
// Kept visually secondary to the Scan FAB (smaller, card surface + gold border)
// so the primary camera action stays dominant in the corner.

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { COLORS } from '@/src/constants/theme';
import { FeedbackSheet } from '@/src/components/feedback/FeedbackSheet';

const SIZE = 48;

export function FeedbackBubble() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        style={({ pressed }) => [styles.bubble, pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel="Send feedback"
        hitSlop={6}
      >
        <Ionicons name="chatbubble-ellipses-outline" size={22} color={COLORS.accent} />
      </Pressable>
      <FeedbackSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    // Stacks directly above the 56px Scan FAB (bottom: 80) with a 14px gap.
    bottom: 80 + 56 + 14,
    // Centered on the wider Scan FAB: 16 + (56 - 48) / 2.
    right: 20,
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: COLORS.card,
    borderWidth: 1.25,
    borderColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.black,
    shadowOpacity: 0.18,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
    zIndex: 100,
  },
});
