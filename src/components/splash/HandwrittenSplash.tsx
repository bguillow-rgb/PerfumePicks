import { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  runOnJS,
  Easing,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { COLORS, FONTS } from '@/src/constants/theme';

/**
 * Handwriting splash for Perfume Picks.
 *
 * The "writing" illusion is built from three layered animations:
 *
 *   1. The wordmark "Perfume Picks" is rendered in cursive (Pinyon Script).
 *
 *   2. A horizontal MASK over the wordmark animates from 0 → 100% width,
 *      revealing the cursive text left-to-right at handwriting speed
 *      (~1.6s for the full wordmark — slightly faster than a real signature
 *      so the splash doesn't drag).
 *
 *   3. A small "pen tip" — a glowing dot with a soft champagne-gold halo —
 *      tracks the leading edge of the reveal mask, so it looks like the
 *      letters are appearing under the pen.
 *
 *   4. After the wordmark finishes, the divider rule and the editorial
 *      "FRAGRANCE, REFINED" tagline fade in.
 *
 * Total runtime ~3.0s including the fade-out. onFinish() lets the parent
 * mount the (tabs) UI underneath at the right moment.
 */

const { width: SCREEN_W } = Dimensions.get('window');
const WORDMARK_WIDTH = Math.min(SCREEN_W - 48, 360);
const WORDMARK_HEIGHT = 110;

const WRITE_DURATION_MS = 1600;
const POST_HOLD_MS = 700;
const FADE_OUT_MS = 500;
const TOTAL_MS = WRITE_DURATION_MS + POST_HOLD_MS + FADE_OUT_MS + 200;

interface Props {
  fontsLoaded: boolean;
  onReady?: () => void;
  onFinish: () => void;
}

export function HandwrittenSplash({ fontsLoaded, onReady, onFinish }: Props) {
  // 0 → 1 reveal progress for the wordmark
  const writeProgress = useSharedValue(0);
  // Tagline + divider fade
  const taglineOpacity = useSharedValue(0);
  // Whole-splash fade-out
  const containerOpacity = useSharedValue(0);
  // Subtle shimmer on the pen tip (loops while writing)
  const shimmer = useSharedValue(0);
  // Slight breathing on the wordmark after it finishes — feels alive, not static
  const wordmarkScale = useSharedValue(1);

  useEffect(() => {
    if (!fontsLoaded) return;

    // 1. Fade in the whole stage
    containerOpacity.value = withTiming(1, { duration: 350, easing: Easing.out(Easing.cubic) });

    // 2. Write the wordmark — easeInOut so it accelerates into the middle and
    //    slows toward the end of each word, mimicking pen pressure.
    writeProgress.value = withTiming(1, {
      duration: WRITE_DURATION_MS,
      easing: Easing.bezier(0.45, 0.05, 0.55, 0.95),
    });

    // Pen-tip shimmer — gentle pulse on a loop, ends when writing ends
    shimmer.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 350, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.4, { duration: 350, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      true,
    );

    // After the writing finishes: fade in tagline, then breathe the wordmark
    taglineOpacity.value = withDelay(
      WRITE_DURATION_MS + 100,
      withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }),
    );

    wordmarkScale.value = withDelay(
      WRITE_DURATION_MS,
      withSequence(
        withTiming(1.02, { duration: 600, easing: Easing.inOut(Easing.quad) }),
        withTiming(1.0, { duration: 600, easing: Easing.inOut(Easing.quad) }),
      ),
    );

    // 3. Fade everything out + signal the parent
    const fadeAt = WRITE_DURATION_MS + POST_HOLD_MS;
    containerOpacity.value = withDelay(
      fadeAt,
      withTiming(0, { duration: FADE_OUT_MS, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(onFinish)();
      }),
    );

    return () => {
      // Cancel future repeats if the component unmounts mid-flight
      shimmer.value = 0;
    };
  }, [fontsLoaded]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
  }));

  // The mask uncovers the wordmark from x=0 to x=WORDMARK_WIDTH.
  // We give a small over-shoot (1.04) so the right tail of the final letter
  // doesn't clip when the pen reaches the end.
  const maskStyle = useAnimatedStyle(() => ({
    width: interpolate(
      writeProgress.value,
      [0, 1],
      [0, WORDMARK_WIDTH * 1.04],
      Extrapolation.CLAMP,
    ),
  }));

  // Pen tip rides the leading edge of the reveal.
  const penTipStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(writeProgress.value, [0, 1], [0, WORDMARK_WIDTH], Extrapolation.CLAMP) },
    ],
    // Pen tip fades out after writing completes
    opacity: writeProgress.value < 1 ? 1 : interpolate(writeProgress.value, [1, 1.001], [1, 0], Extrapolation.CLAMP),
  }));

  const haloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 1], [0.35, 0.85]),
    transform: [{ scale: interpolate(shimmer.value, [0, 1], [0.9, 1.25]) }],
  }));

  const wordmarkBreathStyle = useAnimatedStyle(() => ({
    transform: [{ scale: wordmarkScale.value }],
  }));

  const taglineStyle = useAnimatedStyle(() => ({
    opacity: taglineOpacity.value,
    transform: [
      { translateY: interpolate(taglineOpacity.value, [0, 1], [6, 0], Extrapolation.CLAMP) },
    ],
  }));

  // While fonts are loading, render the container with onLayout so the parent
  // can hide the native launch screen — but no animation yet.
  return (
    <Animated.View style={[styles.container, containerStyle]} onLayout={() => onReady?.()}>
      <View style={styles.ornamentTop} />

      {/* Wordmark + reveal mask + pen tip, all stacked */}
      <Animated.View style={[styles.wordmarkSlot, wordmarkBreathStyle]}>
        <MaskedView
          style={styles.maskedRoot}
          maskElement={
            // The mask child is BLACK where the wordmark should show through.
            // We grow this black rectangle from 0 → full width.
            <View style={styles.maskHost}>
              <Animated.View style={[styles.maskReveal, maskStyle]} />
            </View>
          }
        >
          <Text
            allowFontScaling={false}
            adjustsFontSizeToFit
            numberOfLines={1}
            style={styles.wordmarkText}
          >
            Perfume Picks
          </Text>
        </MaskedView>

        {/* Pen tip — a champagne-gold dot with a glowing halo, tracking the
            leading edge of the reveal. Sits ABOVE the masked text. */}
        <Animated.View pointerEvents="none" style={[styles.penTipWrap, penTipStyle]}>
          <Animated.View style={[styles.penHalo, haloStyle]} />
          <View style={styles.penDot} />
        </Animated.View>
      </Animated.View>

      <Animated.View style={taglineStyle}>
        <View style={styles.divider} />
        <Text style={styles.tagline}>FRAGRANCE, REFINED</Text>
      </Animated.View>

      <View style={styles.ornamentBottom} />
    </Animated.View>
  );
}

export const SPLASH_TOTAL_MS = TOTAL_MS;

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  ornamentTop: {
    position: 'absolute',
    top: '24%',
    width: 80,
    height: 1,
    backgroundColor: COLORS.accent,
    opacity: 0.5,
  },
  ornamentBottom: {
    position: 'absolute',
    bottom: '24%',
    width: 80,
    height: 1,
    backgroundColor: COLORS.accent,
    opacity: 0.5,
  },
  wordmarkSlot: {
    width: WORDMARK_WIDTH,
    height: WORDMARK_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  maskedRoot: {
    width: WORDMARK_WIDTH,
    height: WORDMARK_HEIGHT,
  },
  maskHost: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  maskReveal: {
    height: '100%',
    backgroundColor: 'black', // any opaque color works; alpha mask uses luminance
  },
  wordmarkText: {
    fontFamily: 'PinyonScript_400Regular',
    fontSize: 76,
    color: COLORS.accent,
    textAlign: 'center',
    width: WORDMARK_WIDTH,
    // Pinyon Script descenders sit low — extra line height prevents clipping.
    lineHeight: WORDMARK_HEIGHT,
    includeFontPadding: false,
  },
  penTipWrap: {
    position: 'absolute',
    left: 0,
    top: '50%',
    width: 14,
    height: 14,
    marginTop: -7,
    marginLeft: -7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  penHalo: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.accentSoft,
  },
  penDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.accent,
  },
  divider: {
    width: 40,
    height: 1,
    backgroundColor: COLORS.accent,
    alignSelf: 'center',
    marginTop: 18,
    marginBottom: 14,
    opacity: 0.6,
  },
  tagline: {
    fontFamily: FONTS.body,
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.muted,
    textAlign: 'center',
    letterSpacing: 5,
  },
});
