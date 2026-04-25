import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInRight, FadeOutLeft } from 'react-native-reanimated';
import { COLORS, SPACING, TYPE, FONTS, RADIUS } from '@/src/constants/theme';

/**
 * Fragrance taste quiz — 3-question free version, expanded for Pro.
 *
 * Each answer feeds the user_taste_profile (preferred_families,
 * preferred_accords, avg_price_tier). For now we just collect answers and
 * route to /quiz/results with an emotional-payoff screen.
 */

interface QuizQuestion {
  id: string;
  question: string;
  cursive: string;
  options: { id: string; label: string; description?: string }[];
}

const QUESTIONS: QuizQuestion[] = [
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

export default function QuizScreen() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const total = QUESTIONS.length;
  const q = QUESTIONS[step];
  const progress = (step + 1) / total;

  const handleSelect = (optId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = { ...answers, [q.id]: optId };
    setAnswers(next);
    setTimeout(() => {
      if (step + 1 < total) {
        setStep(step + 1);
      } else {
        router.replace({ pathname: '/quiz/results', params: { answers: JSON.stringify(next) } });
      }
    }, 220);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => (step === 0 ? router.back() : setStep(step - 1))}>
          <Ionicons name="chevron-back" size={26} color={COLORS.text} />
        </Pressable>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.progressText}>{step + 1} of {total}</Text>
      </View>

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
          {q.options.map((o) => (
            <Pressable key={o.id} style={styles.option} onPress={() => handleSelect(o.id)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.optionLabel}>{o.label}</Text>
                {o.description && <Text style={styles.optionDesc}>{o.description}</Text>}
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
            </Pressable>
          ))}
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
});
