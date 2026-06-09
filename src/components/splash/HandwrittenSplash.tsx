import { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import Svg, { Path, Rect, Ellipse, Circle, Defs, LinearGradient, Stop, RadialGradient } from 'react-native-svg';
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
 * Antique fountain pen — detailed illustration, nib tip at SVG (12, 88).
 *
 * Anatomy (bottom-left tip → upper-right cap end):
 *   Nib → section collar → barrel → cap
 *
 * Pen is drawn at ~32° from horizontal so it looks naturally held.
 * Total SVG: 160 × 100. Rendered at 112 × 70.
 */
function FountainPen() {
  return (
    <View style={penStyles.wrap} pointerEvents="none">
      <Svg width={112} height={70} viewBox="0 0 160 100" fill="none">
        <Defs>
          {/* Barrel gradient — deep ebony with a cylindrical highlight */}
          <LinearGradient id="barrel" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#3A1A0A" />
            <Stop offset="30%" stopColor="#1E0D05" />
            <Stop offset="55%" stopColor="#5A2A10" />
            <Stop offset="100%" stopColor="#1E0D05" />
          </LinearGradient>
          {/* Nib gold gradient */}
          <LinearGradient id="nib" x1="100%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#E8C878" />
            <Stop offset="50%" stopColor="#B8924B" />
            <Stop offset="100%" stopColor="#8E6E36" />
          </LinearGradient>
          {/* Cap gradient */}
          <LinearGradient id="cap" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#4A2010" />
            <Stop offset="40%" stopColor="#1E0D05" />
            <Stop offset="70%" stopColor="#3A1A0A" />
            <Stop offset="100%" stopColor="#1E0D05" />
          </LinearGradient>
          {/* Gold ring gradient */}
          <LinearGradient id="ring" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#8E6E36" />
            <Stop offset="40%" stopColor="#E8C878" />
            <Stop offset="70%" stopColor="#D4B179" />
            <Stop offset="100%" stopColor="#8E6E36" />
          </LinearGradient>
          {/* Ink glow at nib tip */}
          <RadialGradient id="inkglow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#D4B179" stopOpacity="0.9" />
            <Stop offset="60%" stopColor="#B8924B" stopOpacity="0.4" />
            <Stop offset="100%" stopColor="#B8924B" stopOpacity="0" />
          </RadialGradient>
        </Defs>

        {/* ── Ink glow at nib contact point ── */}
        <Ellipse cx="12" cy="88" rx="6" ry="3" fill="url(#inkglow)" />

        {/* ── NIB ── gold teardrop; point at (12, 90) */}
        {/* Left tine */}
        <Path d="M 12 90 L 22 72 L 26 75 Z" fill="url(#nib)" />
        {/* Right tine */}
        <Path d="M 12 90 L 26 75 L 30 70 Z" fill="#D4B179" opacity="0.85" />
        {/* Nib centre highlight */}
        <Path
          d="M 14 87 L 24 71"
          stroke="#F0DC9A"
          strokeWidth="0.6"
          strokeLinecap="round"
          opacity="0.7"
        />
        {/* Nib slit — hairline down the centre */}
        <Path
          d="M 12 90 L 23 73"
          stroke="#5C2A0A"
          strokeWidth="0.7"
          strokeLinecap="round"
        />
        {/* Breather hole */}
        <Ellipse cx="22" cy="74" rx="1.2" ry="1.8"
          fill="#5C2A0A" transform="rotate(-32 22 74)" />

        {/* ── SECTION / COLLAR (connects nib to barrel) ── */}
        {/* Dark grip section */}
        <Path d="M 22 73 L 30 68 L 42 56 L 35 51 Z" fill="#140804" />
        {/* Collar gold ring at top of section */}
        <Path
          d="M 34 52 L 42 57 L 44 54 L 36 49 Z"
          fill="url(#ring)"
        />

        {/* ── BARREL ── long tapered body */}
        {/* Main barrel shape — slightly tapered, 4-sided */}
        <Path
          d="M 36 50 L 44 55 L 130 8 L 123 3 Z"
          fill="url(#barrel)"
        />
        {/* Barrel highlight — thin specular stripe */}
        <Path
          d="M 40 48 L 44 52 L 128 6"
          stroke="rgba(255,255,255,0.10)"
          strokeWidth="1.2"
          strokeLinecap="round"
          fill="none"
        />
        {/* Subtle secondary highlight for cylindrical sheen */}
        <Path
          d="M 37 52 L 126 5"
          stroke="rgba(90,42,16,0.6)"
          strokeWidth="1"
          strokeLinecap="round"
          fill="none"
        />

        {/* Gold trim ring at barrel centre */}
        <Path
          d="M 82 27 L 88 31 L 91 27 L 85 23 Z"
          fill="url(#ring)"
        />
        {/* Second thin ring just above */}
        <Path
          d="M 86 24 L 92 28 L 93 26 L 87 22 Z"
          fill="#B8924B"
        />

        {/* ── CAP ── slightly wider than barrel, rounded end */}
        {/* Cap body */}
        <Path
          d="M 122 3 L 130 8 L 155 -4 L 148 -9 Z"
          fill="url(#cap)"
        />
        {/* Cap band / trim ring */}
        <Path
          d="M 122 3 L 128 7 L 131 4 L 125 0 Z"
          fill="url(#ring)"
        />
        {/* Cap clip — thin gold strip along the top */}
        <Path
          d="M 131 3 L 155 -7 L 154 -9 L 130 1 Z"
          fill="#C4A060"
          opacity="0.9"
        />
        <Path
          d="M 130 1 L 154 -9"
          stroke="#E8C878"
          strokeWidth="0.5"
          opacity="0.5"
        />
        {/* Cap end — rounded */}
        <Ellipse
          cx="151" cy="-5" rx="5" ry="3"
          fill="#2A0E06"
          transform="rotate(-32 151 -5)"
        />
        {/* Cap end gold trim */}
        <Path
          d="M 148 -9 L 155 -4 L 157 -7 L 150 -12 Z"
          fill="#B8924B"
        />

        {/* ── SECTION shadow ── grounding shadow under nib */}
        <Ellipse cx="13" cy="91" rx="7" ry="1.5" fill="rgba(42,31,24,0.18)" />
      </Svg>
    </View>
  );
}

const penStyles = StyleSheet.create({
  wrap: { width: 112, height: 70 },
});

// ─────────────────────────────────────────────
//  Splash component
// ─────────────────────────────────────────────

const { width: SCREEN_W } = Dimensions.get('window');
const WORDMARK_WIDTH = Math.min(SCREEN_W - 48, 360);
const WORDMARK_HEIGHT = 110;

const WRITE_DURATION_MS = 1900;
const POST_HOLD_MS = 650;
const FADE_OUT_MS = 500;
const TOTAL_MS = WRITE_DURATION_MS + POST_HOLD_MS + FADE_OUT_MS + 200;

interface Props {
  fontsLoaded: boolean;
  onReady?: () => void;
  onFinish: () => void;
}

export function HandwrittenSplash({ fontsLoaded, onReady, onFinish }: Props) {
  const writeProgress = useSharedValue(0);
  const taglineOpacity = useSharedValue(0);
  // Start at 1 (fully opaque) so the splash immediately covers the home screen
  // behind it. The native splash hides first, then we're already visible — no
  // transparent frame where the wordmark on the home screen bleeds through.
  const containerOpacity = useSharedValue(1);
  // Stroke cadence — drives vertical oscillation
  const strokeTick = useSharedValue(0);
  const wordmarkScale = useSharedValue(1);

  useEffect(() => {
    if (!fontsLoaded) return;

    writeProgress.value = withTiming(1, {
      duration: WRITE_DURATION_MS,
      easing: Easing.bezier(0.42, 0, 0.58, 1),
    });

    // Stroke tick oscillates ~6× per second — drives the natural up/down bob
    strokeTick.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 160, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 160, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );

    taglineOpacity.value = withDelay(
      WRITE_DURATION_MS + 80,
      withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }),
    );

    wordmarkScale.value = withDelay(
      WRITE_DURATION_MS,
      withSequence(
        withTiming(1.015, { duration: 600, easing: Easing.inOut(Easing.quad) }),
        withTiming(1.0, { duration: 600, easing: Easing.inOut(Easing.quad) }),
      ),
    );

    const fadeAt = WRITE_DURATION_MS + POST_HOLD_MS;
    const fadeOutTimer = setTimeout(() => {
      containerOpacity.value = withTiming(
        0,
        { duration: FADE_OUT_MS, easing: Easing.in(Easing.cubic) },
        (finished) => { if (finished) runOnJS(onFinish)(); },
      );
    }, fadeAt);

    return () => {
      clearTimeout(fadeOutTimer);
      strokeTick.value = 0;
    };
  }, [fontsLoaded]);

  const containerStyle = useAnimatedStyle(() => ({ opacity: containerOpacity.value }));

  const maskStyle = useAnimatedStyle(() => ({
    width: interpolate(
      writeProgress.value,
      [0, 1],
      [0, WORDMARK_WIDTH * 1.06],
      Extrapolation.CLAMP,
    ),
  }));

  const wordmarkBreathStyle = useAnimatedStyle(() => ({
    transform: [{ scale: wordmarkScale.value }],
  }));

  const taglineStyle = useAnimatedStyle(() => ({
    opacity: taglineOpacity.value,
    transform: [
      { translateY: interpolate(taglineOpacity.value, [0, 1], [8, 0], Extrapolation.CLAMP) },
    ],
  }));

  const penStyle = useAnimatedStyle(() => {
    const p = writeProgress.value; // 0 → 1

    // ── Horizontal travel ──────────────────────────────────────────────────
    const x = interpolate(p, [0, 1], [0, WORDMARK_WIDTH + 8], Extrapolation.CLAMP);

    // ── Natural handwriting arc ────────────────────────────────────────────
    // A real cursive signature has:
    //  • slow lift-strokes (pen rises ~4-6px on upstrokes)
    //  • press-strokes pulling down (pen dips ~2px on downstrokes)
    //  • brief "lifts" between words where the pen barely touches paper
    //
    // We model this with two superimposed sine waves:
    //   A: slow baseline arc (one gentle curve across the whole word)
    //   B: per-letter oscillation (~7 cycles for "Perfume Picks")
    //   C: "space" lift — pen rises between the two words
    const TWO_PI = Math.PI * 2;

    // Slow arc — peak lift in the middle of each word, gentle dip at connections
    const slowArc = Math.sin(p * Math.PI * 2.4) * 5;

    // Per-letter bob — 7 letters in "Perfume" + 5 in "Picks" ≈ 12 oscillations
    const letterBob = Math.sin(p * TWO_PI * 6) * 3.5;

    // Stroke tick provides the live hand-tremor feel during writing
    const tick = strokeTick.value;
    const tremor = (tick - 0.5) * 3; // ±1.5px live tremor

    // Word-gap lift: around p=0.56 (between the two words) the pen lifts
    const wordGapDist = Math.abs(p - 0.56);
    const wordLift = wordGapDist < 0.06
      ? interpolate(wordGapDist, [0, 0.06], [-8, 0], Extrapolation.CLAMP)
      : 0;

    const y = slowArc + letterBob + tremor + wordLift;

    // Pen disappears as it finishes (lifts off after the last stroke)
    const penOpacity = p < 0.96
      ? 1
      : interpolate(p, [0.96, 1], [1, 0], Extrapolation.CLAMP);

    // ── Rotation ──────────────────────────────────────────────────────────
    // Base angle: ~-28° (pen tilted like a right-handed writer).
    // On upstrokes the pen tilts slightly more vertical (-32°);
    // on downstrokes it relaxes toward horizontal (-24°).
    // letterBob drives this — when the pen is rising the tilt increases.
    const baseTilt = -28;
    const strokeTilt = letterBob * 0.7; // ±2.5°

    return {
      opacity: penOpacity,
      transform: [
        { translateX: x },
        { translateY: y },
        { rotate: `${baseTilt + strokeTilt}deg` },
      ],
    };
  });

  return (
    <Animated.View style={[styles.container, containerStyle]} onLayout={() => onReady?.()}>
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

        {/* Pen anchored so nib tip (SVG 12, 88 → rendered ~8.4, 61.6)
            sits exactly on the wordmark writing baseline. */}
        <Animated.View pointerEvents="none" style={[styles.penWrap, penStyle]}>
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
    width: 0, // static initial state; Reanimated maskStyle overrides on animation start
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
  // Pen nib tip is at SVG (12, 88). Rendered at 0.7× scale → (8.4, 61.6).
  // We offset so the tip sits on the wordmark's visual baseline (centre of slot).
  penWrap: {
    position: 'absolute',
    left: 0,
    top: '50%',
    width: 112,
    height: 70,
    marginLeft: -8,    // nib x offset
    marginTop: -44,    // nib y sits on writing line
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
