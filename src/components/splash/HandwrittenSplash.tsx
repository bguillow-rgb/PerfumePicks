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
 * Fountain pen nib SVG — the "writing instrument" on the splash.
 * Tip of the nib sits at SVG coordinate (12, 60).
 */
function FountainPen() {
  return (
    <View style={penStyles.penWrap} pointerEvents="none">
      <Svg width="48" height="64" viewBox="0 0 48 64" fill="none">
        <Ellipse cx="14" cy="59" rx="8" ry="2" fill="rgba(42,31,24,0.15)" />
        <Path d="M 32 4 L 42 14 L 22 50 L 14 50 Z" fill="#5C2A2A" />
        <Path
          d="M 31 6 L 39 14 L 22 44"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="0.8"
          strokeLinecap="round"
          fill="none"
        />
        <Path d="M 14 50 L 22 50 L 19 56 L 12 54 Z" fill="#B8924B" />
        <Path d="M 12 54 L 19 54 L 12 60 Z" fill="#B8924B" />
        <Path
          d="M 14 55 L 13 59"
          stroke="#5C2A2A"
          strokeWidth="0.6"
          strokeLinecap="round"
        />
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
 * The pen follows a curved path that traces the actual letter shapes of
 * "Perfume Picks" in cursive — rising for ascenders (P, f, P, k), dipping
 * for descenders (p, g), looping at letter connections, and lifting
 * slightly between the two words. This makes the writing feel hand-drawn
 * instead of a flat left-to-right slide.
 *
 * The path is defined as a series of (x%, y%) keyframes normalized to
 * the wordmark dimensions. The pen interpolates through these keyframes
 * as writeProgress goes 0→1.
 */

const { width: SCREEN_W } = Dimensions.get('window');
const WORDMARK_WIDTH = Math.min(SCREEN_W - 48, 360);
const WORDMARK_HEIGHT = 110;

const WRITE_DURATION_MS = 1800;
const POST_HOLD_MS = 700;
const FADE_OUT_MS = 500;
const TOTAL_MS = WRITE_DURATION_MS + POST_HOLD_MS + FADE_OUT_MS + 200;

// Pen path keyframes: [progress (0-1), xFraction (0-1), yOffset (px from center)]
// Positive y = below baseline, negative y = above baseline.
// Traces the cursive shapes of "Perfume Picks":
//   P(capital) - e - r - f(ascender) - u - m - e  [space]  P(capital) - i - c - k(ascender) - s
const PEN_PATH: [number, number, number][] = [
  // P — capital, starts high
  [0.000, 0.00,  -18],   // pen down, top of P stem
  [0.015, 0.02,   12],   // down stroke of P
  [0.030, 0.03,  -14],   // back up for P bowl
  [0.050, 0.06,   -8],   // across P bowl top
  [0.065, 0.07,    4],   // P bowl curves down
  // e
  [0.085, 0.10,    2],   // into e
  [0.100, 0.12,   -4],   // e loop top
  [0.115, 0.14,    6],   // e exit
  // r
  [0.135, 0.17,    0],   // r upstroke
  [0.150, 0.19,   -6],   // r shoulder
  [0.165, 0.21,    4],   // r exit
  // f — tall ascender
  [0.185, 0.23,    2],   // f approach
  [0.210, 0.25,  -22],   // f ascender — pen goes HIGH
  [0.230, 0.27,  -20],   // f crossbar
  [0.250, 0.29,    8],   // f descender
  [0.265, 0.31,   14],   // f tail dip below baseline
  [0.280, 0.33,    4],   // recovery
  // u
  [0.300, 0.35,   -2],   // u upstroke
  [0.315, 0.37,    8],   // u trough
  [0.330, 0.39,   -2],   // u second stroke
  // m
  [0.350, 0.41,   -6],   // m first hump
  [0.365, 0.43,    4],   // m valley
  [0.380, 0.45,   -6],   // m second hump
  [0.395, 0.47,    4],   // m valley
  [0.410, 0.49,   -4],   // m third hump
  [0.425, 0.51,    6],   // m exit
  // e
  [0.445, 0.53,    0],   // e approach
  [0.460, 0.55,   -4],   // e loop
  [0.475, 0.57,    4],   // e exit

  // ── word gap: pen lifts slightly ──
  [0.490, 0.58,    0],   // lift start
  [0.520, 0.62,   -2],   // floating between words (pen lifts)

  // P — capital again
  [0.540, 0.64,  -18],   // P top
  [0.555, 0.66,   12],   // P down
  [0.570, 0.67,  -14],   // P back up
  [0.590, 0.70,   -8],   // P bowl
  [0.605, 0.71,    4],   // P bowl exit
  // i
  [0.625, 0.74,    0],   // i stroke
  [0.635, 0.75,   -4],   // i uptick
  [0.645, 0.76,  -12],   // i dot (pen jumps up!)
  [0.655, 0.76,   -2],   // back to baseline
  // c
  [0.675, 0.79,   -4],   // c top
  [0.690, 0.80,    6],   // c curve
  [0.705, 0.82,   -2],   // c exit
  // k — ascender
  [0.725, 0.84,    2],   // k approach
  [0.745, 0.86,  -20],   // k ascender — HIGH
  [0.770, 0.87,   -8],   // k mid junction
  [0.790, 0.89,    0],   // k lower stroke
  [0.810, 0.91,    6],   // k kick
  // s
  [0.835, 0.93,    0],   // s top
  [0.855, 0.94,   -4],   // s upper curve
  [0.875, 0.95,    4],   // s lower curve
  [0.895, 0.96,    0],   // s exit

  // ── flourish tail ──
  [0.930, 0.98,    6],   // flourish dip
  [0.960, 0.99,    2],   // flourish rise
  [1.000, 1.00,    0],   // done
];

// Extract parallel arrays for interpolation
const PROG = PEN_PATH.map(([p]) => p);
const X_FRACS = PEN_PATH.map(([, x]) => x);
const Y_OFFSETS = PEN_PATH.map(([, , y]) => y);

interface Props {
  fontsLoaded: boolean;
  onReady?: () => void;
  onFinish: () => void;
}

export function HandwrittenSplash({ fontsLoaded, onReady, onFinish }: Props) {
  const writeProgress = useSharedValue(0);
  const taglineOpacity = useSharedValue(0);
  const containerOpacity = useSharedValue(0);
  const shimmer = useSharedValue(0);
  const wordmarkScale = useSharedValue(1);

  useEffect(() => {
    if (!fontsLoaded) return;

    containerOpacity.value = withTiming(1, {
      duration: 350,
      easing: Easing.out(Easing.cubic),
    });

    writeProgress.value = withTiming(1, {
      duration: WRITE_DURATION_MS,
      easing: Easing.bezier(0.42, 0.0, 0.58, 1.0),
    });

    shimmer.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 300, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.4, { duration: 300, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      true,
    );

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
      shimmer.value = 0;
    };
  }, [fontsLoaded]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
  }));

  const maskStyle = useAnimatedStyle(() => ({
    width: interpolate(
      writeProgress.value,
      [0, 1],
      [0, WORDMARK_WIDTH * 1.04],
      Extrapolation.CLAMP,
    ),
  }));

  // Pen follows the curved keyframe path instead of a straight line
  const penTipStyle = useAnimatedStyle(() => {
    const p = writeProgress.value;

    // Interpolate X position through the keyframe path
    const penX = interpolate(p, PROG, X_FRACS, Extrapolation.CLAMP) * WORDMARK_WIDTH;

    // Interpolate Y offset through the keyframe path
    const penY = interpolate(p, PROG, Y_OFFSETS, Extrapolation.CLAMP);

    // Add a micro-wiggle from the shimmer loop for hand-held feel
    const microWiggle = interpolate(
      shimmer.value,
      [0, 0.5, 1],
      [-0.8, 0.4, -0.6],
      Extrapolation.CLAMP,
    );

    // Tilt the pen — base angle + small jitter
    const baseTilt = -22;
    const tiltJitter = interpolate(
      shimmer.value,
      [0, 0.5, 1],
      [-1.2, 0.8, -0.8],
      Extrapolation.CLAMP,
    );

    return {
      transform: [
        { translateX: penX },
        { translateY: penY + microWiggle },
        { rotate: `${baseTilt + tiltJitter}deg` },
      ],
      opacity: p < 0.99 ? 1 : interpolate(p, [0.99, 1], [1, 0], Extrapolation.CLAMP),
    };
  });

  const wordmarkBreathStyle = useAnimatedStyle(() => ({
    transform: [{ scale: wordmarkScale.value }],
  }));

  const taglineStyle = useAnimatedStyle(() => ({
    opacity: taglineOpacity.value,
    transform: [
      {
        translateY: interpolate(
          taglineOpacity.value,
          [0, 1],
          [6, 0],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  return (
    <Animated.View
      style={[styles.container, containerStyle]}
      onLayout={() => onReady?.()}
    >
      <View style={styles.ornamentTop} />

      <Animated.View style={[styles.wordmarkSlot, wordmarkBreathStyle]}>
        <MaskedView
          style={styles.maskedRoot}
          maskElement={
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

        <Animated.View
          pointerEvents="none"
          style={[styles.penTipWrap, penTipStyle]}
        >
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
    backgroundColor: 'black',
  },
  wordmarkText: {
    fontFamily: 'PinyonScript_400Regular',
    fontSize: 76,
    color: COLORS.accent,
    textAlign: 'center',
    width: WORDMARK_WIDTH,
    lineHeight: WORDMARK_HEIGHT,
    includeFontPadding: false,
  },
  penTipWrap: {
    position: 'absolute',
    left: 0,
    top: '50%',
    width: 48,
    height: 64,
    marginLeft: -12,
    marginTop: -42,
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
