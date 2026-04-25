import { useMemo } from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { COLORS, SPACING, TYPE, FONTS, RADIUS } from '@/src/constants/theme';
import { FragranceCard } from '@/src/components/fragrance/FragranceCard';
import { MOCK_CATALOG } from '@/src/mock/fragrances';

/**
 * Quiz results — uses the answers to filter the mock catalog into the
 * top 5 picks. Real version calls the recommendation engine.
 */
export default function QuizResults() {
  const router = useRouter();
  const { answers } = useLocalSearchParams<{ answers: string }>();
  const parsed = useMemo(() => {
    try { return JSON.parse(answers ?? '{}') as Record<string, string>; } catch { return {}; }
  }, [answers]);

  const family = parsed.family;
  const priceTier = Number(parsed.price ?? 0);

  const matches = useMemo(() => {
    return MOCK_CATALOG
      .map((f) => {
        let score = 0;
        if (family && f.fragrance_family === family) score += 0.5;
        if (priceTier && Math.abs(f.price_tier - priceTier) <= 1) score += 0.3;
        score += f.compliment_score * 0.2;
        return { f, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((x) => x.f);
  }, [family, priceTier]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>YOUR PICKS</Text>
          <Text style={styles.cursive}>tailored for you</Text>
          <Text style={styles.headline}>
            Five fragrances that <Text style={styles.italic}>match</Text> your taste.
          </Text>
          <Text style={styles.body}>
            Based on your answers, these picks line up with the worlds, occasions and
            investment level you described. Tap any to explore notes and accords.
          </Text>
        </View>

        <View style={styles.results}>
          {matches.map((f, i) => (
            <View key={f.id} style={{ marginBottom: SPACING.lg }}>
              <Text style={styles.rank}>No. {i + 1}</Text>
              <FragranceCard fragrance={f} />
            </View>
          ))}
        </View>

        <Pressable style={styles.cta} onPress={() => router.replace('/(tabs)')}>
          <Text style={styles.ctaText}>Back to Today</Text>
        </Pressable>
        <Pressable style={styles.secondaryCta} onPress={() => router.replace('/quiz')}>
          <Text style={styles.secondaryCtaText}>Retake the Quiz</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  container: { paddingBottom: SPACING.xxl },
  header: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, alignItems: 'center' },
  eyebrow: { ...TYPE.eyebrow },
  cursive: { fontFamily: 'PinyonScript_400Regular', fontSize: 36, color: COLORS.accent, lineHeight: 48, marginTop: 4 },
  headline: { fontFamily: FONTS.serif, fontSize: 28, fontWeight: '600', color: COLORS.text, textAlign: 'center', marginTop: SPACING.sm, lineHeight: 34 },
  italic: { fontStyle: 'italic', color: COLORS.accent },
  body: { ...TYPE.body, color: COLORS.muted, textAlign: 'center', marginTop: SPACING.md, paddingHorizontal: SPACING.md, fontStyle: 'italic' },
  results: { paddingHorizontal: SPACING.lg, marginTop: SPACING.xl },
  rank: { ...TYPE.eyebrow, color: COLORS.accent, marginBottom: 6 },
  cta: { backgroundColor: COLORS.accent, paddingVertical: 16, borderRadius: RADIUS.full, alignItems: 'center', marginHorizontal: SPACING.lg, marginTop: SPACING.md },
  ctaText: { ...TYPE.label, color: COLORS.white, letterSpacing: 2 },
  secondaryCta: { paddingVertical: 14, alignItems: 'center', marginTop: SPACING.sm },
  secondaryCtaText: { ...TYPE.label, color: COLORS.muted, letterSpacing: 1 },
});
