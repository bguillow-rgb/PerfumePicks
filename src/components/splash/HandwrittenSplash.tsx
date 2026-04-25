import { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import Svg, { Path, Rect, Ellipse } from 'react-native-svg';
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
 * Fountain pen nib SVG — used as the "writing instrument" on the splash.
 * Drawn so the TIP of the nib sits at SVG coordinate (12, 56). The pen body
 * extends UP-RIGHT, as if held in a right hand. Wrapped in a non-animated
 * View so its parent Animated.View can translate the whole pen along the
 * wordmark's leading edge.
 */
function FountainPen() {
  return (
    <View style={penStyles.penWrap} pointerEvents="none">
      <Svg width="48" height="64" viewBox="0 0 48 64" fill="none">
        {/* Soft shadow under the nib so it lifts off the ivory bg */}
        <Ellipse cx="14" cy="59" rx="8" ry="2" fill="rgba(42,31,24,0.15)" />

        {/* Pen barrel — burgundy with a subtle taper */}
        <Path
          d="M 32 4 L 42 14 L 22 50 L 14 50 Z"
          fill="#5C2A2A"
        />
        {/* Barrel highlight — thin lighter line for sheen */}
        <Path
          d="M 31 6 L 39 14 L 22 44"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="0.8"
          strokeLinecap="round"
          fill="none"
        />

        {/* Champagne-gold collar where nib meets barrel */}
        <Path
          d="M 14 50 L 22 50 L 19 56 L 12 54 Z"
          fill="#B8924B"
        />

        {/* Nib — gold teardrop, point at (12, 58) */}
        <Path
          d="M 12 54 L 19 54 L 12 60 Z"
          fill="#B8924B"
        />

        {/* Nib slit — fine dark line down the center for realism */}
        <Path
          d="M 14 55 L 13 59"
          stroke="#5C2A2A"
          strokeWidth="0.6"
          strokeLinecap="round"
        />

        {/* Tiny gold ferrule at the cap end */}
        <Rect x="33" y="2" width="3" height="3" rx="1" fill="#D4B179" />
      </Svg>
    </View>
  );
}

const penStyles = StyleSheet.create({
  penWrap: { width: 48, height: 64 },
});

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

    // 3. Fade everything out + signal the parent. Use a setTimeout instead
    //    of a second `containerOpacity.value = withDelay(...)` because in
    //    Reanimated, consecutive assignments to the same shared value cancel
    //    each other — chaining via a JS timer keeps both the fade-in (above)
    //    and the fade-out independent.
    const fadeAt = WRITE_DURATION_MS + POST_HOLD_MS;
    const fadeOutTimer = setTimeout(() => {
      containerOpacity.value = withTiming(
        0,
        { duration: FADE_OUT_MS, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(onFinish)();
        },
      );
    }, fadeAt);

    return () => {
      clearTimeout(fadeOutTimer);
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

  // Pen rides the leading edge of the reveal. Subtle vertical wiggle and
  // tilt jitter so the pen feels hand-held — derived from the same shimmer
  // value that already loops at handwriting cadence.
  const penTipStyle = useAnimatedStyle(() => {
    // Tiny vertical bob (±1.5px) sourced from the shimmer loop — looks like
    // natural hand bounce without going Disney-cartoonish.
    const wiggleY = interpolate(shimmer.value, [0, 0.5, 1], [-1.5, 0.5, -1], Extrapolation.CLAMP);
    // Subtle tilt jitter (±2°) on top of the writing angle (-22°).
    const baseTilt = -22;
    const tiltJitter = interpolate(shimmer.value, [0, 0.5, 1], [-1.5, 1, -1], Extrapolation.CLAMP);
    return {
      transform: [
        { translateX: interpolate(writeProgress.value, [0, 1], [0, WORDMARK_WIDTH], Extrapolation.CLAMP) },
        { translateY: wiggleY },
        { rotate: `${baseTilt + tiltJitter}deg` },
      ],
      opacity: writeProgress.value < 1
        ? 1
        : interpolate(writeProgress.value, [1, 1.001], [1, 0], Extrapolation.CLAMP),
    };
  });

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

        {/* Fountain pen — tracks the leading edge of the reveal. The pen's
            nib tip sits exactly at the writing edge (penTip anchor positions
            the SVG so its nib point coincides with the wordmark baseline).
            A subtle wiggle + tilt jitter makes the writing feel hand-drawn. */}
        <Animated.View pointerEvents="none" style={[styles.penTipWrap, penTipStyle]}>
          <FountainPen />
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
  // The fountain pen SVG is 48×64 and its NIB TIP is at SVG (12, 60).
  // We anchor the wrapper so the nib tip lands exactly on the writing edge:
  // shift left by 12 (nib x) and up by 60 (nib y) from the wordmark baseline,
  // then push down by half the wordmark height so the nib sits on the
  // visual baseline of the cursive script.
  penTipWrap: {
    position: 'absolute',
    left: 0,
    top: '50%',
    width: 48,
    height: 64,
    marginLeft: -12,
    marginTop: -42, // nib at writing midline
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
