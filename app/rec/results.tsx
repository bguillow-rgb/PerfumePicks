import { useMemo } from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, FONTS, RADIUS } from '@/src/constants/theme';
import { FragranceCard } from '@/src/components/fragrance/FragranceCard';
import { useRecommendations } from '@/src/features/recommend/useRecommendations';
import type { RecContext, ScoredRec } from '@/src/features/recommend/score';

/**
 * Rec Results — the "What should I wear?" results screen.
 *
 * Reads occasion + weather from route params (set by WhatToWearSheet).
 * Season is inferred from the current date. The explicit context overrides
 * quiz defaults so this screen shows picks tuned for right now.
 */
export default function RecResultsScreen() {
  const router = useRouter();
  const { occasion, weather } = useLocalSearchParams<{
    occasion?: RecContext['occasion'];
    weather?: RecContext['weather'];
  }>();

  const ctx = useMemo<RecContext>(() => ({
    season: currentSeason(),
    ...(occasion && { occasion }),
    ...(weather  && { weather }),
  }), [occasion, weather]);

  const { heroPick, heroReason, topPicks, hasSignals } = useRecommendations(ctx);

  const contextLabel = buildContextLabel(occasion, weather);
  const restPicks = topPicks.slice(1);

  return (
    <View style={styles.safe}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Sticky header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>PICKED FOR YOU</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>{contextLabel}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* No-signal nudge */}
        {!hasSignals && (
          <View style={styles.nudgeBanner}>
            <Ionicons name="information-circle-outline" size={16} color={COLORS.muted} />
            <Text style={styles.nudgeText}>
              Swipe in Train or take the quiz to personalise these picks further.
            </Text>
          </View>
        )}

        {/* Hero pick — engine always returns a pick from the catalog;
            only empty if the user owns every fragrance in the catalog */}
        {heroPick ? (
          <View style={styles.heroSection}>
            <View style={styles.heroLabel}>
              <View style={styles.heroBadge}>
                <Ionicons name="sparkles" size={11} color={COLORS.accent} />
                <Text style={styles.heroBadgeText}>TOP PICK</Text>
              </View>
              {!hasSignals && (
                <Text style={styles.heroUnpersonalised}>· train your nose to personalise</Text>
              )}
            </View>
            <FragranceCard
              fragrance={heroPick}
              variant="hero"
              onPress={() => router.push(`/fragrance/${heroPick.id}`)}
            />
            <Text style={styles.heroReason}>
              <Text style={styles.italic}>Why this: </Text>
              {heroReason || 'a thoughtful pick for today'}.
            </Text>
          </View>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Your whole collection is in the wardrobe.</Text>
            <Text style={styles.emptyBody}>Add more fragrances to Discover picks to surface here.</Text>
            <Pressable style={styles.emptyBtn} onPress={() => router.push('/(tabs)/discover')}>
              <Text style={styles.emptyBtnText}>Browse Catalog →</Text>
            </Pressable>
          </View>
        )}

        {/* Ranked list */}
        {restPicks.length > 0 && (
          <View style={styles.listSection}>
            <View style={styles.listHeader}>
              <Text style={styles.listEyebrow}>ALSO GREAT</Text>
              <Text style={styles.listCursive}>more picks</Text>
            </View>
            {restPicks.map((rec, i) => (
              <RecRow
                key={rec.fragrance.id}
                rec={rec}
                rank={i + 2}
                onPress={() => router.push(`/fragrance/${rec.fragrance.id}`)}
              />
            ))}
          </View>
        )}

        <View style={{ height: SPACING.xxl }} />
      </ScrollView>
    </View>
  );
}

function RecRow({ rec, rank, onPress }: { rec: ScoredRec; rank: number; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Text style={styles.rowRank}>{rank}</Text>
      <View style={styles.rowImageWrap}>
        <Image source={{ uri: rec.fragrance.image_url }} style={styles.rowImage} />
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowBrand}>{rec.fragrance.brand.toUpperCase()}</Text>
        <Text style={styles.rowName} numberOfLines={2}>{rec.fragrance.name}</Text>
        <Text style={styles.rowReason} numberOfLines={2}>{rec.reason}</Text>
        {rec.tags.length > 0 && (
          <View style={styles.rowTags}>
            {rec.tags.slice(0, 3).map((t) => (
              <View key={t} style={styles.rowTag}>
                <Text style={styles.rowTagText}>{TAG_LABELS[t] ?? t}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
      <Ionicons name="chevron-forward" size={16} color={COLORS.border} />
    </Pressable>
  );
}

const TAG_LABELS: Record<string, string> = {
  'office-safe': 'Office Safe',
  'compliment-getter': 'Compliment Getter',
  'versatile': 'Versatile',
  'beast-mode': 'Beast Mode',
  'skin-scent': 'Skin Scent',
};

function currentSeason(): RecContext['season'] {
  const m = new Date().getMonth();
  if (m >= 2 && m <= 4) return 'spring';
  if (m >= 5 && m <= 7) return 'summer';
  if (m >= 8 && m <= 10) return 'fall';
  return 'winter';
}

function buildContextLabel(
  occasion: RecContext['occasion'] | undefined,
  weather: RecContext['weather'] | undefined,
): string {
  const OCCASION_LABELS: Record<string, string> = {
    office: 'office day', date: 'date night', casual: 'casual day',
    evening: 'evening out', formal: 'formal occasion', workout: 'workout', travel: 'travel day',
  };
  const WEATHER_LABELS: Record<string, string> = {
    'hot-dry': 'hot, dry air', 'hot-humid': 'hot, humid air',
    warm: 'warm weather', cool: 'cool weather', cold: 'cold weather', rainy: 'rainy day',
  };

  if (occasion && weather) {
    return `For a ${OCCASION_LABELS[occasion]} · ${WEATHER_LABELS[weather]}`;
  }
  if (occasion) return `For a ${OCCASION_LABELS[occasion]}`;
  if (weather)  return `For ${WEATHER_LABELS[weather]}`;
  return `Your top picks right now`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingTop: 60,
    paddingBottom: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  backBtn: {
    width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  headerText: { flex: 1, alignItems: 'center' },
  eyebrow: { ...TYPE.eyebrow, fontSize: 9, marginBottom: 1 },
  headerTitle: {
    fontFamily: FONTS.serif,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
  },
  container: { paddingBottom: SPACING.xxl },
  nudgeBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    margin: SPACING.lg,
    padding: SPACING.md,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  nudgeText: { ...TYPE.bodySmall, color: COLORS.muted, flex: 1, lineHeight: 19 },

  heroSection: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg },
  heroLabel: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SPACING.sm },
  heroUnpersonalised: { ...TYPE.caption, color: COLORS.muted, fontStyle: 'italic' },
  heroBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.accentSoft,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: RADIUS.full,
  },
  heroBadgeText: { ...TYPE.eyebrow, color: COLORS.burgundy, fontSize: 9 },
  heroReason: {
    ...TYPE.bodySmall,
    color: COLORS.muted,
    fontStyle: 'italic',
    lineHeight: 21,
    marginTop: SPACING.md,
  },
  italic: { color: COLORS.accent, fontWeight: '600', fontStyle: 'italic' },

  listSection: { paddingHorizontal: SPACING.lg, marginTop: SPACING.xl },
  listHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: SPACING.md },
  listEyebrow: { ...TYPE.eyebrow },
  listCursive: {
    fontFamily: 'PinyonScript_400Regular',
    fontSize: 22,
    color: COLORS.accent,
    lineHeight: 26,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  rowRank: {
    fontFamily: FONTS.serif,
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.muted,
    width: 24,
    textAlign: 'center',
  },
  rowImageWrap: {
    width: 60, height: 72,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    backgroundColor: COLORS.card2,
  },
  rowImage: { width: '100%', height: '100%' },
  rowContent: { flex: 1 },
  rowBrand: { ...TYPE.eyebrow, fontSize: 9, marginBottom: 2 },
  rowName: {
    fontFamily: FONTS.serif,
    fontWeight: '600',
    fontSize: 16,
    color: COLORS.text,
    lineHeight: 20,
    marginBottom: 4,
  },
  rowReason: {
    ...TYPE.bodySmall,
    color: COLORS.muted,
    fontStyle: 'italic',
    lineHeight: 18,
    marginBottom: 6,
  },
  rowTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  rowTag: {
    paddingHorizontal: 7, paddingVertical: 2,
    backgroundColor: COLORS.card2,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  rowTagText: { fontSize: 9, color: COLORS.muted, fontWeight: '600', letterSpacing: 0.4 },

  empty: {
    margin: SPACING.lg,
    padding: SPACING.xl,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    gap: SPACING.sm,
  },
  emptyTitle: { ...TYPE.heading, textAlign: 'center' },
  emptyBody: { ...TYPE.bodySmall, color: COLORS.muted, textAlign: 'center', lineHeight: 20 },
  emptyBtn: { marginTop: SPACING.xs },
  emptyBtnText: { ...TYPE.label, color: COLORS.accent, fontSize: 13, letterSpacing: 0.5 },
});
