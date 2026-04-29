import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInRight, FadeOutLeft } from 'react-native-reanimated';
import { COLORS, SPACING, TYPE, FONTS, RADIUS } from '@/src/constants/theme';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useSessionStore } from '@/src/stores/useSessionStore';
import { useProStore } from '@/src/stores/useProStore';

/**
 * Pro taste quiz — 6 questions.
 *
 * Questions 1–3 match the free quiz (family, occasion, price) so answers
 * are comparable. Questions 4–6 (longevity, projection, gender) unlock the
 * richer matching score in /quiz/results when tier=pro.
 *
 * Gate: if not Pro, pushes to /paywall. After purchase router.back() lands
 * here and isPro is true so the quiz renders.
 */

interface QuizQuestion {
  id: string;
  question: string;
  cursive: string;
  badge?: string;
  options: { id: string; label: string; description?: string }[];
}

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

const PRO_QUESTIONS: QuizQuestion[] = [
  {
    id: 'longevity',
    question: 'How long do you want it to last?',
    cursive: 'staying power',
    badge: 'PRO',
    options: [
      { id: '2', label: 'A few hours', description: 'Light, easy, refreshable' },
      { id: '3', label: 'Half a day', description: 'Reliable without reapplying' },
      { id: '4', label: 'Full day', description: 'Morning to evening' },
      { id: '5', label: 'Beast mode', description: 'Still there tomorrow' },
    ],
  },
  {
    id: 'projection',
    question: 'How far should it travel?',
    cursive: 'presence',
    badge: 'PRO',
    options: [
      { id: '1', label: 'Skin close', description: 'A secret between you and those near' },
      { id: '2', label: 'Personal space', description: 'Noticeable when they lean in' },
      { id: '3', label: 'Room presence', description: 'Announces you when you enter' },
      { id: '4', label: 'Statement', description: 'Lingers long after you leave' },
    ],
  },
  {
    id: 'gender',
    question: 'How do you wear fragrance?',
    cursive: 'identity',
    badge: 'PRO',
    options: [
      { id: 'feminine', label: 'Feminine', description: 'Soft, floral, traditionally feminine' },
      { id: 'masculine', label: 'Masculine', description: 'Bold, woody, traditionally masculine' },
      { id: 'unisex', label: 'Gender-free', description: 'Beyond labels — whatever feels right' },
      { id: 'any', label: 'No preference', description: 'Show me everything' },
    ],
  },
];

const ALL_QUESTIONS = [...FREE_QUESTIONS, ...PRO_QUESTIONS];

export default function ProQuizScreen() {
  const router = useRouter();
  const isPro = useProStore((s) => s.isPro);
  const hasHydrated = useProStore((s) => s.hasHydrated);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const userId = useSessionStore.getState().userId;

  // Gate: wait for store hydration, then redirect non-Pro users to paywall.
  // When they purchase, router.back() returns here and isPro is now true.
  useEffect(() => {
    if (hasHydrated && !isPro) {
      router.push('/paywall');
    }
  }, [hasHydrated, isPro]);

  const total = ALL_QUESTIONS.length;
  const q = ALL_QUESTIONS[step];
  const progress = (step + 1) / total;
  const isProQuestion = step >= FREE_QUESTIONS.length;

  const handleSelect = (optId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = { ...answers, [q.id]: optId };
    setAnswers(next);
    setTimeout(() => {
      if (step + 1 < total) {
        setStep(step + 1);
      } else {
        if (isSupabaseConfigured && userId) {
          supabase.from('quiz_results').insert({
            user_id: userId,
            tier: 'pro',
            answers: next,
          }).then(({ error }) => {
            if (error) console.warn('[quiz/pro] save failed:', error.message);
          });
        }
        router.replace({
          pathname: '/quiz/results',
          params: { answers: JSON.stringify(next), tier: 'pro' },
        });
      }
    }, 220);
  };

  // Don't render quiz UI until we know the user is Pro
  if (!hasHydrated || !isPro) return null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => (step === 0 ? router.back() : setStep(step - 1))}>
          <Ionicons name="chevron-back" size={26} color={COLORS.text} />
        </Pressable>
        <View style={styles.progressTrack}>
          {/* Free portion */}
          <View
            style={[
              styles.progressFill,
              {
                width: `${Math.min(progress, FREE_QUESTIONS.length / total) * 100}%`,
                backgroundColor: COLORS.accent,
              },
            ]}
          />
          {/* Pro portion */}
          {isProQuestion && (
            <View
              style={[
                styles.progressFillPro,
                {
                  left: `${(FREE_QUESTIONS.length / total) * 100}%`,
                  width: `${((step - FREE_QUESTIONS.length + 1) / total) * 100}%`,
                },
              ]}
            />
          )}
          {/* Divider between free and pro segments */}
          <View
            style={[styles.progressDivider, { left: `${(FREE_QUESTIONS.length / total) * 100}%` }]}
          />
        </View>
        <Text style={styles.progressText}>{step + 1} of {total}</Text>
      </View>

      <Animated.View
        key={q.id}
        entering={FadeInRight.duration(280)}
        exiting={FadeOutLeft.duration(180)}
        style={styles.body}
      >
        <View style={styles.eyebrowRow}>
          <Text style={styles.eyebrow}>QUESTION</Text>
          {isProQuestion && (
            <View style={styles.proBadge}>
              <Ionicons name="sparkles" size={10} color={COLORS.white} />
              <Text style={styles.proBadgeText}>PRO</Text>
            </View>
          )}
        </View>
        <Text style={styles.cursive}>{q.cursive}</Text>
        <Text style={styles.question}>{q.question}</Text>

        <ScrollView contentContainerStyle={styles.options} showsVerticalScrollIndicator={false}>
          {q.options.map((o) => {
            const selected = answers[q.id] === o.id;
            return (
              <Pressable
                key={o.id}
                style={[styles.option, selected && styles.optionSelected, isProQuestion && styles.optionPro]}
                onPress={() => handleSelect(o.id)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{o.label}</Text>
                  {o.description && (
                    <Text style={[styles.optionDesc, selected && styles.optionDescSelected]}>{o.description}</Text>
                  )}
                </View>
                <Ionicons
                  name={selected ? 'checkmark-circle' : 'chevron-forward'}
                  size={20}
                  color={selected ? COLORS.burgundy : COLORS.muted}
                />
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
  progressTrack: {
    flex: 1, height: 5,
    backgroundColor: COLORS.border,
    borderRadius: 3,
    overflow: 'hidden',
    position: 'relative',
  },
  progressFill: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    borderRadius: 3,
  },
  progressFillPro: {
    position: 'absolute', top: 0, bottom: 0,
    backgroundColor: COLORS.burgundy,
    borderRadius: 3,
  },
  progressDivider: {
    position: 'absolute', top: 0, bottom: 0,
    width: 2,
    backgroundColor: COLORS.bg,
  },
  progressText: { ...TYPE.caption },

  body: { flex: 1, paddingHorizontal: SPACING.lg, paddingTop: SPACING.xl },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  eyebrow: { ...TYPE.eyebrow },
  proBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.burgundy,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  proBadgeText: {
    fontFamily: FONTS.body, fontSize: 9, fontWeight: '700',
    color: COLORS.white, letterSpacing: 1,
  },
  cursive: {
    fontFamily: 'PinyonScript_400Regular',
    fontSize: 32,
    color: COLORS.accent,
    lineHeight: 50,
    paddingLeft: 8,
  },
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
  optionPro: {
    borderLeftWidth: 2,
    borderLeftColor: COLORS.burgundy,
  },
  optionSelected: {
    backgroundColor: COLORS.blushSoft,
    borderColor: COLORS.accent,
    borderWidth: 1.5,
  },
  optionLabel: { fontFamily: FONTS.serif, fontSize: 19, fontWeight: '600', color: COLORS.text },
  optionLabelSelected: { color: COLORS.burgundy },
  optionDesc: { ...TYPE.bodySmall, marginTop: 2, fontStyle: 'italic' },
  optionDescSelected: { color: COLORS.burgundy, opacity: 0.75 },
});
