import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, TYPE, RADIUS, FONTS } from '@/src/constants/theme';

interface Props {
  concentration?: string | null;
  fragrance_family?: string | null;
  release_year?: number | null;
  community_longevity?: number | null;
  community_sillage?: number | null;
  community_projection?: number | null;
}

function prettyConcentration(c: string | null | undefined): string {
  if (!c) return '—';
  const map: Record<string, string> = {
    edp: 'EDP',
    edt: 'EDT',
    parfum: 'Parfum',
    extrait: 'Extrait',
    cologne: 'Cologne',
    'eau de parfum': 'EDP',
    'eau de toilette': 'EDT',
    'extrait de parfum': 'Extrait',
    'eau de cologne': 'Cologne',
    'eau fraiche': 'Eau Fraîche',
  };
  return map[c.toLowerCase()] ?? c;
}

/**
 * Fact Strip — 2×3 Apple Weather-style grid showing key fragrance data at a glance.
 *
 * Row 1: Concentration | Family | Year
 * Row 2: Longevity | Sillage | Projection
 */
export function FactStripCard({
  concentration,
  fragrance_family,
  release_year,
  community_longevity,
  community_sillage,
  community_projection,
}: Props) {
  return (
    <View style={styles.card}>
      {/* Row 1 */}
      <View style={styles.row}>
        <Cell label="Concentration" value={prettyConcentration(concentration)} borderRight borderBottom />
        <Cell label="Family" value={fragrance_family ?? '—'} borderRight borderBottom />
        <Cell label="Year" value={release_year ? String(release_year) : '—'} borderBottom />
      </View>
      {/* Row 2 */}
      <View style={styles.row}>
        <Cell label="Longevity" value={community_longevity != null ? `${community_longevity.toFixed(1)}/5` : '—'} borderRight />
        <Cell label="Sillage" value={community_sillage != null ? `${community_sillage.toFixed(1)}/5` : '—'} borderRight />
        <Cell label="Projection" value={community_projection != null ? `${community_projection.toFixed(1)}/5` : '—'} />
      </View>
    </View>
  );
}

function Cell({
  label,
  value,
  borderRight,
  borderBottom,
}: {
  label: string;
  value: string;
  borderRight?: boolean;
  borderBottom?: boolean;
}) {
  return (
    <View
      style={[
        styles.cell,
        borderRight && styles.borderRight,
        borderBottom && styles.borderBottom,
      ]}
    >
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={styles.cellValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.md,
  },
  borderRight: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: COLORS.border,
  },
  borderBottom: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  cellLabel: {
    ...TYPE.eyebrow,
    fontSize: 9,
    color: COLORS.muted,
    marginBottom: 4,
  },
  cellValue: {
    fontFamily: FONTS.serif,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
});
