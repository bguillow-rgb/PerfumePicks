import { ScrollView, View, Text, StyleSheet, Pressable, RefreshControl, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState, useEffect } from 'react';
import { COLORS, SPACING, TYPE, FONTS, RADIUS } from '@/src/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { FragranceCard } from '@/src/components/fragrance/FragranceCard';
import { DupePicker } from '@/src/components/fragrance/DupePicker';
import { useCatalogStore } from '@/src/stores/useCatalogStore';
import { useIcons, useWardrobePicks, useNewArrivals, useTasteProfile } from '@/src/features/recommend/useRecommendations';
import { type DerivedTasteProfile } from '@/src/features/recommend/tasteProfile';
import { useWardrobeStore } from '@/src/stores/useWardrobeStore';
import { useWearLogStore } from '@/src/stores/useWearLogStore';
import { useSwipeStore } from '@/src/stores/useSwipeStore';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useSOTDFeed, SOTDEntry } from '@/src/hooks/useSOTDFeed';
import { useProStore } from '@/src/stores/useProStore';
import type { Fragrance } from '@/src/stores/useCatalogStore';

/**
 * Home / "Today" tab — daily ritual surface.
 *
 * Sections:
 *   1. Scent of the Day — wardrobe-only hero (#1 pick) + 2 sub-cards, with reasons
 *   2. Discover — quiz entry card (free 5Q) + pro deep-dive teaser
 *   3. Icons — beloved community picks
 *   4. Trending in your taste — taste-filtered catalog
 *   5. Community Wore — social feed strip
 */
export default function HomeScreen() {
  const router = useRouter();
  const isPro = useProStore((s) => s.isPro);

  const icons = useIcons();
  const newArrivals = useNewArrivals(8);
  const { picks: wardrobePicks, loading: wardrobePicksLoading } = useWardrobePicks(3);

  // Streak counter — reads from profiles.current_streak on focus.
  const [streak, setStreak] = useState(0);
  useFocusEffect(
    useCallback(() => {
      if (!isSupabaseConfigured) return;
      (async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase.from('profiles').select('current_streak').eq('id', user.id).maybeSingle();
        if (data?.current_streak != null) setStreak(data.current_streak);
      })();
    }, [])
  );

  const wardrobeItems = useWardrobeStore((s) => s.items);
  const wearLogs = useWearLogStore((s) => s.logs);
  const ownedCount = wardrobeItems.filter((i) => i.status === 'have').length;
  const swipesMap = useSwipeStore((s) => s.swipes);
  const swipeCount = Object.keys(swipesMap).length;
  const tasteProfile = useTasteProfile();

  const greeting = useGreeting();
  const { entries: sotdEntries, loading: sotdLoading, refresh: refreshSOTD } = useSOTDFeed();

  // Refresh community feed on tab focus
  useFocusEffect(useCallback(() => { refreshSOTD(); }, [refreshSOTD]));

  // Inline "wore today?" — check if hero pick was already logged today
  const heroPick = wardrobePicks[0];
  const subPicks = wardrobePicks.slice(1, 3);
  const today = new Date().toLocaleDateString('en-CA');
  const heroLoggedToday = useMemo(() => {
    if (!heroPick) return false;
    return wearLogs.some((l) => l.fragrance_id === heroPick.fragrance.id && l.worn_on === today);
  }, [wearLogs, heroPick, today]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => refreshSOTD()}
            tintColor={COLORS.accent}
          />
        }
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <Text
            style={styles.wordmark}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
            allowFontScaling={false}
          >
            Perfume Picks
          </Text>
          <View style={styles.greetingRow}>
            <Text style={styles.greeting}>{greeting.toLowerCase()}</Text>
            {streak > 0 && (
              <>
                <Text style={styles.greetingDot}>·</Text>
                <Ionicons name="flame" size={12} color={COLORS.accent} />
                <Text style={styles.streakText}>{streak} day streak</Text>
              </>
            )}
          </View>
        </View>

        {/* ── Discover card — shown FIRST when wardrobe is empty ── */}
        {ownedCount === 0 && <DiscoverCard isPro={isPro} router={router} />}

        {/* ── Scent of the Day ── */}
        <Section eyebrow="SCENT OF THE DAY" cursive="from your wardrobe">
          {ownedCount === 0 ? (
            // Empty state — nothing in wardrobe
            <View style={[styles.sotdEmpty, { marginRight: SPACING.lg }]}>
              <Ionicons name="flask-outline" size={32} color={COLORS.accent} style={{ marginBottom: SPACING.sm }} />
              <Text style={styles.sotdEmptyTitle}>Your wardrobe is empty</Text>
              <Text style={styles.sotdEmptyBody}>
                Add the bottles you own and we'll tell you what to wear today — and why.
              </Text>
              <Pressable style={styles.sotdEmptyCta} onPress={() => router.push('/(tabs)/wardrobe')}>
                <Text style={styles.sotdEmptyCtaText}>Add to Wardrobe →</Text>
              </Pressable>
            </View>
          ) : wardrobePicksLoading ? (
            null
          ) : wardrobePicks.length === 0 ? (
            // Has owned items but not enough signals to rank
            <View style={[styles.sotdEmpty, { marginRight: SPACING.lg }]}>
              <Ionicons name="sparkles-outline" size={32} color={COLORS.accent} style={{ marginBottom: SPACING.sm }} />
              <Text style={styles.sotdEmptyTitle}>Building your picks…</Text>
              <Text style={styles.sotdEmptyBody}>
                Swipe a few fragrances in Taste so we can rank what's in your wardrobe for today.
              </Text>
              <Pressable style={styles.sotdEmptyCta} onPress={() => router.push('/(tabs)/train')}>
                <Text style={styles.sotdEmptyCtaText}>Train My Nose →</Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ marginRight: SPACING.lg }}>
              {/* #1 Hero pick */}
              <SOTDHeroCard
                pick={heroPick}
                loggedToday={heroLoggedToday}
                onPress={() => router.push(`/(tabs)/fragrance/${heroPick.fragrance.id}` as any)}
                onLogWear={() => router.push(`/(tabs)/fragrance/${heroPick.fragrance.id}?openLogWear=true` as any)}
              />

              {/* #2 + #3 sub-picks */}
              {subPicks.length > 0 && (
                <View style={styles.sotdSubRow}>
                  {subPicks.map((pick, i) => (
                    <SOTDSubCard
                      key={pick.fragrance.id}
                      pick={pick}
                      rank={i + 2}
                      onPress={() => router.push(`/(tabs)/fragrance/${pick.fragrance.id}` as any)}
                    />
                  ))}
                </View>
              )}
            </View>
          )}
        </Section>

        {/* ── Taste Profile Teaser ── */}
        {tasteProfile.signal_count > 0 && (
          <TasteTeaser
            profile={tasteProfile}
            isPro={isPro}
            swipeCount={swipeCount}
            onPress={() => router.push('/taste-profile' as any)}
            onTrain={() => router.push('/(tabs)/train' as any)}
          />
        )}

        {/* ── Don't Pay a Fortune — dupe finder, seeded from wishlist ── */}
        <HomeDupeModule />

        {/* ── Community SOTD ── */}
        <Section
          eyebrow="COMMUNITY SOTD"
          cursive="wearing today"
          action={
            sotdEntries.length > 0
              ? <Pressable onPress={() => router.push('/feed' as any)}>
                  <Text style={styles.seeAllLink}>See all →</Text>
                </Pressable>
              : undefined
          }
        >
          {sotdEntries.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
              {sotdEntries.slice(0, 10).map((entry) => (
                <CommunityCard key={entry.id} entry={entry} onPress={() => router.push(`/(tabs)/fragrance/${entry.fragrance_id}` as any)} />
              ))}
            </ScrollView>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
              {(newArrivals.length > 0 ? newArrivals : icons).slice(0, 8).map((f) => (
                <FeaturedFragranceCard
                  key={f.id}
                  fragrance={f}
                  onPress={() => router.push(`/(tabs)/fragrance/${f.id}` as any)}
                />
              ))}
            </ScrollView>
          )}
        </Section>

        {/* ── Discover card — shown AFTER community sotd when wardrobe has items ── */}
        {ownedCount > 0 && <DiscoverCard isPro={isPro} router={router} />}

        {/* ── Icons ── */}
        <Section eyebrow="ICONS" cursive="beloved">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
            {icons.map((f) => <FragranceCard key={f.id} fragrance={f} variant="compact" />)}
          </ScrollView>
        </Section>

        <View style={styles.footer}>
          <View style={styles.footerRule} />
          <Text style={styles.footerText}>
            Curated with intention. Tap any fragrance to explore notes, accords, and similar bottles.
          </Text>
          <View style={styles.footerRule} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── SOTD Hero Card (#1 pick) ─────────────────────────────────────────────────

function SOTDHeroCard({ pick, loggedToday, onPress, onLogWear }: {
  pick: { fragrance: Fragrance; reason: string; lastWorn: string | null };
  loggedToday: boolean;
  onPress: () => void;
  onLogWear: () => void;
}) {
  const { fragrance, reason, lastWorn } = pick;
  const accord = fragrance.top_accords[0];
  const lastWornLabel = (() => {
    if (!lastWorn) return null;
    const days = Math.round((Date.now() - new Date(lastWorn + 'T12:00:00').getTime()) / 86400000);
    if (days === 0) return 'worn today';
    if (days === 1) return 'worn yesterday';
    if (days < 30) return `worn ${days}d ago`;
    return `${Math.floor(days / 30)}mo ago`;
  })();

  return (
    <Pressable style={({ pressed }) => [heroCard.wrap, pressed && { opacity: 0.9 }]} onPress={onPress}>
      {/* Image */}
      <View style={heroCard.imgWrap}>
        {fragrance.image_url ? (
          <Image source={{ uri: fragrance.image_url }} style={heroCard.img} resizeMode="cover" />
        ) : (
          <View style={[heroCard.img, heroCard.imgPlaceholder]}>
            <Ionicons name="flask-outline" size={40} color={COLORS.accent} />
          </View>
        )}
        {/* Rank badge */}
        <View style={heroCard.rankBadge}>
          <Ionicons name="sparkles" size={10} color={COLORS.white} />
          <Text style={heroCard.rankText}>TODAY'S TOP PICK</Text>
        </View>
      </View>

      {/* Info */}
      <View style={heroCard.info}>
        <Text style={heroCard.brand}>{fragrance.brand.toUpperCase()}</Text>
        <Text style={heroCard.name} numberOfLines={2}>{fragrance.name}</Text>

        {accord && (
          <View style={heroCard.chip}>
            <Text style={heroCard.chipText}>{accord}</Text>
          </View>
        )}

        {/* Reason */}
        <View style={heroCard.reasonRow}>
          <Ionicons name="information-circle-outline" size={13} color={COLORS.accent} />
          <Text style={heroCard.reason} numberOfLines={3}>
            <Text style={heroCard.reasonLabel}>Why today: </Text>
            {reason || 'Matches your current taste profile and the season.'}
          </Text>
        </View>

        {/* Bottom row: last worn + log */}
        <View style={heroCard.bottomRow}>
          {lastWornLabel && (
            <Text style={heroCard.lastWorn}>{lastWornLabel}</Text>
          )}
          {!loggedToday ? (
            <Pressable
              style={heroCard.logBtn}
              onPress={(e) => { e.stopPropagation?.(); onLogWear(); }}
              hitSlop={8}
            >
              <Text style={heroCard.logBtnText}>Wore this today? Log it →</Text>
            </Pressable>
          ) : (
            <View style={heroCard.loggedPill}>
              <Ionicons name="checkmark-circle" size={12} color={COLORS.accent} />
              <Text style={heroCard.loggedText}>Logged today</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const heroCard = StyleSheet.create({
  wrap: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  imgWrap: { width: '100%', height: 220, position: 'relative' },
  img: { width: '100%', height: '100%' },
  imgPlaceholder: {
    backgroundColor: COLORS.card2 ?? COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadge: {
    position: 'absolute',
    top: SPACING.sm,
    left: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  rankText: { ...TYPE.eyebrow, fontSize: 9, color: COLORS.white, letterSpacing: 1 },
  info: { padding: SPACING.md, gap: SPACING.xs },
  brand: { ...TYPE.eyebrow, fontSize: 10, color: COLORS.accent },
  name: { fontFamily: FONTS.serif, fontSize: 22, fontWeight: '600', color: COLORS.text, lineHeight: 28 },
  chip: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.blushSoft,
    borderRadius: RADIUS.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 2,
  },
  chipText: { ...TYPE.caption, fontSize: 11, color: COLORS.muted },
  reasonRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: SPACING.xs },
  reason: { ...TYPE.bodySmall, color: COLORS.muted, fontStyle: 'italic', flex: 1, lineHeight: 18 },
  reasonLabel: { fontStyle: 'normal', color: COLORS.accent, fontWeight: '600' },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  lastWorn: { ...TYPE.caption, fontSize: 10, color: COLORS.subtle ?? COLORS.muted, fontStyle: 'italic' },
  logBtn: {},
  logBtnText: { ...TYPE.label, fontSize: 11, color: COLORS.accent, letterSpacing: 0.3 },
  loggedPill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  loggedText: { ...TYPE.caption, fontSize: 11, color: COLORS.accent },
});

// ─── SOTD Sub Card (#2 / #3 picks) ───────────────────────────────────────────

function SOTDSubCard({ pick, rank, onPress }: {
  pick: { fragrance: Fragrance; reason: string; lastWorn: string | null };
  rank: number;
  onPress: () => void;
}) {
  const { fragrance, reason } = pick;

  return (
    <Pressable style={({ pressed }) => [subCard.wrap, pressed && { opacity: 0.85 }]} onPress={onPress}>
      {fragrance.image_url ? (
        <Image source={{ uri: fragrance.image_url }} style={subCard.img} resizeMode="cover" />
      ) : (
        <View style={[subCard.img, subCard.imgPlaceholder]}>
          <Ionicons name="flask-outline" size={20} color={COLORS.accent} />
        </View>
      )}
      <View style={subCard.info}>
        <Text style={subCard.rank}>#{rank}</Text>
        <Text style={subCard.name} numberOfLines={1}>{fragrance.name}</Text>
        <Text style={subCard.brand} numberOfLines={1}>{fragrance.brand.toUpperCase()}</Text>
        <Text style={subCard.reason} numberOfLines={2}>{reason || 'A strong alternative for today.'}</Text>
      </View>
    </Pressable>
  );
}

const subCard = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  img: { width: '100%', height: 90 },
  imgPlaceholder: {
    backgroundColor: COLORS.card2 ?? COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { padding: SPACING.sm, gap: 2 },
  rank: { ...TYPE.eyebrow, fontSize: 9, color: COLORS.accent, letterSpacing: 1 },
  name: { fontFamily: FONTS.serif, fontSize: 13, fontWeight: '600', color: COLORS.text },
  brand: { ...TYPE.eyebrow, fontSize: 9, color: COLORS.muted },
  reason: { ...TYPE.caption, fontSize: 10, color: COLORS.muted, fontStyle: 'italic', lineHeight: 14, marginTop: 3 },
});

// ─── Community Card ───────────────────────────────────────────────────────────

// ─── Discover Card ───────────────────────────────────────────────────────────

function DiscoverCard({ isPro, router }: { isPro: boolean; router: ReturnType<typeof useRouter> }) {
  return (
    <Section eyebrow="DISCOVER" cursive="your signature">
      <View style={[styles.discoverCard, { marginRight: SPACING.lg }]}>
        <View style={styles.discoverTop}>
          <View style={styles.discoverTextWrap}>
            <Text style={styles.discoverTitle}>Find your perfect fragrance</Text>
            <Text style={styles.discoverBody}>
              {isPro
                ? 'Answer 10 questions and we\'ll build your full taste profile.'
                : 'Answer 5 free questions — or go deeper with 10 on Pro.'}
            </Text>
          </View>
          <View style={styles.discoverIconWrap}>
            <Ionicons name="sparkles" size={28} color={COLORS.accent} />
          </View>
        </View>
        <Pressable style={styles.discoverBtn} onPress={() => router.push('/quiz')}>
          <Text style={styles.discoverBtnText}>Take the Taste Quiz</Text>
          <Ionicons name="arrow-forward" size={14} color={COLORS.white} />
        </Pressable>
        {!isPro && (
          <Pressable style={styles.proTeaser} onPress={() => router.push('/paywall' as any)}>
            <Ionicons name="lock-closed-outline" size={12} color={COLORS.accent} />
            <Text style={styles.proTeaserText}>
              Pro: 10 questions — sillage, off-notes, identity & more →
            </Text>
          </Pressable>
        )}
      </View>
    </Section>
  );
}

// ─── Don't Pay a Fortune (dupe finder module) ───────────────────────────────

/**
 * Home dupe module (PRD §7.1, surface 3 — founder's idea). Seeds the dupe
 * finder from the user's priciest wishlist ('want') item when present, so the
 * first thing they see is "you wishlisted X — here's how to smell like it for
 * less." Falls back to an open search prompt when the wishlist is empty.
 */
function HomeDupeModule() {
  const wardrobeItems = useWardrobeStore((s) => s.items);
  const fetchById = useCatalogStore((s) => s.fetchById);
  const [seed, setSeed] = useState<Fragrance | undefined>(undefined);

  // Seed from the first wishlist ('want') item, if any.
  const wantId = useMemo(
    () => wardrobeItems.find((i) => i.status === 'want')?.fragrance_id,
    [wardrobeItems],
  );

  useEffect(() => {
    if (!wantId) { setSeed(undefined); return; }
    let cancelled = false;
    fetchById(wantId).then((f) => { if (!cancelled) setSeed(f); });
    return () => { cancelled = true; };
  }, [wantId, fetchById]);

  return (
    <Section eyebrow="DON'T PAY A FORTUNE" cursive="smell rich for less">
      <View style={[styles.dupeModule, { marginRight: SPACING.lg }]}>
        <Text style={styles.dupeModuleSub}>
          {seed
            ? `You wishlisted ${seed.name}. Here's how to smell like it for less.`
            : "Pick a pricey fragrance you love — we'll rank the ones that smell the same for less."}
        </Text>
        {/* key remounts the picker once the async seed resolves, since
            DupePicker reads initialOriginal only in its useState initializer. */}
        {wantId && !seed ? null : (
          <DupePicker key={seed?.id ?? 'search'} initialOriginal={seed} placeholder="Less expensive options for…" />
        )}
      </View>
    </Section>
  );
}

// ─── Taste Profile Teaser ──────────────────────────────────────────────────

function TasteTeaser({ profile, isPro, swipeCount, onPress, onTrain }: {
  profile: DerivedTasteProfile;
  isPro: boolean;
  swipeCount: number;
  onPress: () => void;
  onTrain: () => void;
}) {
  const topAccords = Object.entries(profile.preferred_accords)
    .sort((a, b) => b[1] - a[1])
    .slice(0, isPro ? 5 : 3)
    .map(([name]) => name);

  return (
    <Section eyebrow="YOUR TASTE" cursive="in the making">
      <Pressable
        style={({ pressed }) => [tasteCard.wrap, { marginRight: SPACING.lg }, pressed && { opacity: 0.9 }]}
        onPress={onPress}
      >
        <View style={tasteCard.top}>
          <View style={tasteCard.textWrap}>
            <Text style={tasteCard.label}>Top accords</Text>
            <View style={tasteCard.chipRow}>
              {topAccords.map((accord) => (
                <View key={accord} style={tasteCard.chip}>
                  <Text style={tasteCard.chipText}>{accord}</Text>
                </View>
              ))}
              {!isPro && (
                <View style={[tasteCard.chip, tasteCard.chipLocked]}>
                  <Ionicons name="lock-closed" size={9} color={COLORS.muted} />
                  <Text style={[tasteCard.chipText, { color: COLORS.muted }]}>+more</Text>
                </View>
              )}
            </View>
          </View>
          <View style={tasteCard.statWrap}>
            <Text style={tasteCard.statValue}>{swipeCount}</Text>
            <Text style={tasteCard.statLabel}>swipes</Text>
          </View>
        </View>
        <View style={tasteCard.footer}>
          <Text style={tasteCard.footerText}>
            {isPro ? 'View full taste breakdown →' : 'Keep training to sharpen your picks →'}
          </Text>
          <Pressable onPress={(e) => { e.stopPropagation?.(); onTrain(); }} hitSlop={8}>
            <Text style={tasteCard.trainLink}>Train now</Text>
          </Pressable>
        </View>
      </Pressable>
    </Section>
  );
}

const tasteCard = StyleSheet.create({
  wrap: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  top: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: SPACING.md,
    gap: SPACING.md,
  },
  textWrap: { flex: 1, gap: SPACING.sm },
  label: { ...TYPE.eyebrow, fontSize: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: COLORS.blushSoft,
    borderRadius: RADIUS.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: COLORS.blush,
  },
  chipLocked: { backgroundColor: COLORS.card2 ?? COLORS.card, borderColor: COLORS.border },
  chipText: { ...TYPE.caption, fontSize: 11, color: COLORS.accent },
  statWrap: { alignItems: 'center', paddingTop: 2 },
  statValue: { fontFamily: FONTS.serif, fontSize: 26, fontWeight: '700', color: COLORS.accent, lineHeight: 30 },
  statLabel: { ...TYPE.caption, fontSize: 9, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 1 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  footerText: { ...TYPE.caption, fontSize: 11, color: COLORS.muted, fontStyle: 'italic', flex: 1 },
  trainLink: { ...TYPE.label, fontSize: 11, color: COLORS.accent, letterSpacing: 0.3, marginLeft: SPACING.sm },
});

// ─── Featured Fragrance Card (fallback when community feed is empty) ─────────

function FeaturedFragranceCard({ fragrance, onPress }: { fragrance: Fragrance; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [communityCard.wrap, pressed && { opacity: 0.8 }]} onPress={onPress}>
      <View style={communityCard.imgWrap}>
        {fragrance.image_url ? (
          <Image source={{ uri: fragrance.image_url }} style={communityCard.img} />
        ) : (
          <View style={[communityCard.img, communityCard.imgPlaceholder]}>
            <Ionicons name="flask-outline" size={20} color={COLORS.accent} />
          </View>
        )}
      </View>
      <View style={communityCard.info}>
        <Text style={communityCard.name} numberOfLines={1}>{fragrance.name}</Text>
        <Text style={communityCard.brand} numberOfLines={1}>{fragrance.brand}</Text>
        <View style={communityCard.userRow}>
          <Ionicons name="sparkles-outline" size={11} color={COLORS.accent} />
          <Text style={[communityCard.userName, { color: COLORS.accent }]}>Featured pick</Text>
        </View>
        <Text style={communityCard.date}>Log yours to share</Text>
      </View>
    </Pressable>
  );
}

// ─── Community Card ───────────────────────────────────────────────────────────

function CommunityCard({ entry, onPress }: { entry: SOTDEntry; onPress: () => void }) {
  const displayName = entry.profiles?.display_name ?? 'Anonymous';
  const fragranceName = entry.fragrances?.name ?? '—';
  const brandName = entry.fragrances?.brands?.name ?? '';
  const imageUrl = entry.fragrances?.image_url ?? null;
  const initials = displayName.slice(0, 2).toUpperCase();
  const relDate = (() => {
    const todayStr = new Date().toLocaleDateString('en-CA');
    const yesterdayStr = new Date(Date.now() - 86400000).toLocaleDateString('en-CA');
    if (entry.worn_on === todayStr) return 'today';
    if (entry.worn_on === yesterdayStr) return 'yesterday';
    return new Date(entry.worn_on + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  })();

  return (
    <Pressable style={({ pressed }) => [communityCard.wrap, pressed && { opacity: 0.8 }]} onPress={onPress}>
      <View style={communityCard.imgWrap}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={communityCard.img} />
        ) : (
          <View style={[communityCard.img, communityCard.imgPlaceholder]}>
            <Ionicons name="flask-outline" size={20} color={COLORS.accent} />
          </View>
        )}
      </View>
      <View style={communityCard.info}>
        <Text style={communityCard.name} numberOfLines={1}>{fragranceName}</Text>
        {brandName ? <Text style={communityCard.brand} numberOfLines={1}>{brandName}</Text> : null}
        <View style={communityCard.userRow}>
          <View style={communityCard.avatar}>
            <Text style={communityCard.avatarText}>{initials}</Text>
          </View>
          <Text style={communityCard.userName} numberOfLines={1}>{displayName}</Text>
        </View>
        <Text style={communityCard.date}>{relDate}</Text>
      </View>
    </Pressable>
  );
}

const communityCard = StyleSheet.create({
  wrap: {
    width: 130,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    marginRight: SPACING.sm,
  },
  imgWrap: { width: '100%', height: 90 },
  img: { width: '100%', height: '100%' },
  imgPlaceholder: {
    backgroundColor: COLORS.card2 ?? COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { padding: SPACING.sm, gap: 2 },
  name: { fontFamily: FONTS.serif, fontSize: 13, fontWeight: '600', color: COLORS.text },
  brand: { ...TYPE.caption, color: COLORS.muted, fontSize: 10 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  avatar: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: COLORS.blushSoft,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 0.5, borderColor: COLORS.blush,
  },
  avatarText: { fontFamily: FONTS.serif, fontSize: 9, color: COLORS.accent, fontWeight: '600' },
  userName: { ...TYPE.caption, fontSize: 10, color: COLORS.muted, flex: 1 },
  date: { ...TYPE.caption, fontSize: 9, color: COLORS.subtle ?? COLORS.muted, fontStyle: 'italic' },
});

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ eyebrow, cursive, action, children }: {
  eyebrow: string;
  cursive?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
        {cursive && <Text style={styles.sectionCursive}>{cursive}</Text>}
        {action && <View style={styles.sectionAction}>{action}</View>}
      </View>
      {children}
    </View>
  );
}

function useGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'STILL UP';
  if (h < 12) return 'GOOD MORNING';
  if (h < 17) return 'GOOD AFTERNOON';
  if (h < 21) return 'GOOD EVENING';
  return 'TONIGHT';
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  container: { paddingBottom: SPACING.xxl * 1.5 },
  header: {
    paddingHorizontal: SPACING.md,
    paddingTop: 0,
    paddingBottom: SPACING.xs,
  },
  wordmark: {
    fontFamily: 'PinyonScript_400Regular',
    fontSize: 52,
    color: COLORS.accent,
    lineHeight: 80,
    textAlign: 'center',
    flexShrink: 1,
  },
  greetingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, marginTop: -4, marginBottom: SPACING.xs,
  },
  greeting: {
    fontFamily: 'CormorantGaramond_400Regular_Italic',
    fontSize: 14,
    color: COLORS.muted,
    letterSpacing: 0.3,
  },
  greetingDot: { ...TYPE.caption, color: COLORS.muted, fontSize: 12 },
  streakText: { ...TYPE.label, fontSize: 11, color: COLORS.accent, letterSpacing: 0.5 },

  // ── Sections ──
  section: {
    paddingLeft: SPACING.lg,
    marginTop: SPACING.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    marginBottom: SPACING.md,
    paddingRight: SPACING.lg,
    gap: 10,
  },
  sectionEyebrow: { ...TYPE.eyebrow },
  sectionCursive: {
    fontFamily: 'PinyonScript_400Regular',
    fontSize: 22,
    color: COLORS.accent,
    lineHeight: 34,
    paddingLeft: 6,
  },
  sectionAction: { marginLeft: 'auto' },
  hScroll: { paddingRight: SPACING.lg },
  seeAllLink: { ...TYPE.label, fontSize: 11, color: COLORS.accent, letterSpacing: 0.5 },

  // ── SOTD empty state ──
  sotdEmpty: {
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.lg,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    gap: SPACING.xs,
  },
  sotdEmptyTitle: {
    fontFamily: FONTS.serif,
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
  },
  sotdEmptyBody: {
    ...TYPE.bodySmall,
    color: COLORS.muted,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: SPACING.sm,
  },
  sotdEmptyCta: { marginTop: SPACING.sm },
  sotdEmptyCtaText: { ...TYPE.label, fontSize: 13, color: COLORS.accent, letterSpacing: 0.5 },

  // ── SOTD sub-row ──
  sotdSubRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },

  // ── Don't Pay a Fortune dupe module ──
  dupeModule: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.accent,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  dupeModuleSub: { ...TYPE.bodySmall, color: COLORS.muted, lineHeight: 19 },

  // ── Discover card ──
  discoverCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  discoverTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
  },
  discoverTextWrap: { flex: 1, gap: SPACING.xs },
  discoverIconWrap: {
    width: 52, height: 52,
    backgroundColor: COLORS.blushSoft,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.blush,
  },
  discoverTitle: {
    fontFamily: FONTS.serif,
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
    lineHeight: 26,
  },
  discoverBody: {
    ...TYPE.bodySmall,
    color: COLORS.muted,
    lineHeight: 20,
  },
  discoverBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.accent,
    paddingVertical: 14,
    borderRadius: RADIUS.full,
  },
  discoverBtnText: { ...TYPE.label, color: COLORS.white, fontSize: 13, letterSpacing: 1 },
  proTeaser: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: SPACING.xs,
  },
  proTeaserText: {
    ...TYPE.caption,
    fontSize: 11,
    color: COLORS.accent,
    fontStyle: 'italic',
    flex: 1,
    lineHeight: 16,
  },

  // ── Footer ──
  footer: {
    marginTop: SPACING.xxl,
    paddingHorizontal: SPACING.xl,
    alignItems: 'center',
    gap: SPACING.md,
  },
  footerRule: { width: 40, height: 1, backgroundColor: COLORS.accent, opacity: 0.4 },
  footerText: {
    ...TYPE.caption,
    fontStyle: 'italic',
    textAlign: 'center',
    color: COLORS.muted,
    paddingHorizontal: SPACING.md,
    lineHeight: 18,
  },
});
