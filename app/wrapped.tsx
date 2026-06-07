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

/**
 * Perfume Wrapped — your year in fragrance.
 * Pro-gated. Computed CLIENT-SIDE from the local wear log (keyed by slug, same
 * as the catalog) so it's always available on a rolling trailing-12-months
 * window — no December dead-stub, no RPC UUID/slug mismatch.
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

const SEASONS = ['Winter', 'Spring', 'Summer', 'Fall'] as const;
type Season = (typeof SEASONS)[number];

function seasonForMonth(month: number): Season {
  // month is 0-indexed
  if (month <= 1 || month === 11) return 'Winter';
  if (month <= 4) return 'Spring';
  if (month <= 7) return 'Summer';
  return 'Fall';
}

function topKey<T extends string>(counts: Record<T, number>): T | null {
  let best: T | null = null;
  let bestN = 0;
  for (const k in counts) {
    if (counts[k] > bestN) { bestN = counts[k]; best = k as T; }
  }
  return best;
}

interface WrappedStats {
  totalWears: number;
  uniqueFragrances: number;
  topFragranceId: string | null;
  topFragranceCount: number;
  topBrand: string | null;
  topOccasion: Occasion | null;
  seasonal: Record<Season, number>;
  pctCollectionWorn: number | null;
  longestStreak: number;
}

export default function WrappedScreen() {
  const router = useRouter();
  const isPro = useProStore((s) => s.isPro);
  const logs = useWearLogStore((s) => s.logs);
  const wardrobe = useWardrobeStore((s) => s.items);
  const getById = useCatalogStore((s) => s.getById);
  const fetchById = useCatalogStore((s) => s.fetchById);
  const [hero, setHero] = useState<Fragrance | undefined>(undefined);

  const stats: WrappedStats = useMemo(() => {
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 1);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const window = logs.filter((l) => l.worn_on >= cutoffStr);

    const fragCounts: Record<string, number> = {};
    const occCounts: Record<string, number> = {};
    const brandCounts: Record<string, number> = {};
    const seasonal: Record<Season, number> = { Winter: 0, Spring: 0, Summer: 0, Fall: 0 };
    const days = new Set<string>();

    for (const l of window) {
      fragCounts[l.fragrance_id] = (fragCounts[l.fragrance_id] ?? 0) + 1;
      if (l.occasion) occCounts[l.occasion] = (occCounts[l.occasion] ?? 0) + 1;
      const m = Number(l.worn_on.slice(5, 7)) - 1;
      if (m >= 0 && m <= 11) seasonal[seasonForMonth(m)]++;
      days.add(l.worn_on);
      const frag = getById(l.fragrance_id);
      if (frag?.brand) brandCounts[frag.brand] = (brandCounts[frag.brand] ?? 0) + 1;
    }

    const topFragranceId = topKey(fragCounts);

    // Longest streak of consecutive calendar days with at least one wear.
    const sortedDays = [...days].sort();
    let longestStreak = sortedDays.length > 0 ? 1 : 0;
    let run = longestStreak;
    for (let i = 1; i < sortedDays.length; i++) {
      const prev = new Date(sortedDays[i - 1] + 'T00:00:00');
      const cur = new Date(sortedDays[i] + 'T00:00:00');
      const diff = Math.round((cur.getTime() - prev.getTime()) / 86_400_000);
      if (diff === 1) { run++; longestStreak = Math.max(longestStreak, run); }
      else run = 1;
    }

    // % of "have" collection worn in the window.
    const haveIds = wardrobe.filter((i) => i.status === 'have').map((i) => i.fragrance_id);
    const wornHave = haveIds.filter((id) => fragCounts[id] > 0).length;
    const pctCollectionWorn = haveIds.length > 0
      ? Math.round((wornHave / haveIds.length) * 100)
      : null;

    return {
      totalWears: window.length,
      uniqueFragrances: Object.keys(fragCounts).length,
      topFragranceId,
      topFragranceCount: topFragranceId ? fragCounts[topFragranceId] : 0,
      topBrand: topKey(brandCounts),
      topOccasion: topKey(occCounts) as Occasion | null,
      seasonal,
      pctCollectionWorn,
      longestStreak,
    };
  }, [logs, wardrobe, getById]);

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
