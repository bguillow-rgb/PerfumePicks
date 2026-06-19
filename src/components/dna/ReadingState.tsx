import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { COLORS, FONTS, SPACING, TYPE } from '@/src/constants/theme';
import { READING_TEASERS } from '@/src/features/dna/revealCopy';

/**
 * "Reading your palate…" — the compute-cover beat (S3). The DNA is already
 * computing (synchronously, in the parent) the instant the user leaves the
 * picker; this screen is just the choreographed pause that makes the reveal
 * land as a moment instead of a flicker. The parent gates the transition on
 * compute-completion, so this is never an infinite spinner.
 */
export function ReadingState() {
  const [i, setI] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setI((prev) => (prev + 1) % READING_TEASERS.length);
    }, 700);
    return () => clearInterval(id);
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']} testID="dna-reading">
      <View style={styles.center}>
        <View style={styles.pulseWrap}>
          <Animated.View
            key={`dot-${i}`}
            entering={FadeIn.duration(500)}
            exiting={FadeOut.duration(500)}
            style={styles.pulse}
          />
        </View>
        <Animated.Text
          key={`teaser-${i}`}
          entering={FadeIn.duration(400)}
          exiting={FadeOut.duration(400)}
          style={styles.teaser}
        >
          {READING_TEASERS[i]}
        </Animated.Text>
        <Text style={styles.sub}>One read of everything you picked.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.xl },
  pulseWrap: { height: 80, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.lg },
  pulse: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.accentSoft,
    opacity: 0.7,
  },
  teaser: {
    fontFamily: FONTS.serif,
    fontSize: 26,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 32,
  },
  sub: { ...TYPE.bodySmall, color: COLORS.muted, marginTop: SPACING.sm, textAlign: 'center' },
});
