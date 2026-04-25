import { View, Text, StyleSheet, Pressable, ScrollView, Image } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useRef, useEffect } from 'react';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInRight, FadeOutLeft } from 'react-native-reanimated';
import { Button } from '@/src/components/ui/Button';
import { COLORS, SPACING, RADIUS } from '@/src/constants/theme';

import { BASIC_QUESTIONS, ALL_QUESTIONS } from '@/src/features/quiz/questions';
import type { QuizAnswers } from '@/src/types/cigar';

export default function QuizScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const insets = useSafeAreaInsets();

  const isAdvanced = params.mode === 'advanced';
  const questions = isAdvanced ? ALL_QUESTIONS : BASIC_QUESTIONS;

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswers>({
    strength: null,
    smoothness: null,
    body: null,
    time: null,
    price: null,
    flavors: [],
    adventure: null,
    wrapper: null,
    origin: null,
  });
  const [computing, setComputing] = useState(false);
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear timer on unmount to prevent leak
  useEffect(() => {
    return () => {
      if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
    };
  }, []);

  const q = questions[step];
  const isLast = step === questions.length - 1;
  const progress = questions.length > 1 ? step / (questions.length - 1) : 1;

  function navigateToResults(ans: QuizAnswers) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setComputing(true);
    setTimeout(() => {
      setComputing(false);
      router.push({
        pathname: '/quiz/results',
        params: {
          answers: JSON.stringify(ans),
          mode: isAdvanced ? 'advanced' : 'basic',
        },
      });
    }, 600);
  }

  function selectValue(value: any) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const updated = { ...answers, [q.key]: value };
    setAnswers(updated);

    if (q.type !== 'multi') {
      if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
      autoAdvanceTimer.current = setTimeout(() => {
        if (isLast) {
          navigateToResults(updated);
        } else {
          setStep((s) => s + 1);
        }
      }, 350);
    }
  }

  function toggleMulti(value: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAnswers((prev) => {
      const cur = prev.flavors;
      if (cur.includes(value)) return { ...prev, flavors: cur.filter((x) => x !== value) };
      if (cur.length >= (q.max ?? 3)) return prev;
      return { ...prev, flavors: [...cur, value] };
    });
  }

  function goBack() {
    if (step > 0) {
      setStep((s) => s - 1);
    } else {
      router.back();
    }
  }

  const canContinueMulti = q.type === 'multi' && answers.flavors.length > 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + SPACING.md, paddingBottom: insets.bottom + SPACING.md }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
        <Text style={styles.stepLabel}>
          {step + 1} / {questions.length}
          {isAdvanced ? '  ·  Pro' : ''}
        </Text>
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      {/* Hero — SP monogram placeholder. Zero tobacco imagery per Apple 1.4.3.
          TODO: swap to a humidor-interior photo in a post-launch update by
          bundling assets/images/quiz-hero.jpg and updating this require(). */}
      <Image
        source={require('../../assets/images/splash-icon.png')}
        style={styles.hero}
        resizeMode="contain"
      />


      <Animated.View
        key={step}
        entering={FadeInRight.duration(250)}
        exiting={FadeOutLeft.duration(200)}
        style={styles.questionContainer}
      >
        <Text style={styles.title}>{q.title}</Text>
        <Text style={styles.subtitle}>{q.subtitle}</Text>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.options}
          showsVerticalScrollIndicator={true}
        >
          {q.options.map((opt) => {
            const selected =
              q.type === 'multi'
                ? answers.flavors.includes(opt.value as string)
                : answers[q.key as keyof QuizAnswers] === opt.value;

            return (
              <Pressable
                key={String(opt.value)}
                onPress={() => q.type === 'multi' ? toggleMulti(opt.value as string) : selectValue(opt.value)}
                style={[styles.option, selected && styles.optionSelected]}
              >
                <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {q.type === 'multi' && (
          <View style={styles.multiFooter}>
            <Text style={styles.hint}>Selected {answers.flavors.length} of {q.max ?? 3}</Text>
            <Button
              title={isLast ? (computing ? 'Finding...' : 'See Matches') : 'Next'}
              onPress={() => isLast ? navigateToResults(answers) : setStep((s) => s + 1)}
              disabled={!canContinueMulti || computing}
              loading={computing}
            />
          </View>
        )}
      </Animated.View>

      {/* Back button */}
      {step > 0 && (
        <View style={styles.bottomNav}>
          <Pressable onPress={goBack} hitSlop={12} style={styles.backBtn}>
            <Text style={styles.backText}>← Previous</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingHorizontal: SPACING.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  closeText: {
    fontFamily: 'Cormorant',
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.muted,
  },
  stepLabel: {
    fontFamily: 'Cormorant',
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.subtle,
    letterSpacing: 1,
  },
  progressTrack: {
    height: 4,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.border,
    marginBottom: SPACING.lg,
    overflow: 'hidden',
  },
  hero: {
    width: '100%',
    height: 140,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.card,
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.full,
  },
  questionContainer: {
    flex: 1,
  },
  title: {
    fontFamily: 'Cormorant',
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    color: COLORS.muted,
    textAlign: 'center',
    marginTop: SPACING.xs,
    marginBottom: SPACING.md,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    paddingBottom: SPACING.md,
  },
  option: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    minWidth: '45%',
    alignItems: 'center',
  },
  optionSelected: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  optionText: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  optionTextSelected: {
    color: COLORS.bg,
  },
  multiFooter: {
    gap: SPACING.sm,
    paddingTop: SPACING.sm,
  },
  hint: {
    fontFamily: 'Cormorant',
    textAlign: 'center',
    color: COLORS.muted,
    fontSize: 13,
  },
  bottomNav: {
    alignItems: 'flex-end',
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  backBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  backText: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.accent,
  },
});
