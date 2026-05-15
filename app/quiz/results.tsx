import { useEffect, useMemo, useState, useRef } from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { COLORS, SPACING, TYPE, FONTS, RADIUS } from '@/src/constants/theme';
import { FragranceCard } from '@/src/components/fragrance/FragranceCard';
import { useCatalogStore, type Fragrance } from '@/src/stores/useCatalogStore';
import { useQuizStore } from '@/src/stores/useQuizStore';
import { syncWrite } from '@/src/lib/sync/syncWrite';
import { useProStore } from '@/src/stores/useProStore';

/**
 * Quiz results — scores the top-200-popular catalog against the user's
 * quiz answers. Lightweight, quiz-specific scoring (the full recommendation
 * engine lives in src/features/recommend/score.ts and feeds the home rails).
 */
export default function QuizResults() {
  const router = useRouter();
  const answers = useQuizStore((s) => s.answers);
  const fetchAllActive = useCatalogStore((s) => s.fetchAllActive);
  const [catalog, setCatalog] = useState<Fragrance[]>([]);

  const family = answers.family;
  const priceTier = Number(answers.price ?? 0);
  const season = answers.season as string | undefined;
  const longevity = Number(answers.longevity ?? 0);
  const sillage = answers.sillage as string | undefined;
  const avoid = answers.avoid as string | undefined;
  const discovery = answers.discovery as string | undefined;

  useEffect(() => {
    let cancelled = false;
    fetchAllActive(200).then((rows) => {
      if (!cancelled) setCatalog(rows);
    });
    return () => { cancelled = true; };
  }, [fetchAllActive]);

  // Persist quiz results to Supabase once per mount.
  const isPro = useProStore((s) => s.isPro);
  const persisted = useRef(false);
  useEffect(() => {
    if (persisted.current || !answers || Object.keys(answers).length === 0) return;
    persisted.current = true;
    syncWrite({
      op: 'insert',
      table: 'quiz_results',
      row: { tier: isPro ? 'pro' : 'free', answers },
    });
  }, [answers, isPro]);

  const matches = useMemo(() => {
    return catalog
      .map((f) => {
        let score = 0;
        if (family && f.fragrance_family === family) score += 0.5;
        if (priceTier && Math.abs(f.price_tier - priceTier) <= 1) score += 0.3;
        score += f.compliment_score * 0.2;
        // Pro question signals
        if (longevity && Math.abs(f.community_longevity - longevity) <= 1) score += 0.2;
        if (sillage === 'intimate' && f.community_sillage <= 3) score += 0.15;
        if (sillage === 'strong' && f.community_sillage >= 4) score += 0.15;
        if (avoid === 'sweet' && f.top_accords.some((a) => ['gourmand','sweet','vanilla'].includes(a))) score -= 0.3;
        if (avoid === 'heavy' && f.top_accords.some((a) => ['oud','leather','tobacco'].includes(a))) score -= 0.3;
        if (discovery === 'classic' && f.community_longevity >= 4) score += 0.1;
        if (discovery === 'wild') score += (1 - f.versatility_score) * 0.15;
        return { f, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((x) => x.f);
  }, [catalog, family, priceTier, longevity, sillage, avoid, discovery]);

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
              <FragranceCard fragrance={f} variant="compact" />
            </View>
          ))}
        </View>

        <Pressable style={styles.cta} onPress={() => router.replace('/(tabs)')}>
          <Text style={styles.ctaText}>Back to Today</Text>
        </Pressable>
        <Pressable style={styles.secondaryCta} onPress={() => router.push('/quiz')}>
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
  cursive: { fontFamily: 'PinyonScript_400Regular', fontSize: 36, color: COLORS.accent, lineHeight: 56, marginTop: 4, paddingLeft: 10 },
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
