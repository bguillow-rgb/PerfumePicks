import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, FONTS, RADIUS } from '@/src/constants/theme';

/**
 * First-run tap-through intro. Four slides explaining the core surfaces, fully
 * skippable. Shown once per install (gated by useOnboardingStore). Pure
 * presentational — the parent decides visibility and handles completion.
 */

interface Slide {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    icon: 'sparkles',
    title: 'Welcome to Perfume Picks',
    body: 'Your personal fragrance concierge. We learn what you love and tell you exactly what to wear — and what to buy next.',
  },
  {
    icon: 'flask-outline',
    title: 'Build your wardrobe',
    body: 'Add the bottles you own. Each morning we pick your Scent of the Day from your collection — and tell you why it fits.',
  },
  {
    icon: 'rose-outline',
    title: 'Train your nose',
    body: 'Swipe through fragrances in Taste. The more you swipe, the sharper your matches get — so we surface the best scents for you.',
  },
  {
    icon: 'pricetag-outline',
    title: "Don't pay a fortune",
    body: 'Love something pricey? We rank the dupes that smell the same for less — so you can smell rich without the splurge.',
  },
];

export function FirstRunOverlay({ visible, onDone }: { visible: boolean; onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const { width } = useWindowDimensions();
  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;

  const next = () => {
    if (isLast) onDone();
    else setIndex((i) => i + 1);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDone}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { width: Math.min(width - SPACING.xl * 2, 360) }]}>
          <Pressable style={styles.skip} onPress={onDone} hitSlop={12} accessibilityLabel="Skip intro">
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>

          <View style={styles.iconWrap}>
            <Ionicons name={slide.icon} size={40} color={COLORS.accent} />
          </View>

          <Text style={styles.title}>{slide.title}</Text>
          <Text style={styles.body}>{slide.body}</Text>

          <View style={styles.dots}>
            {SLIDES.map((_, i) => (
              <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
            ))}
          </View>

          <Pressable style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]} onPress={next}>
            <Text style={styles.ctaText}>{isLast ? "Let's go" : 'Next'}</Text>
            <Ionicons name="arrow-forward" size={15} color={COLORS.white} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  card: {
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    alignItems: 'center',
    gap: SPACING.sm,
  },
  skip: { position: 'absolute', top: SPACING.md, right: SPACING.md, zIndex: 2 },
  skipText: { ...TYPE.label, fontSize: 12, color: COLORS.muted, letterSpacing: 0.5 },
  iconWrap: {
    width: 72, height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.blushSoft,
    borderWidth: 1,
    borderColor: COLORS.blush,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  title: {
    fontFamily: FONTS.serif,
    fontSize: 22,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 28,
  },
  body: {
    ...TYPE.bodySmall,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 21,
    paddingHorizontal: SPACING.xs,
  },
  dots: { flexDirection: 'row', gap: 6, marginVertical: SPACING.md },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.border },
  dotActive: { backgroundColor: COLORS.accent, width: 18 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.accent,
    paddingVertical: 14,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADIUS.full,
    alignSelf: 'stretch',
  },
  ctaText: { ...TYPE.label, color: COLORS.white, fontSize: 14, letterSpacing: 1 },
});
