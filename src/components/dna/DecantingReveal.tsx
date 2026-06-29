import { useEffect, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  Canvas,
  Circle,
  Group,
  Path,
  RadialGradient,
  BlurMask,
  Skia,
  vec,
} from '@shopify/react-native-skia';
import Animated, {
  useSharedValue,
  useDerivedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Extrapolation,
  Easing,
  useReducedMotion,
} from 'react-native-reanimated';

/**
 * DecantingReveal — the M3 Skia "decanting" moment for the DNA reveal.
 *
 * Replaces the old plain emblem fade-in. A single archetype-tinted droplet falls
 * into a circular vessel and POURS it full from the bottom (a settling meniscus
 * wobble + a radial sillage glow + one specular glint), then the archetype icon
 * lands. The success haptic fires exactly as the pour completes, so the emotional
 * payoff (name + buzz) lands together. One-shot, ~1.9s, then idle — no loops.
 *
 * The liquid colour is the archetype's `tint`, so every archetype decants its own
 * hue. Honours Reduce Motion: renders the filled vessel instantly (progress=1),
 * no animation, single haptic.
 *
 * Geometry is self-contained in a 140×168 canvas; the caller just drops it where
 * the 60px emblem used to sit. testID is forwarded so the existing reveal asserts
 * (`dna-reveal-emblem`) keep working.
 */

const W = 140;
const H = 168;
const CX = 70;
const CY = 100;
const R = 44;
const VESSEL_BOTTOM = CY + R;
const MAX_FILL = 2 * R * 0.72; // fill to ~72% of the vessel height
const DURATION = 1900;
const LAND_MS = 1500; // pour-complete beat → haptic + icon
const ICON_SIZE = 34;

interface DecantingRevealProps {
  /** Archetype liquid colour (hex). */
  tint: string;
  /** Ionicon name for the archetype emblem. */
  icon: string;
  testID?: string;
}

const CLAMP = Extrapolation.CLAMP;

export function DecantingReveal({ tint, icon, testID }: DecantingRevealProps) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(reduced ? 1 : 0);

  // Circular clip for the liquid + glint. Geometry is constant, so build the
  // native SkPath ONCE per mount (not per render). Created here in render — NOT
  // at module scope — so it runs after Skia's native module is initialized;
  // a module-load-time Skia.Path.Make() can fire before Skia is ready.
  const clip = useMemo(() => {
    const p = Skia.Path.Make();
    p.addCircle(CX, CY, R);
    return p;
  }, []);

  useEffect(() => {
    if (!reduced) {
      progress.value = withTiming(1, { duration: DURATION, easing: Easing.out(Easing.cubic) });
    }
    const id = setTimeout(
      () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
      reduced ? 0 : LAND_MS,
    );
    return () => clearTimeout(id);
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Liquid body: a filled path whose top edge is a settling sine meniscus.
  const liquid = useDerivedValue(() => {
    const p = progress.value;
    const fill = interpolate(p, [0.18, 0.72], [0, MAX_FILL], CLAMP);
    const topY = VESSEL_BOTTOM - fill;
    const amp = interpolate(p, [0.18, 0.5, 0.95], [0, 5, 0.6], CLAMP);
    const phase = p * 12;
    const path = Skia.Path.Make();
    const left = CX - R;
    const right = CX + R;
    path.moveTo(left, VESSEL_BOTTOM);
    path.lineTo(left, topY);
    const steps = 14;
    for (let i = 0; i <= steps; i++) {
      const x = left + (right - left) * (i / steps);
      const y = topY + Math.sin(phase + (i / steps) * Math.PI * 2) * amp;
      path.lineTo(x, y);
    }
    path.lineTo(right, VESSEL_BOTTOM);
    path.close();
    return path;
  });

  // Falling droplet (kicks off the pour), fades as it merges into the surface.
  const dropletY = useDerivedValue(() => interpolate(progress.value, [0, 0.28], [14, CY - R + 6], CLAMP));
  const dropletOpacity = useDerivedValue(() => interpolate(progress.value, [0, 0.2, 0.28], [1, 1, 0], CLAMP));

  // Sillage glow blooming behind the ring as it fills.
  const glowOpacity = useDerivedValue(() => interpolate(progress.value, [0.3, 0.85], [0, 0.5], CLAMP));

  // One specular glint sweeping across the filled liquid near the end.
  const glintX = useDerivedValue(() => interpolate(progress.value, [0.72, 0.95], [CX - R, CX + R], CLAMP));
  const glintOpacity = useDerivedValue(() => interpolate(progress.value, [0.72, 0.82, 0.95], [0, 0.28, 0], CLAMP));

  // Icon (RN overlay) lands as the pour completes.
  const iconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.78, 1], [0, 1], CLAMP),
    transform: [{ scale: interpolate(progress.value, [0.78, 1], [0.5, 1], CLAMP) }],
  }));

  return (
    <View style={styles.wrap} testID={testID}>
      <Canvas style={styles.canvas}>
        {/* Sillage glow behind the vessel. */}
        <Circle cx={CX} cy={CY} r={R * 1.5} opacity={glowOpacity}>
          <RadialGradient c={vec(CX, CY)} r={R * 1.5} colors={[`${tint}66`, `${tint}00`]} />
          <BlurMask blur={10} style="normal" />
        </Circle>

        {/* Faint resting tint inside the vessel. */}
        <Circle cx={CX} cy={CY} r={R} color={`${tint}12`} />

        {/* Poured liquid + specular glint, clipped to the vessel. */}
        <Group clip={clip}>
          <Path path={liquid} color={tint} />
          <Circle cx={glintX} cy={CY + 6} r={10} color="#FFFFFF" opacity={glintOpacity}>
            <BlurMask blur={8} style="normal" />
          </Circle>
        </Group>

        {/* Falling droplet. */}
        <Circle cx={CX} cy={dropletY} r={5} color={tint} opacity={dropletOpacity} />

        {/* Vessel ring. */}
        <Circle cx={CX} cy={CY} r={R} color={tint} style="stroke" strokeWidth={2} />
      </Canvas>

      {/* Archetype icon overlay (Skia can't render the icon font). */}
      <Animated.View style={[styles.iconWrap, iconStyle]} pointerEvents="none">
        <Ionicons name={icon as any} size={ICON_SIZE} color={tint} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: W, height: H, alignItems: 'center', justifyContent: 'center' },
  canvas: { width: W, height: H },
  iconWrap: {
    position: 'absolute',
    left: CX - ICON_SIZE / 2,
    top: CY - ICON_SIZE / 2,
    width: ICON_SIZE,
    height: ICON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
