import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Share, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, RADIUS, FONTS } from '@/src/constants/theme';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { useProStore } from '@/src/stores/useProStore';
import { useWearLogStore, type Occasion } from '@/src/stores/useWearLogStore';
import { useWardrobeStore } from '@/src/stores/useWardrobeStore';
import { useCatalogStore, type Fragrance } from '@/src/stores/useCatalogStore';
import {
  computeWrappedStats,
  topKey,
  SEASONS,
  type WrappedStats,
} from '@/src/features/wrapped/wrappedStats';

/**
 * Perfume Wrapped — your year in fragrance.
 * Pro-gated. Computed CLIENT-SIDE from the local wear log (keyed by slug, same
 * as the catalog) so it's always available on a rolling trailing-12-months
 * window — no December dead-stub, no RPC UUID/slug mismatch. The stat math
 * lives in `@/src/features/wrapped/wrappedStats` so it stays unit-testable.
 */

const OCCASION_LABEL: Record<Occasion, string> = {
  office: 'the office',
  date: 'date night',
  casual: 'casual days',
  evening: 'evenings out',
  formal: 'formal events',
  workout: 'workouts',
  travel: 'travel',
};

export default function WrappedScreen() {
  const router = useRouter();
  const isPro = useProStore((s) => s.isPro);
  const logs = useWearLogStore((s) => s.logs);
  const wardrobe = useWardrobeStore((s) => s.items);
  const getById = useCatalogStore((s) => s.getById);
  const fetchById = useCatalogStore((s) => s.fetchById);
  const [hero, setHero] = useState<Fragrance | undefined>(undefined);

  const stats: WrappedStats = useMemo(
    () => computeWrappedStats(logs, wardrobe, (id) => getById(id)?.brand),
    [logs, wardrobe, getById],
  );

  // Resolve the hero fragrance (may need a network fetch if not cached).
  useEffect(() => {
    if (!stats.topFragranceId) { setHero(undefined); return; }
    const cached = getById(stats.topFragranceId);
    if (cached) { setHero(cached); return; }
    let alive = true;
    fetchById(stats.topFragranceId).then((f) => { if (alive) setHero(f); });
    return () => { alive = false; };
  }, [stats.topFragranceId, getById, fetchById]);

  const seasonPeak = useMemo(() => topKey(stats.seasonal), [stats.seasonal]);

  const onShare = () => {
    const lines = [
      'My Perfume Wrapped 🧴',
      `${stats.totalWears} wears across ${stats.uniqueFragrances} fragrances`,
    ];
    if (hero) lines.push(`Signature scent: ${hero.brand} ${hero.name} (${stats.topFragranceCount}×)`);
    if (stats.topOccasion) lines.push(`Mostly for ${OCCASION_LABEL[stats.topOccasion]}`);
    if (seasonPeak) lines.push(`Biggest season: ${seasonPeak}`);
    lines.push('— via Perfume Picks');
    Share.share({ message: lines.join('\n') }).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color={COLORS.text} />
        </Pressable>
        <Text style={styles.title}>Perfume Wrapped</Text>
        <View style={{ width: 26 }} />
      </View>

      {!isPro ? (
        <EmptyState
          icon="lock-closed"
          title="Pro Feature"
          subtitle="Upgrade to Pro to see your year in fragrance."
          actionLabel="Upgrade"
          onAction={() => router.push('/paywall')}
        />
      ) : stats.totalWears < 5 ? (
        <EmptyState
          icon="calendar-outline"
          title="Keep logging"
          subtitle="Log a few more wears and your Wrapped will come to life — it updates as you go."
        />
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.sub}>Your last 12 months in fragrance</Text>

          {hero && (
            <View style={styles.hero}>
              <Text style={styles.heroEyebrow}>YOUR SIGNATURE SCENT</Text>
              <View style={styles.heroRow}>
                {hero.image_url ? (
                  <Image source={{ uri: hero.image_url }} style={styles.heroImg} />
                ) : (
                  <View style={[styles.heroImg, styles.heroImgFallback]}>
                    <Ionicons name="flask-outline" size={28} color={COLORS.subtle} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.heroBrand}>{hero.brand}</Text>
                  <Text style={styles.heroName}>{hero.name}</Text>
                  <Text style={styles.heroCount}>Worn {stats.topFragranceCount} times</Text>
                </View>
              </View>
            </View>
          )}

          <View style={styles.grid}>
            <Stat n={stats.totalWears} label="Total Wears" />
            <Stat n={stats.uniqueFragrances} label="Unique Fragrances" />
            <Stat n={stats.longestStreak} label="Longest Streak" />
            <Stat
              n={stats.pctCollectionWorn == null ? '—' : `${stats.pctCollectionWorn}%`}
              label="Collection Worn"
            />
          </View>

          {stats.topOccasion && (
            <View style={styles.lineCard}>
              <Ionicons name="sparkles-outline" size={18} color={COLORS.accent} />
              <Text style={styles.lineText}>
                You mostly reached for scent on{' '}
                <Text style={styles.lineEmph}>{OCCASION_LABEL[stats.topOccasion]}</Text>
              </Text>
            </View>
          )}

          {stats.topBrand && (
            <View style={styles.lineCard}>
              <Ionicons name="ribbon-outline" size={18} color={COLORS.accent} />
              <Text style={styles.lineText}>
                Your most-worn house was{' '}
                <Text style={styles.lineEmph}>{stats.topBrand}</Text>
              </Text>
            </View>
          )}

          <View style={styles.seasonCard}>
            <Text style={styles.seasonTitle}>BY SEASON</Text>
            {SEASONS.map((s) => {
              const n = stats.seasonal[s];
              const pct = stats.totalWears > 0 ? n / stats.totalWears : 0;
              return (
                <View key={s} style={styles.seasonRow}>
                  <Text style={styles.seasonName}>{s}</Text>
                  <View style={styles.seasonBarTrack}>
                    <View style={[styles.seasonBarFill, { width: `${Math.round(pct * 100)}%` }]} />
                  </View>
                  <Text style={styles.seasonNum}>{n}</Text>
                </View>
              );
            })}
          </View>

          <Pressable style={styles.shareBtn} onPress={onShare}>
            <Ionicons name="share-outline" size={18} color={COLORS.white} />
            <Text style={styles.shareText}>Share my Wrapped</Text>
          </Pressable>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Stat({ n, label }: { n: number | string; label: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.bigNum}>{n}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
  },
  title: { ...TYPE.heading, textAlign: 'center' },
  body: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xl * 2 },
  sub: { ...TYPE.caption, textAlign: 'center', marginBottom: SPACING.xs },

  hero: {
    backgroundColor: COLORS.card, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.lg,
  },
  heroEyebrow: { ...TYPE.caption, letterSpacing: 1, color: COLORS.accent, marginBottom: SPACING.sm },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  heroImg: { width: 64, height: 80, borderRadius: RADIUS.md, backgroundColor: COLORS.card2 },
  heroImgFallback: { alignItems: 'center', justifyContent: 'center' },
  heroBrand: { ...TYPE.caption, textTransform: 'uppercase', letterSpacing: 0.5 },
  heroName: { fontFamily: FONTS.serif, fontSize: 20, color: COLORS.text, marginVertical: 2 },
  heroCount: { ...TYPE.caption, color: COLORS.accentDim },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, justifyContent: 'center' },
  statCard: {
    width: '47%', paddingVertical: SPACING.lg,
    backgroundColor: COLORS.card, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border, alignItems: 'center',
  },
  bigNum: { fontFamily: FONTS.serif, fontSize: 40, fontWeight: '700', color: COLORS.accent, lineHeight: 46 },
  statLabel: { ...TYPE.caption, marginTop: 4, textAlign: 'center' },

  lineCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.card, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md,
  },
  lineText: { ...TYPE.body, flex: 1 },
  lineEmph: { fontFamily: FONTS.serif, color: COLORS.accentDim },

  seasonCard: {
    backgroundColor: COLORS.card, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.lg, gap: SPACING.sm,
  },
  seasonTitle: { ...TYPE.caption, letterSpacing: 1, color: COLORS.muted, marginBottom: SPACING.xs },
  seasonRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  seasonName: { ...TYPE.caption, width: 56, color: COLORS.text },
  seasonBarTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: COLORS.card2, overflow: 'hidden' },
  seasonBarFill: { height: '100%', borderRadius: 4, backgroundColor: COLORS.accentSoft },
  seasonNum: { ...TYPE.caption, width: 28, textAlign: 'right', color: COLORS.muted },

  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.accent, borderRadius: RADIUS.lg, paddingVertical: SPACING.md,
    marginTop: SPACING.sm,
  },
  shareText: { ...TYPE.body, color: COLORS.white, fontWeight: '600' },
});
