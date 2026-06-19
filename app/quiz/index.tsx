import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInRight, FadeOutLeft } from 'react-native-reanimated';
import { COLORS, SPACING, TYPE, FONTS, RADIUS } from '@/src/constants/theme';
import { useQuizStore } from '@/src/stores/useQuizStore';
import { useProStore } from '@/src/stores/useProStore';

/**
 * Fragrance taste quiz — 5 questions for free users, 9 for Pro.
 *
 * Free Q1–5:  family, occasion, price, season, longevity.
 * Pro Q6–10: sillage, off-notes, gender, discovery, compliments.
 *
 * R6: Free gate at 5 (was 3). Season + longevity promoted to free tier.
 * R7: Resume modal on mount when prior answers exist.
 * R8: Post-Q5 Pro tease modal replaces inline banner + paywall auto-intercept.
 */

interface QuizQuestion {
  id: string;
  question: string;
  cursive: string;
  options: { id: string; label: string; description?: string }[];
}

/** Questions 1–5 — available to all users. */
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
      { id: '3', label: 'Half a day', description: 'Moderate, a gentle presence' },
      { id: '4', label: 'All day', description: 'Confident and consistent' },
      { id: '5', label: 'Into tomorrow', description: 'Beast mode, make a statement' },
    ],
  },
];

/** Questions 6–10 — Pro only. */
const PRO_QUESTIONS: QuizQuestion[] = [
  {
    id: 'sillage',
    question: 'How much space should it fill?',
    cursive: 'presence',
    options: [
      { id: 'intimate', label: 'Just for you', description: 'A whisper, only on close contact' },
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
      { id: 'androgynous', label: 'Right down the middle', description: 'Unisex, no leaning either way' },
      { id: 'contrast', label: 'I like the contrast', description: 'Wearing something unexpected' },
    ],
  },
  {
    id: 'discovery',
    question: 'How adventurous is your nose?',
    cursive: 'explore',
    options: [
      { id: 'classic', label: 'Classics only', description: 'Proven icons, I know what I like' },
      { id: 'curated', label: 'Guided exploration', description: 'Surprise me, but stay in my lane' },
      { id: 'wild', label: 'Push my limits', description: 'Challenging, weird, unforgettable' },
    ],
  },
  {
    id: 'compliments',
    question: 'How important are compliments to you?',
    cursive: 'impact',
    options: [
      { id: 'essential', label: 'Essential', description: 'I wear it for the reaction' },
      { id: 'love_them', label: 'Love getting them', description: 'A great bonus when it happens' },
      { id: 'secondary', label: 'Nice but not the goal', description: 'I wear what I love regardless' },
      { id: 'private', label: 'Purely personal', description: 'I dress my skin for myself only' },
    ],
  },
];

const ALL_QUESTIONS = [...FREE_QUESTIONS, ...PRO_QUESTIONS];
const FREE_QUESTION_COUNT = FREE_QUESTIONS.length; // 5

export default function QuizScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { setAnswer, reset, answers } = useQuizStore();
  const isPro = useProStore((s) => s.isPro);

  const questions = isPro ? ALL_QUESTIONS : FREE_QUESTIONS;
  const [step, setStep] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resumeModalVisible, setResumeModalVisible] = useState(false);
  const [proTeaseModalVisible, setProTeaseModalVisible] = useState(false);

  const answeredCount = Object.keys(answers).length;

  // R7: Show resume gate on mount when prior answers exist.
  // Never auto-skip — always surface the choice.
  useEffect(() => {
    if (answeredCount > 0) {
      setResumeModalVisible(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = questions.length;
  const q = questions[step];
  const progress = (step + 1) / total;

  const handleContinue = () => {
    setResumeModalVisible(false);
    // Already finished all questions in their tier → go straight to results
    if (answeredCount >= questions.length) {
      router.replace('/quiz/results');
      return;
    }
    setStep(Math.min(answeredCount, questions.length - 1));
  };

  const handleStartOver = () => {
    reset();
    setStep(0);
    setResumeModalVisible(false);
  };

  const handleSelect = (optId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedId(optId);
    if (step === 0) reset(); // fresh run clears prior answers
    setAnswer(q.id, optId);

    setTimeout(() => {
      const nextStep = step + 1;
      setSelectedId(null);

      // R8: Free user answered Q5 — show Pro tease modal instead of auto-paywall
      if (!isPro && nextStep === FREE_QUESTION_COUNT) {
        setProTeaseModalVisible(true);
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

      {/* R7: Resume gate modal */}
      <Modal visible={resumeModalVisible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.modal}>
            {answeredCount >= questions.length ? (
              // Already finished — offer results or retake
              <>
                <Text style={styles.modalTitle}>You've taken this quiz.</Text>
                <Text style={styles.modalBody}>
                  See your last results or start fresh with a new run.
                </Text>
                <Pressable style={styles.modalBtnPrimary} onPress={handleContinue}>
                  <Text style={styles.modalBtnPrimaryText}>View My Results</Text>
                </Pressable>
                <Pressable style={styles.modalBtnSecondary} onPress={handleStartOver}>
                  <Text style={styles.modalBtnSecondaryText}>Take the Quiz Again</Text>
                </Pressable>
              </>
            ) : (
              // Mid-quiz — offer to resume or restart
              <>
                <Text style={styles.modalTitle}>Resume your quiz?</Text>
                <Text style={styles.modalBody}>
                  You answered {answeredCount} of {questions.length} questions.{'\n'}Continue where you left off or start fresh?
                </Text>
                <Pressable style={styles.modalBtnPrimary} onPress={handleContinue}>
                  <Text style={styles.modalBtnPrimaryText}>Continue</Text>
                </Pressable>
                <Pressable style={styles.modalBtnSecondary} onPress={handleStartOver}>
                  <Text style={styles.modalBtnSecondaryText}>Start Over</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* R8: Pro tease modal — shown after Q5 for free users */}
      <Modal visible={proTeaseModalVisible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Ionicons name="sparkles-outline" size={28} color={COLORS.accent} style={{ marginBottom: SPACING.xs }} />
            <Text style={styles.modalTitle}>You've answered 5 questions.</Text>
            <Text style={styles.modalBody}>
              Unlock 5 deeper questions + Taste Insights with Pro.
            </Text>
            <View style={styles.teaseRows}>
              <View style={styles.teaseRow}>
                <Ionicons name="lock-closed-outline" size={13} color={COLORS.muted} />
                <Text style={styles.teaseRowText}>Presence · how much space it fills</Text>
              </View>
              <View style={styles.teaseRow}>
                <Ionicons name="lock-closed-outline" size={13} color={COLORS.muted} />
                <Text style={styles.teaseRowText}>Off-notes · what you want to avoid</Text>
              </View>
            </View>
            <Pressable
              style={styles.modalBtnPrimary}
              onPress={() => {
                setProTeaseModalVisible(false);
                router.push('/paywall?returnTo=/quiz');
              }}
            >
              <Text style={styles.modalBtnPrimaryText}>Unlock Pro</Text>
            </Pressable>
            <Pressable
              style={styles.modalBtnSecondary}
              onPress={() => {
                setProTeaseModalVisible(false);
                router.replace('/quiz/results');
              }}
            >
              <Text style={styles.modalBtnSecondaryText}>See My Results</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <View style={styles.headerRow}>
        <Pressable onPress={() => {
          if (step === 0) {
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
                accessibilityLabel={o.label}
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
  // Modals (R7 + R8)
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  modal: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    width: '100%',
    alignItems: 'center',
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    fontFamily: FONTS.serif,
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
  },
  modalBody: {
    ...TYPE.bodySmall,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: SPACING.xs,
  },
  teaseRows: { width: '100%', gap: SPACING.xs, marginBottom: SPACING.sm },
  teaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  teaseRowText: { ...TYPE.bodySmall, color: COLORS.muted, fontStyle: 'italic' },
  modalBtnPrimary: {
    width: '100%',
    paddingVertical: 13,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  modalBtnPrimaryText: { ...TYPE.label, color: COLORS.white, fontSize: 13, letterSpacing: 1 },
  modalBtnSecondary: {
    width: '100%',
    paddingVertical: 10,
    alignItems: 'center',
  },
  modalBtnSecondaryText: { ...TYPE.label, color: COLORS.muted, fontSize: 12, letterSpacing: 0.5 },
  // Quiz body
  body: { flex: 1, paddingHorizontal: SPACING.lg, paddingTop: SPACING.xl },
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
});
