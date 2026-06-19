import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polygon, Line, Circle, Text as SvgText } from 'react-native-svg';
import { COLORS, FONTS, TYPE } from '@/src/constants/theme';

/**
 * Accord radar — the "below the fold" diagnostic on THE REVEAL. Plots the user's
 * strongest accords as a filled polygon over a spoked web. Pure presentation:
 * takes the DNA's accord weights, normalizes to the max, draws. Falls back to a
 * quiet empty note if there are too few accords to form a shape.
 */

interface AccordRadarProps {
  accords: Record<string, number>;
  size?: number;
}

const MIN_AXES = 3;
const MAX_AXES = 7;

export function AccordRadar({ accords, size = 240 }: AccordRadarProps) {
  const entries = Object.entries(accords)
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_AXES);

  if (entries.length < MIN_AXES) {
    return (
      <View style={[styles.empty, { height: size * 0.6 }]} testID="dna-accord-radar">
        <Text style={styles.emptyText}>
          Your accord profile fills in as we learn more about your taste.
        </Text>
      </View>
    );
  }

  // The canvas is wider than the plotted web so the side axis labels (which
  // anchor outward) have room and don't clip at the screen edge.
  const labelPad = 56;
  const width = size + labelPad * 2;
  const cx = width / 2;
  const cy = size / 2;
  const radius = size * 0.34;
  const max = Math.max(...entries.map(([, w]) => w));
  const n = entries.length;

  // Start at top (−90°), go clockwise.
  const angleFor = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pointAt = (i: number, r: number) => {
    const a = angleFor(i);
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  };

  const dataPoints = entries.map(([, w], i) => {
    const r = radius * (0.18 + 0.82 * (w / max)); // floor so a zero-ish axis still shows
    return pointAt(i, r);
  });
  const polygon = dataPoints.map((p) => `${p.x},${p.y}`).join(' ');

  // Two reference rings (50% / 100%).
  const ring = (frac: number) =>
    entries.map((_, i) => {
      const p = pointAt(i, radius * frac);
      return `${p.x},${p.y}`;
    }).join(' ');

  return (
    <View style={styles.wrap} testID="dna-accord-radar">
      <Svg width={width} height={size}>
        <Polygon points={ring(1)} fill="none" stroke={COLORS.border} strokeWidth={1} />
        <Polygon points={ring(0.5)} fill="none" stroke={COLORS.border} strokeWidth={1} />
        {entries.map((_, i) => {
          const p = pointAt(i, radius);
          return (
            <Line key={`spoke-${i}`} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={COLORS.border} strokeWidth={1} />
          );
        })}
        <Polygon points={polygon} fill={COLORS.accentSoft} fillOpacity={0.45} stroke={COLORS.accent} strokeWidth={2} />
        {dataPoints.map((p, i) => (
          <Circle key={`dot-${i}`} cx={p.x} cy={p.y} r={3} fill={COLORS.accent} />
        ))}
        {entries.map(([label], i) => {
          const p = pointAt(i, radius + 14);
          return (
            <SvgText
              key={`lbl-${i}`}
              x={p.x}
              y={p.y}
              fill={COLORS.muted}
              fontSize={10}
              fontFamily={FONTS.body}
              textAnchor={p.x > cx + 4 ? 'start' : p.x < cx - 4 ? 'end' : 'middle'}
              alignmentBaseline="middle"
            >
              {label}
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  emptyText: { ...TYPE.bodySmall, color: COLORS.muted, textAlign: 'center' },
});
