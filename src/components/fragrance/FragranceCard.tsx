import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING, TYPE, RADIUS, FONTS } from '@/src/constants/theme';
import type { Fragrance } from '@/src/stores/useCatalogStore';
import { useWardrobeStore } from '@/src/stores/useWardrobeStore';

interface Props {
  fragrance: Fragrance;
  variant?: 'hero' | 'medium' | 'small' | 'compact';
  /** Optional subtitle shown below the name on compact cards (e.g. celebrity names). */
  subtitle?: string;
  onPress?: () => void;
}

/**
 * Single fragrance card. Variants:
 *   - hero    — full-width, used for "Wear Today" on the home screen
 *   - medium  — ~280px wide, used in horizontal carousels [LEGACY — see LX-1]
 *   - small   — fixed 160 wide, grid use [LEGACY — see LX-1]
 *   - compact — horizontal row, ~100pt tall, image-left + text-middle.
 *               This is the default for home rails per LX-1.
 *
 * LOCKED UX DECISION LX-1 (2026-05-15, plans/MILESTONE-PLAN.md):
 * Home / Discover / brand swim lanes use `variant='compact'`. Do NOT
 * revert to large bottle-photo cards without re-asking the founder.
 * Rationale: founder feedback — big photos "look bush league"; compact
 * cards show more product by default and feel Sephora/Nordstrom-curated.
 */
export function FragranceCard({ fragrance, variant = 'medium', subtitle, onPress }: Props) {
  const router = useRouter();
  const handlePress = onPress ?? (() => router.push(`/fragrance/${fragrance.id}`));

  if (variant === 'hero') return <HeroCard fragrance={fragrance} onPress={handlePress} />;
  if (variant === 'compact') return <CompactCard fragrance={fragrance} subtitle={subtitle} onPress={handlePress} />;
  if (variant === 'small') return <SmallCard fragrance={fragrance} onPress={handlePress} />;
  return <MediumCard fragrance={fragrance} onPress={handlePress} />;
}

function HeroCard({ fragrance, onPress }: { fragrance: Fragrance; onPress: () => void }) {
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

function MediumCard({ fragrance, onPress }: { fragrance: Fragrance; onPress: () => void }) {
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

function SmallCard({ fragrance, onPress }: { fragrance: Fragrance; onPress: () => void }) {
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

/** Strip catalog noise from display name:
 *  - Pipe-separated suffixes: "Dancing Light | Eau de Parfum 100ml | Jasmine"
 *  - Dash-separated concentrations: "Y2K® - Extrait de Parfum" */
function cardDisplayName(raw: string): string {
  // Strip pipe suffixes first
  const pipeIdx = raw.indexOf('|');
  let name = pipeIdx > 0 ? raw.slice(0, pipeIdx).trim() : raw;
  // Strip " - Eau de ...", " - Extrait ...", " - Parfum ..." suffixes
  name = name.replace(/\s+-\s+(Eau de |Extrait de |Parfum|Cologne|EdT|EdP|EDP|EDT).*/i, '');
  return name;
}

function CompactCard({ fragrance, subtitle, onPress }: { fragrance: Fragrance; subtitle?: string; onPress: () => void }) {
  const accord = fragrance.top_accords[0];
  const inWardrobe = useWardrobeStore((s) => s.getByFragrance(fragrance.id));
  const addToWardrobe = useWardrobeStore((s) => s.add);

  const handleWant = () => {
    if (inWardrobe) {
      onPress();
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    addToWardrobe({
      fragrance_id: fragrance.id,
      status: 'want',
      unit_type: 'bottle',
      size_ml: 50,
      remaining_ml: 50,
    });
  };

  // For long brands, progressively tighten spacing and shrink font to fit.
  // "OLFACTIVE STUDIO" (16 chars) needs tighter spacing.
  // "RÉGIME DES FLEURS" (18 chars) also needs a smaller font.
  const brandText = fragrance.brand.toUpperCase();
  const brandStyle = brandText.length > 17
    ? [compactStyles.brand, { letterSpacing: 0.3, fontSize: 9.5 }]
    : brandText.length > 15
      ? [compactStyles.brand, { letterSpacing: 0.5 }]
      : compactStyles.brand;

  return (
    <Pressable onPress={onPress} style={compactStyles.wrap}>
      <View style={compactStyles.imageWrap}>
        <Image source={{ uri: fragrance.image_url }} style={compactStyles.image} />
      </View>
      <View style={compactStyles.content}>
        <Text style={brandStyle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{brandText}</Text>
        <Text style={compactStyles.name} numberOfLines={2}>{cardDisplayName(fragrance.name)}</Text>
        {subtitle ? (
          <Text style={compactStyles.subtitle} numberOfLines={1}>{subtitle}</Text>
        ) : accord ? (
          <View style={compactStyles.accordPill}>
            <Text style={compactStyles.accordText}>{accord}</Text>
          </View>
        ) : null}
      </View>
      <Pressable onPress={handleWant} hitSlop={8} style={compactStyles.heartBtn}>
        <Ionicons
          name={inWardrobe ? 'heart' : 'heart-outline'}
          size={18}
          color={inWardrobe ? COLORS.accent : COLORS.muted}
        />
      </Pressable>
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

const compactStyles = StyleSheet.create({
  wrap: {
    width: 300,
    height: 110,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginRight: SPACING.md,
  },
  imageWrap: {
    width: 80,
    height: 80,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    backgroundColor: COLORS.card2,
  },
  image: { width: '100%', height: '100%' },
  content: { flex: 1, justifyContent: 'center' },
  brand: { ...TYPE.eyebrow, fontSize: 11, marginBottom: 2 },
  name: {
    fontFamily: FONTS.serif,
    fontWeight: '600',
    fontSize: 15,
    color: COLORS.text,
    lineHeight: 19,
    marginBottom: 4,
  },
  accordPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.card2,
  },
  accordText: { fontSize: 10, color: COLORS.muted, fontWeight: '500' },
  subtitle: { ...TYPE.caption, fontSize: 10, color: COLORS.accent, fontStyle: 'italic' },
  heartBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
});
