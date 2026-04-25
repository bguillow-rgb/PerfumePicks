import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS, SPACING, TYPE, RADIUS, FONTS } from '@/src/constants/theme';
import type { MockFragrance } from '@/src/mock/fragrances';

interface Props {
  fragrance: MockFragrance;
  variant?: 'hero' | 'medium' | 'small';
  onPress?: () => void;
}

/**
 * Single fragrance card. Three sizes:
 *   - hero    — full-width, used for "Wear Today" on the home screen
 *   - medium  — ~280px wide, used in horizontal carousels
 *   - small   — fixed 160 wide, grid use
 */
export function FragranceCard({ fragrance, variant = 'medium', onPress }: Props) {
  const router = useRouter();
  const handlePress = onPress ?? (() => router.push(`/fragrance/${fragrance.id}`));

  if (variant === 'hero') return <HeroCard fragrance={fragrance} onPress={handlePress} />;
  if (variant === 'small') return <SmallCard fragrance={fragrance} onPress={handlePress} />;
  return <MediumCard fragrance={fragrance} onPress={handlePress} />;
}

function HeroCard({ fragrance, onPress }: { fragrance: MockFragrance; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={heroStyles.wrap}>
      <Image source={{ uri: fragrance.image_url }} style={heroStyles.image} />
      <View style={heroStyles.overlay} />
      <View style={heroStyles.content}>
        <Text style={heroStyles.brand}>{fragrance.brand}</Text>
        <Text style={heroStyles.name}>{fragrance.name}</Text>
        <View style={heroStyles.metaRow}>
          <Text style={heroStyles.meta}>{prettyConcentration(fragrance.concentration)}</Text>
          <Text style={heroStyles.dot}>·</Text>
          <Text style={heroStyles.meta}>{fragrance.fragrance_family}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function MediumCard({ fragrance, onPress }: { fragrance: MockFragrance; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={mediumStyles.wrap}>
      <View style={mediumStyles.imageWrap}>
        <Image source={{ uri: fragrance.image_url }} style={mediumStyles.image} />
      </View>
      <Text style={mediumStyles.brand} numberOfLines={1}>{fragrance.brand}</Text>
      <Text style={mediumStyles.name} numberOfLines={2}>{fragrance.name}</Text>
      <View style={mediumStyles.accordRow}>
        {fragrance.top_accords.slice(0, 2).map((a) => (
          <View key={a} style={mediumStyles.accordPill}>
            <Text style={mediumStyles.accordText}>{a}</Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

function SmallCard({ fragrance, onPress }: { fragrance: MockFragrance; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={smallStyles.wrap}>
      <View style={smallStyles.imageWrap}>
        <Image source={{ uri: fragrance.image_url }} style={smallStyles.image} />
      </View>
      <Text style={smallStyles.brand} numberOfLines={1}>{fragrance.brand}</Text>
      <Text style={smallStyles.name} numberOfLines={2}>{fragrance.name}</Text>
    </Pressable>
  );
}

function prettyConcentration(c: string | null | undefined): string {
  switch (c) {
    case 'parfum': return 'Parfum';
    case 'edp': return 'Eau de Parfum';
    case 'edt': return 'Eau de Toilette';
    case 'cologne': return 'Cologne';
    case 'extrait': return 'Extrait';
    default: return '';
  }
}

const heroStyles = StyleSheet.create({
  wrap: {
    height: 360,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.card2,
  },
  image: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(42,31,24,0.42)',
  },
  content: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: SPACING.lg,
  },
  brand: {
    ...TYPE.eyebrow,
    color: COLORS.accentSoft,
    marginBottom: 6,
  },
  name: {
    fontFamily: FONTS.serif,
    fontWeight: '600',
    fontSize: 32,
    color: COLORS.white,
    marginBottom: SPACING.sm,
    lineHeight: 38,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  meta: { ...TYPE.caption, color: COLORS.white, opacity: 0.85 },
  dot: { color: COLORS.white, opacity: 0.6 },
});

const mediumStyles = StyleSheet.create({
  wrap: { width: 200, marginRight: SPACING.md },
  imageWrap: {
    width: 200, height: 200,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    backgroundColor: COLORS.card2,
    marginBottom: SPACING.sm,
  },
  image: { width: '100%', height: '100%' },
  brand: { ...TYPE.eyebrow, fontSize: 10, marginTop: 2, marginBottom: 2 },
  name: {
    fontFamily: FONTS.serif,
    fontWeight: '600',
    fontSize: 17,
    color: COLORS.text,
    lineHeight: 22,
    marginBottom: 6,
  },
  accordRow: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  accordPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.card2,
  },
  accordText: { fontSize: 10, color: COLORS.muted, fontWeight: '500' },
});

const smallStyles = StyleSheet.create({
  wrap: { width: 140, marginRight: SPACING.sm },
  imageWrap: {
    width: 140, height: 140,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    backgroundColor: COLORS.card2,
    marginBottom: 6,
  },
  image: { width: '100%', height: '100%' },
  brand: { ...TYPE.eyebrow, fontSize: 9 },
  name: {
    fontFamily: FONTS.serif,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    lineHeight: 18,
  },
});
