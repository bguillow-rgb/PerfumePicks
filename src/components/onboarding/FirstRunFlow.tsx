import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ScrollView, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInRight, FadeOutLeft } from 'react-native-reanimated';
import { COLORS, SPACING, TYPE, FONTS, RADIUS } from '@/src/constants/theme';
import { useQuizStore } from '@/src/stores/useQuizStore';

/**
 * Cold-start first-run flow. Three phases, shown once per install:
 *
 *   1. welcome — single "Welcome to Perfume Picks" card.
 *   2. quiz    — 3 MANDATORY seed questions (family, occasion, price). Not
 *                skippable. Each answer is written to useQuizStore, which the
 *                recommendation engine consumes directly — so finishing this
 *                seeds the app's taste profile from a cold start.
 *   3. tour    — 3 SKIPPABLE feature slides ("show me around").
 *
 * onDone fires after the tour (or when the tour is skipped) and marks
 * onboarding complete. The quiz cannot be bypassed; only the tour can.
 */

interface QuizQuestion {
  id: string;
  question: string;
  cursive: string;
  options: { id: string; label: string; description?: string }[];
}

// Verbatim from app/quiz/index.tsx FREE_QUESTIONS — the 3 keys the rec engine
// uses for cold-start seeding: family, occasion, price.
const SEED_QUESTIONS: QuizQuestion[] = [
  {
    id: 'family',
    question: 'Which world calls to you?',
    cursive: 'mood',
    options: [
      { id: 'floral', label: 'Floral Garden', description: 'Rose, jasmine, peony, iris' },
      { id: 'oriental', label: 'Warm Orient', description: 'Amber, vanilla, spice, resin' },
      { id: 'woody', label: 'Sacred Wood', description: 'Sandalwood, cedar, oud, vetiver' },
      { id: 'fresh', label: 'Fresh Air', description: 'Citrus, green, aquatic, herbal' },
      { id: 'gourmand', label: 'Sweet Indulgence', description: 'Vanilla, caramel, cherry, honey' },
    ],
  },
  {
    id: 'occasion',
    question: 'When will you wear it most?',
    cursive: 'moment',
    options: [
      { id: 'office', label: 'Daytime · Office', description: 'Refined and discreet' },
      { id: 'date', label: 'Date Night', description: 'Sensual and memorable' },
      { id: 'casual', label: 'Everyday Casual', description: 'Easy and confident' },
      { id: 'formal', label: 'Black Tie', description: 'Statement and elevated' },
    ],
  },
  {
    id: 'price',
    question: 'Your usual investment?',
    cursive: 'budget',
    options: [
      { id: '1', label: 'Under $50', description: 'Approachable + fun' },
      { id: '2', label: '$50–$120', description: 'Department store darlings' },
      { id: '3', label: '$120–$250', description: 'Designer luxury' },
      { id: '4', label: '$250+', description: 'Niche house treasures' },
    ],
  },
];

interface Slide {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}

// Feature tour — same content as the retired FirstRunOverlay (minus the welcome
// slide, which is now its own phase).
const TOUR_SLIDES: Slide[] = [
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

type Phase = 'welcome' | 'quiz' | 'tour';

export function FirstRunFlow({ visible, onDone }: { visible: boolean; onDone: () => void }) {
  const { width } = useWindowDimensions();
  const setAnswer = useQuizStore((s) => s.setAnswer);
  const reset = useQuizStore((s) => s.reset);

  const [phase, setPhase] = useState<Phase>('welcome');
  const [quizStep, setQuizStep] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tourIndex, setTourIndex] = useState(0);

  // --- quiz handlers ---
  const q = SEED_QUESTIONS[quizStep];
  const quizProgress = (quizStep + 1) / SEED_QUESTIONS.length;

  const handleSelect = (optId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedId(optId);
    if (quizStep === 0) reset(); // fresh seed — clear any stale answers
    setAnswer(q.id, optId);

    setTimeout(() => {
      const next = quizStep + 1;
      setSelectedId(null);
      if (next < SEED_QUESTIONS.length) {
        setQuizStep(next);
      } else {
        setPhase('tour');
      }
    }, 220);
  };

  // --- tour handlers ---
  const slide = TOUR_SLIDES[tourIndex];
  const isLastSlide = tourIndex === TOUR_SLIDES.length - 1;
  const advanceTour = () => {
    if (isLastSlide) onDone();
    else setTourIndex((i) => i + 1);
  };

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={() => {}}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {phase === 'welcome' && (
          <View style={styles.welcomeWrap}>
            <View style={styles.iconWrap}>
              <Ionicons name="sparkles" size={40} color={COLORS.accent} />
            </View>
            <Text style={styles.welcomeTitle}>Welcome to Perfume Picks</Text>
            <Text style={styles.welcomeBody}>
              Three quick questions so we can learn what you love — then we'll tell you exactly what to wear and what to buy next.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
              onPress={() => setPhase('quiz')}
            >
              <Text style={styles.ctaText}>Get Started</Text>
              <Ionicons name="arrow-forward" size={15} color={COLORS.white} />
            </Pressable>
            <Text style={styles.welcomeFoot}>Takes about 20 seconds</Text>
          </View>
        )}

        {phase === 'quiz' && (
          <>
            <View style={styles.quizHeader}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${quizProgress * 100}%` }]} />
              </View>
              <Text style={styles.progressText}>{quizStep + 1} of {SEED_QUESTIONS.length}</Text>
            </View>

            <Animated.View
              key={q.id}
              entering={FadeInRight.duration(280)}
              exiting={FadeOutLeft.duration(180)}
              style={styles.quizBody}
            >
              <Text style={styles.eyebrow}>QUESTION</Text>
              <Text style={styles.cursive}>{q.cursive}</Text>
              <Text style={styles.question}>{q.question}</Text>

              <ScrollView contentContainerStyle={styles.options} showsVerticalScrollIndicator={false}>
                {q.options.map((o) => {
                  const isSelected = selectedId === o.id;
                  return (
                    <Pressable
                      key={o.id}
                      style={[styles.option, isSelected && styles.optionSelected]}
                      onPress={() => handleSelect(o.id)}
                      accessibilityLabel={o.label}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>{o.label}</Text>
                        {o.description && (
                          <Text style={[styles.optionDesc, isSelected && styles.optionDescSelected]}>{o.description}</Text>
                        )}
                      </View>
                      <Ionicons
                        name={isSelected ? 'checkmark' : 'chevron-forward'}
                        size={18}
                        color={isSelected ? COLORS.accent : COLORS.muted}
                      />
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Animated.View>
          </>
        )}

        {phase === 'tour' && (
          <View style={styles.tourWrap}>
            <Pressable style={styles.skip} onPress={onDone} hitSlop={12} accessibilityLabel="Skip tour">
              <Text style={styles.skipText}>Skip</Text>
            </Pressable>

            <View style={[styles.tourCard, { width: Math.min(width - SPACING.xl * 2, 360) }]}>
              <View style={styles.iconWrap}>
                <Ionicons name={slide.icon} size={40} color={COLORS.accent} />
              </View>
              <Text style={styles.welcomeTitle}>{slide.title}</Text>
              <Text style={styles.welcomeBody}>{slide.body}</Text>

              <View style={styles.dots}>
                {TOUR_SLIDES.map((_, i) => (
                  <View key={i} style={[styles.dot, i === tourIndex && styles.dotActive]} />
                ))}
              </View>

              <Pressable
                style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
                onPress={advanceTour}
              >
                <Text style={styles.ctaText}>{isLastSlide ? "Let's go" : 'Next'}</Text>
                <Ionicons name="arrow-forward" size={15} color={COLORS.white} />
              </Pressable>
            </View>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },

  // Welcome phase
  welcomeWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    gap: SPACING.sm,
  },
  welcomeTitle: {
    fontFamily: FONTS.serif,
    fontSize: 26,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 32,
  },
  welcomeBody: {
    ...TYPE.bodySmall,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: SPACING.sm,
    marginBottom: SPACING.md,
  },
  welcomeFoot: { ...TYPE.caption, marginTop: SPACING.sm },
  iconWrap: {
    width: 72, height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.blushSoft,
    borderWidth: 1,
    borderColor: COLORS.blush,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },

  // Quiz phase
  quizHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, gap: SPACING.md,
  },
  progressTrack: { flex: 1, height: 3, backgroundColor: COLORS.border, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: COLORS.accent, borderRadius: 2 },
  progressText: { ...TYPE.caption },
  quizBody: { flex: 1, paddingHorizontal: SPACING.lg, paddingTop: SPACING.xl },
  eyebrow: { ...TYPE.eyebrow },
  cursive: { fontFamily: 'PinyonScript_400Regular', fontSize: 32, color: COLORS.accent, lineHeight: 50, marginTop: 4, paddingLeft: 8 },
  question: {
    fontFamily: FONTS.serif, fontSize: 32, fontWeight: '600', color: COLORS.text,
    marginTop: SPACING.sm, marginBottom: SPACING.xl, lineHeight: 38,
  },
  options: { gap: SPACING.sm, paddingBottom: SPACING.xxl },
  option: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.md,
    gap: SPACING.md,
  },
  optionLabel: { fontFamily: FONTS.serif, fontSize: 19, fontWeight: '600', color: COLORS.text },
  optionDesc: { ...TYPE.bodySmall, marginTop: 2, fontStyle: 'italic' },
  optionSelected: { borderColor: COLORS.accent, backgroundColor: COLORS.blushSoft ?? '#f5ede8', borderWidth: 1.5 },
  optionLabelSelected: { color: COLORS.burgundy ?? COLORS.accent },
  optionDescSelected: { color: COLORS.burgundy ?? COLORS.accent, opacity: 0.75 },

  // Tour phase
  tourWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  tourCard: { alignItems: 'center', gap: SPACING.sm },
  skip: { position: 'absolute', top: SPACING.lg, right: SPACING.lg, zIndex: 2 },
  skipText: { ...TYPE.label, fontSize: 12, color: COLORS.muted, letterSpacing: 0.5 },
  dots: { flexDirection: 'row', gap: 6, marginVertical: SPACING.md },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.border },
  dotActive: { backgroundColor: COLORS.accent, width: 18 },

  // Shared CTA
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
