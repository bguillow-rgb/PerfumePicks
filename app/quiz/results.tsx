import { useEffect, useMemo, useState, useRef } from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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
  const fetchEnriched = useCatalogStore((s) => s.fetchEnriched);
  const [catalog, setCatalog] = useState<Fragrance[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);

  const family = answers.family;
  const priceTier = Number(answers.price ?? 0);
  const season = answers.season as string | undefined;
  const longevity = Number(answers.longevity ?? 0);
  const sillage = answers.sillage as string | undefined;
  const avoid = answers.avoid as string | undefined;
  const discovery = answers.discovery as string | undefined;

  useEffect(() => {
    let cancelled = false;
    fetchEnriched(1000, 0, ['feminine', 'unisex']).then((rows) => {
      if (!cancelled) { setCatalog(rows); setCatalogLoading(false); }
    });
    return () => { cancelled = true; };
  }, [fetchEnriched]);

  // Persist quiz results to Supabase once per mount.
  const isPro = useProStore((s) => s.isPro);
  const persisted = useRef(false);
  useEffect(() => {
    if (persisted.current || !answers || Object.keys(answers).length === 0) return;
    persisted.current = true;
    syncWrite('quiz_results', { tier: isPro ? 'pro' : 'free', answers });
  }, [answers, isPro]);

  const matches = useMemo(() => {
    return catalog
      .map((f) => {
        // Enriched data is patchy — coerce nullable numerics so a missing field
        // never turns the whole score into NaN (which sorts unpredictably).
        const priceTierVal = f.price_tier ?? 0;
        const complimentScore = f.compliment_score ?? 0;
        const longevityVal = f.community_longevity ?? 0;
        const sillageVal = f.community_sillage ?? 0;
        const versatility = f.versatility_score ?? 0;
        const accords = f.top_accords ?? [];
        let score = 0;
        if (family && f.fragrance_family === family) score += 0.5;
        if (priceTier && Math.abs(priceTierVal - priceTier) <= 1) score += 0.3;
        score += complimentScore * 0.2;
        // Pro question signals
        if (longevity && Math.abs(longevityVal - longevity) <= 1) score += 0.2;
        if (sillage === 'intimate' && sillageVal <= 3) score += 0.15;
        if (sillage === 'strong' && sillageVal >= 4) score += 0.15;
        if (avoid === 'sweet' && accords.some((a) => ['gourmand','sweet','vanilla'].includes(a))) score -= 0.3;
        if (avoid === 'heavy' && accords.some((a) => ['oud','leather','tobacco'].includes(a))) score -= 0.3;
        if (discovery === 'classic' && longevityVal >= 4) score += 0.1;
        if (discovery === 'wild') score += (1 - versatility) * 0.15;
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

        {!catalogLoading && (
          <View style={styles.results}>
            {matches.map((f, i) => (
              <View key={f.id} style={{ marginBottom: SPACING.lg }}>
                <Text style={styles.rank}>No. {i + 1}</Text>
                {/* Tag the detail route so its back button returns here (quiz
                    results lives in the root stack, outside the tab navigator —
                    a plain router.back() from the tabs detail screen would land
                    on the Today tab instead). */}
                <FragranceCard
                  fragrance={f}
                  variant="compact"
                  onPress={() => router.push(`/fragrance/${f.id}?from=quiz`)}
                />
              </View>
            ))}
          </View>
        )}

        {/* Inline Pro upsell — carries the value-prop that used to interrupt the
            quiz as a post-Q5 modal. Free users see their results first, then the
            invitation to sharpen them. */}
        {!isPro && (
          <View style={styles.proBanner}>
            <View style={styles.proBannerHead}>
              <Ionicons name="sparkles-outline" size={18} color={COLORS.accent} />
              <Text style={styles.proBannerTitle}>Sharpen these with Pro</Text>
            </View>
            <Text style={styles.proBannerBody}>
              The full quiz runs 9 questions instead of 3, and Taste Insights shows you what's
              driving the picks.
            </Text>
            <View style={styles.proBannerRow}>
              <Ionicons name="lock-closed-outline" size={13} color={COLORS.muted} />
              <Text style={styles.proBannerRowText}>Presence · how much space it fills</Text>
            </View>
            <View style={styles.proBannerRow}>
              <Ionicons name="lock-closed-outline" size={13} color={COLORS.muted} />
              <Text style={styles.proBannerRowText}>Off-notes · what you want to avoid</Text>
            </View>
            <Pressable style={styles.proBannerBtn} onPress={() => router.push('/paywall?returnTo=/quiz')}>
              <Text style={styles.proBannerBtnText}>Get Pro</Text>
            </Pressable>
          </View>
        )}

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
  proBanner: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    padding: SPACING.lg,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.sm,
  },
  proBannerHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  proBannerTitle: { fontFamily: FONTS.serif, fontSize: 19, fontWeight: '600', color: COLORS.text },
  proBannerBody: { ...TYPE.bodySmall, color: COLORS.muted, lineHeight: 20 },
  proBannerRow: {
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
  proBannerRowText: { ...TYPE.bodySmall, color: COLORS.muted, fontStyle: 'italic' },
  proBannerBtn: {
    paddingVertical: 13,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  proBannerBtnText: { ...TYPE.label, color: COLORS.white, fontSize: 13, letterSpacing: 1 },
  cta: { backgroundColor: COLORS.accent, paddingVertical: 16, borderRadius: RADIUS.full, alignItems: 'center', marginHorizontal: SPACING.lg, marginTop: SPACING.md },
  ctaText: { ...TYPE.label, color: COLORS.white, letterSpacing: 2 },
  secondaryCta: { paddingVertical: 14, alignItems: 'center', marginTop: SPACING.sm },
  secondaryCtaText: { ...TYPE.label, color: COLORS.muted, letterSpacing: 1 },
});
