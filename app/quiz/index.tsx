import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInRight, FadeOutLeft } from 'react-native-reanimated';
import { COLORS, SPACING, TYPE, FONTS, RADIUS } from '@/src/constants/theme';
import { useQuizStore } from '@/src/stores/useQuizStore';
import { useProStore } from '@/src/stores/useProStore';

/**
 * Fragrance taste quiz — 3 questions for free users, 9 for Pro.
 *
 * Free users see questions 1–3. After answering Q3 they hit a paywall
 * intercept. Answers are preserved in the transient useQuizStore so if they
 * subscribe and return (returnTo='/quiz'), the quiz resumes from Q4.
 *
 * Pro users see all 9 questions and get a more precise results ranking.
 *
 * Each answer feeds the user_taste_profile (preferred_families,
 * preferred_accords, avg_price_tier, longevity, season, etc.).
 */

interface QuizQuestion {
  id: string;
  question: string;
  cursive: string;
  options: { id: string; label: string; description?: string }[];
}

/** First 3 questions — available to everyone. */
const FREE_QUESTIONS: QuizQuestion[] = [
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

/** Questions 4–9 — Pro only. */
const PRO_QUESTIONS: QuizQuestion[] = [
  {
    id: 'season',
    question: 'Which season do you gravitate toward?',
    cursive: 'season',
    options: [
      { id: 'spring', label: 'Spring', description: 'Fresh blooms and dewy green' },
      { id: 'summer', label: 'Summer', description: 'Bright citrus and sea air' },
      { id: 'fall', label: 'Autumn', description: 'Warm spice and damp earth' },
      { id: 'winter', label: 'Winter', description: 'Rich amber and velvet smoke' },
    ],
  },
  {
    id: 'longevity',
    question: 'How long should a scent last?',
    cursive: 'lasting',
    options: [
      { id: '2', label: 'A few hours', description: 'Skin-close and intimate' },
      { id: '3', label: 'Half a day', description: 'Moderate — a gentle presence' },
      { id: '4', label: 'All day', description: 'Confident and consistent' },
      { id: '5', label: 'Into tomorrow', description: 'Beast mode — make a statement' },
    ],
  },
  {
    id: 'sillage',
    question: 'How much space should it fill?',
    cursive: 'presence',
    options: [
      { id: 'intimate', label: 'Just for you', description: 'A whisper — only on close contact' },
      { id: 'moderate', label: 'Subtle trail', description: 'Detectable when you move' },
      { id: 'strong', label: 'Walks in first', description: 'The room knows you arrived' },
    ],
  },
  {
    id: 'avoid',
    question: 'Anything you want to avoid?',
    cursive: 'off-notes',
    options: [
      { id: 'none', label: 'No hard limits', description: 'Open to everything' },
      { id: 'sweet', label: 'Too sweet', description: 'No candy, dessert or syrup notes' },
      { id: 'heavy', label: 'Too heavy', description: 'No deep musks or animalic notes' },
      { id: 'sharp', label: 'Too sharp', description: 'No harsh aldehydes or cold citrus' },
    ],
  },
  {
    id: 'gender',
    question: 'How do you read gender in fragrance?',
    cursive: 'identity',
    options: [
      { id: 'fem', label: 'Classically feminine', description: 'Florals, powders, delicate musks' },
      { id: 'masc', label: 'Classically masculine', description: 'Fougères, woods, aquatics' },
      { id: 'androgynous', label: 'Right down the middle', description: 'Unisex — no leaning either way' },
      { id: 'contrast', label: 'I like the contrast', description: 'Wearing something unexpected' },
    ],
  },
  {
    id: 'discovery',
    question: 'How adventurous is your nose?',
    cursive: 'explore',
    options: [
      { id: 'classic', label: 'Classics only', description: 'Proven icons — I know what I like' },
      { id: 'curated', label: 'Guided exploration', description: 'Surprise me, but stay in my lane' },
      { id: 'wild', label: 'Push my limits', description: 'Challenging, weird, unforgettable' },
    ],
  },
];

const ALL_QUESTIONS = [...FREE_QUESTIONS, ...PRO_QUESTIONS];
const FREE_QUESTION_COUNT = FREE_QUESTIONS.length;

export default function QuizScreen() {
  const router = useRouter();
  // returnTo is set when the user arrives from a paywall intercept — use it for the back destination
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { setAnswer, reset, answers } = useQuizStore();
  const isPro = useProStore((s) => s.isPro);

  // If a Pro user arrives via paywall returnTo, resume from Q4.
  // For free users, always clamp to 0 — they can't resume into Pro questions.
  const questions = isPro ? ALL_QUESTIONS : FREE_QUESTIONS;
  const resumeStep = isPro && Object.keys(answers).length >= FREE_QUESTION_COUNT
    ? FREE_QUESTION_COUNT
    : 0;
  const [step, setStep] = useState(resumeStep);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // showTease: shown to free users after Q2, teasing the 6 Pro questions before the paywall
  const [showTease, setShowTease] = useState(false);

  const total = questions.length;
  const q = questions[step];
  const progress = (step + 1) / total;

  const handleSelect = (optId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedId(optId);       // immediate visual highlight
    if (step === 0) reset();   // fresh run clears prior answers
    setAnswer(q.id, optId);

    setTimeout(() => {
      const nextStep = step + 1;
      setSelectedId(null);       // clear highlight on step transition
      if (!isPro && nextStep === FREE_QUESTION_COUNT - 1) {
        // Free user just answered Q2 — show the Pro tease before Q3
        setShowTease(true);
        setStep(nextStep);
        return;
      }
      if (!isPro && nextStep === FREE_QUESTION_COUNT) {
        // Free user answered Q3 — intercept with paywall
        router.push('/paywall?returnTo=/quiz');
        return;
      }
      if (nextStep < questions.length) {
        setStep(nextStep);
      } else {
        router.replace('/quiz/results');
      }
    }, 220);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => {
          if (step === 0) {
            // If we arrived via returnTo (e.g. from paywall), go to home not back to paywall
            if (returnTo) router.replace('/(tabs)');
            else router.back();
          } else {
            setStep(step - 1);
          }
        }}>
          <Ionicons name="chevron-back" size={26} color={COLORS.text} />
        </Pressable>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.progressText}>{step + 1} of {total}</Text>
      </View>

      {/* Pro tease banner — shown on Q3 for free users, right before the paywall intercept */}
      {!isPro && showTease && step === FREE_QUESTION_COUNT - 1 && (
        <Pressable style={styles.teaseBanner} onPress={() => router.push('/paywall?returnTo=/quiz')}>
          <Ionicons name="sparkles-outline" size={16} color={COLORS.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.teaseBannerTitle}>6 deeper questions unlock with Pro</Text>
            <Text style={styles.teaseBannerBody}>Season, longevity, sillage, and more — your most precise match yet.</Text>
          </View>
          <Text style={styles.teaseBannerCta}>Unlock →</Text>
        </Pressable>
      )}

      <Animated.View
        key={q.id}
        entering={FadeInRight.duration(280)}
        exiting={FadeOutLeft.duration(180)}
        style={styles.body}
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
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>{o.label}</Text>
                  {o.description && <Text style={[styles.optionDesc, isSelected && styles.optionDescSelected]}>{o.description}</Text>}
                </View>
                <Ionicons name={isSelected ? 'checkmark' : 'chevron-forward'} size={18} color={isSelected ? COLORS.accent : COLORS.muted} />
              </Pressable>
            );
          })}
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, gap: SPACING.md,
  },
  progressTrack: { flex: 1, height: 3, backgroundColor: COLORS.border, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: COLORS.accent, borderRadius: 2 },
  progressText: { ...TYPE.caption },
  teaseBanner: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    marginHorizontal: SPACING.lg, marginBottom: SPACING.md,
    backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.accent,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
  },
  teaseBannerTitle: { fontFamily: FONTS.serif, fontSize: 14, fontWeight: '600', color: COLORS.text },
  teaseBannerBody: { ...TYPE.caption, color: COLORS.muted, marginTop: 2, fontStyle: 'italic' },
  teaseBannerCta: { ...TYPE.label, color: COLORS.accent, fontSize: 12 },
  body: { flex: 1, paddingHorizontal: SPACING.lg, paddingTop: SPACING.xl },
  eyebrow: { ...TYPE.eyebrow },
  cursive: { fontFamily: 'PinyonScript_400Regular', fontSize: 32, color: COLORS.accent, lineHeight: 42, marginTop: 4 },
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
});
