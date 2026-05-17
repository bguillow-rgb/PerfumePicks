import { ScrollView, View, Text, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { COLORS, SPACING, TYPE, FONTS, RADIUS } from '@/src/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { FragranceCard } from '@/src/components/fragrance/FragranceCard';
import { WhatToWearSheet } from '@/src/components/sheets/WhatToWearSheet';
import { useRecommendations, useNewArrivals } from '@/src/features/recommend/useRecommendations';
import { useWardrobeStore } from '@/src/stores/useWardrobeStore';
import { useWearLogStore } from '@/src/stores/useWearLogStore';
import { getFragranceFromStore } from '@/src/stores/useCatalogStore';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { getWhyThis } from '@/src/lib/claude';
import { useProStore } from '@/src/stores/useProStore';

/**
 * Home / "Today" tab — the daily ritual surface.
 *
 * Sections (final v1):
 *   1. Wear Today — single hero pick from the recommendation engine
 *   2. Today's Edit — 3 picks tuned to weather + taste
 *   3. New Arrivals — recent additions to the catalog
 *   4. Trending in your taste — community popularity, taste-filtered
 *
 * Pulls from MOCK_CATALOG until Supabase is wired up. Greeting line is
 * time-of-day-aware so the screen feels alive on each open.
 */
export default function HomeScreen() {
  const router = useRouter();

  // Live recommendations driven by the user's swipes + wear logs + wardrobe.
  const live = useRecommendations();
  const newArrivals = useNewArrivals();

  // Defer rec updates until the screen is focused so mid-scroll visual jumps
  // don't happen when a swipe is recorded concurrently in Train.
  const [displayed, setDisplayed] = useState(live);
  const isFocused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      isFocused.current = true;
      setDisplayed(live);
      return () => { isFocused.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [live])
  );

  const { heroPick, heroReason, todaysEdit, trending, hasSignals } = displayed;

  const [whatToWearOpen, setWhatToWearOpen] = useState(false);

  // AI "Why this?" — Pro users get Claude reasoning, free users get static fallback.
  const isPro = useProStore((s) => s.isPro);
  const [aiReason, setAiReason] = useState<string | null>(null);
  useEffect(() => {
    if (!heroPick || !hasSignals) { setAiReason(null); return; }
    // Free users: skip the API call entirely (saves AI costs)
    if (!isPro) {
      setAiReason(null);
      return;
    }
    let cancelled = false;
    getWhyThis({
      taste_profile: {},
      fragrance_context: {
        name: heroPick.name,
        brand: heroPick.brand,
        top_accords: heroPick.top_accords,
        fragrance_family: heroPick.fragrance_family,
        top_notes: heroPick.top_notes,
      },
    }).then(({ text, fallback }) => {
      if (!cancelled) setAiReason(text ?? fallback);
    });
    return () => { cancelled = true; };
  }, [heroPick?.id, hasSignals, isPro]);

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

  // Allow manual dismiss of the onboarding card independent of hasSignals
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const showOnboarding = !hasSignals && !onboardingDismissed;
  const [nudgeDismissedId, setNudgeDismissedId] = useState<string | null>(null);

  // P2: "Did you wear this?" nudge — shown when user owns fragrances but
  // hasn't logged a wear today. Pick a random "have" item to suggest logging.
  const wardrobeItems = useWardrobeStore((s) => s.items);
  const wearLogs = useWearLogStore((s) => s.logs);
  const wearNudge = useMemo(() => {
    const haveItems = wardrobeItems.filter((i) => i.status === 'have');
    if (haveItems.length === 0) return null;
    const today = new Date().toLocaleDateString('en-CA');
    const loggedToday = new Set(wearLogs.filter((l) => l.worn_on === today).map((l) => l.fragrance_id));
    const unworn = haveItems.filter((i) => !loggedToday.has(i.fragrance_id));
    if (unworn.length === 0) return null;
    // Suggest the first item (stable — no random so the card doesn't jump on re-render).
    return unworn[0];
  }, [wardrobeItems, wearLogs]);

  const greeting = useGreeting();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => {
              // Force a re-render by toggling focus state — the useFocusEffect
              // will re-set displayed from live, picking up fresh data.
              setDisplayed(live);
            }}
            tintColor={COLORS.accent}
          />
        }
      >
        <View style={styles.header}>
          {/* Avatar lives in the bottom tab bar now — no duplicate here.
              Header is purely the editorial masthead. */}

          {/* Editorial masthead: thin champagne rules flanking the cursive
              wordmark, like the cover of Vogue or a fine fragrance house's
              monogrammed paper. The rules anchor the wordmark visually so it
              reads as a CREST, not just a heading. */}
          <View style={styles.mastheadRow}>
            <View style={styles.mastheadRule} />
            <Text
              style={styles.wordmark}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.82}
              allowFontScaling={false}
            >
              Perfume Picks
            </Text>
            <View style={styles.mastheadRule} />
          </View>

          {/* Quiet subtitle — italic serif, lowercase, soft taupe. Reads as
              a personal greeting/dateline rather than a UI label. The em-dash
              gives it editorial cadence ("good morning — saturday, april 25"). */}
          <Text style={styles.subtitle} numberOfLines={1}>
            {greeting.toLowerCase()} <Text style={styles.subtitleDash}>—</Text> {longDate().toLowerCase()}
          </Text>
          {streak > 0 && (
            <View style={styles.streakRow}>
              <Ionicons name="flame" size={14} color={COLORS.accent} />
              <Text style={styles.streakText}>{streak} day streak</Text>
            </View>
          )}
        </View>

        {/* Onboarding card — shown until the user has signals or dismisses it manually */}
        {showOnboarding && (
          <View style={styles.onboardingCard}>
            <Pressable style={styles.onboardingDismiss} onPress={() => setOnboardingDismissed(true)} hitSlop={8}>
              <Ionicons name="close" size={18} color={COLORS.muted} />
            </Pressable>
            <Text style={styles.onboardingTitle}>Welcome to Perfume Picks</Text>
            <Text style={styles.onboardingBody}>
              Tell us what you love and we'll personalise everything below.
            </Text>
            <View style={styles.onboardingActions}>
              <Pressable style={styles.onboardingBtn} onPress={() => router.push('/quiz')}>
                <Text style={styles.onboardingBtnText}>Take the Quiz</Text>
              </Pressable>
              <Pressable style={[styles.onboardingBtn, styles.onboardingBtnSecondary]} onPress={() => router.push('/(tabs)/train')}>
                <Text style={[styles.onboardingBtnText, styles.onboardingBtnTextSecondary]}>Start Swiping</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* P2: Wear nudge — shown when the user has bottles but hasn't logged today */}
        {wearNudge && wearNudge.fragrance_id !== nudgeDismissedId && (() => {
          const f = getFragranceFromStore(wearNudge.fragrance_id);
          if (!f) return null;
          return (
            <View style={styles.wearNudge}>
              <Pressable
                style={styles.wearNudgeMain}
                onPress={() => router.push(`/fragrance/${f.id}?openLogWear=true`)}
              >
                <Text style={styles.wearNudgeLabel}>DID YOU WEAR THIS TODAY?</Text>
                <Text style={styles.wearNudgeName}>{f.name}</Text>
                <Text style={styles.wearNudgeHint}>Tap to log →</Text>
              </Pressable>
              <Pressable
                style={styles.wearNudgeNo}
                onPress={() => setNudgeDismissedId(wearNudge.fragrance_id)}
                hitSlop={12}
              >
                <Text style={styles.wearNudgeNoText}>No</Text>
              </Pressable>
            </View>
          );
        })()}

        <Section
          eyebrow="WEAR TODAY"
          cursive="for you"
          action={
            <Pressable style={styles.askBtn} onPress={() => setWhatToWearOpen(true)}>
              <Ionicons name="sparkles" size={11} color={COLORS.accent} />
              <Text style={styles.askBtnText}>Ask →</Text>
            </Pressable>
          }
        >
          {/* Section uses paddingLeft only (so the horizontal carousels below
              can bleed cards off the right edge). The hero card is full-width
              so it needs explicit right padding to stay centered. */}
          <View style={styles.heroWrap}>
            {heroPick ? (
              <FragranceCard fragrance={heroPick} variant="hero" />
            ) : (
              <View style={styles.sectionEmpty}>
                <Text style={styles.sectionEmptyText}>Swipe a few fragrances in Train to get your first pick.</Text>
                <Pressable style={styles.sectionEmptyBtn} onPress={() => router.push('/(tabs)/train')}>
                  <Text style={styles.sectionEmptyBtnText}>Train My Nose →</Text>
                </Pressable>
              </View>
            )}
          </View>
          {heroPick && (
            <Text style={styles.heroReason}>
              <Text style={styles.italic}>{hasSignals ? 'Why this:' : 'A starting point:'}</Text>{' '}
              {aiReason ?? heroReason ?? (hasSignals
                ? 'Tracks with the notes and accords you keep favoring.'
                : 'A celebrated pick to anchor your taste — start swiping in Train to refine it.')}
            </Text>
          )}
        </Section>

        <Section eyebrow="TODAY'S EDIT" cursive="three picks">
          {todaysEdit.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
              {todaysEdit.map((f) => <FragranceCard key={f.id} fragrance={f} variant="compact" />)}
            </ScrollView>
          ) : (
            <View style={[styles.sectionEmpty, { marginRight: SPACING.lg }]}>
              <Text style={styles.sectionEmptyText}>Your edit appears once you've trained your nose a little.</Text>
            </View>
          )}
        </Section>

        <Section eyebrow="NEW ARRIVALS" cursive="just in">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
            {newArrivals.map((f) => <FragranceCard key={f.id} fragrance={f} variant="compact" />)}
          </ScrollView>
        </Section>

        <Section eyebrow={hasSignals ? 'TRENDING IN YOUR TASTE' : 'EXPLORE'} cursive={hasSignals ? 'loved' : 'discover'}>
          {trending.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
              {trending.map((f) => <FragranceCard key={f.id} fragrance={f} variant="compact" />)}
            </ScrollView>
          ) : (
            <View style={[styles.sectionEmpty, { marginRight: SPACING.lg }]}>
              <Text style={styles.sectionEmptyText}>More picks appear as your taste profile grows.</Text>
            </View>
          )}
        </Section>

        <View style={styles.footer}>
          <View style={styles.footerRule} />
          <Text style={styles.footerText}>
            Curated with intention. Tap any fragrance to explore notes, accords, and similar bottles.
          </Text>
          <View style={styles.footerRule} />
        </View>
      </ScrollView>
      <WhatToWearSheet visible={whatToWearOpen} onClose={() => setWhatToWearOpen(false)} />
    </SafeAreaView>
  );
}

function Section({ eyebrow, cursive, action, children }: { eyebrow: string; cursive?: string; action?: React.ReactNode; children: React.ReactNode }) {
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

// Long-form date for the editorial subtitle — written out so the lowercase
// italic serif treatment reads like a personal note, not a system label.
function longDate(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  container: { paddingBottom: SPACING.xxl * 1.5 },
  header: {
    paddingHorizontal: SPACING.md,
    paddingTop: 0,
    paddingBottom: SPACING.xs,
  },
  // Vogue masthead: cursive wordmark flanked by thin gold rules.
  mastheadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.sm,
    marginTop: SPACING.xs,
  },
  // Thin champagne rule — visually anchors the wordmark as a crest, not
  // a heading. Half-opacity so it whispers rather than shouts.
  mastheadRule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.accent,
    opacity: 0.55,
    maxWidth: 60,                    // never let the rules dominate the wordmark
  },
  wordmark: {
    fontFamily: 'PinyonScript_400Regular',
    fontSize: 56,
    color: COLORS.accent,
    lineHeight: 88,
    textAlign: 'center',
    flexShrink: 1,
  },
  // Editorial subtitle — italic serif, lowercase, soft taupe. Reads as a
  // personal note ("good morning — saturday, april 25") rather than a label.
  subtitle: {
    fontFamily: 'CormorantGaramond_400Regular_Italic',
    fontSize: 16,
    color: COLORS.muted,
    textAlign: 'center',
    marginTop: SPACING.sm,
    letterSpacing: 0.4,
  },
  subtitleDash: {
    color: COLORS.accent,
    fontStyle: 'normal',
  },
  streakRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'center', marginTop: 6,
  },
  streakText: { ...TYPE.label, fontSize: 12, color: COLORS.accent, letterSpacing: 0.5 },
  section: {
    paddingLeft: SPACING.lg,
    marginTop: SPACING.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
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
  hScroll: { paddingRight: SPACING.lg },
  heroWrap: { paddingRight: SPACING.lg },
  onboardingDismiss: { position: 'absolute', top: SPACING.md, right: SPACING.md },
  onboardingCard: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    padding: SPACING.lg,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
  },
  onboardingTitle: { fontFamily: FONTS.serif, fontSize: 20, fontWeight: '600', color: COLORS.text, marginBottom: SPACING.xs },
  onboardingBody: { ...TYPE.bodySmall, color: COLORS.muted, marginBottom: SPACING.md, lineHeight: 20 },
  onboardingActions: { flexDirection: 'row', gap: SPACING.sm },
  onboardingBtn: {
    flex: 1, paddingVertical: 12,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.full,
    alignItems: 'center',
  },
  onboardingBtnSecondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.accent },
  onboardingBtnText: { ...TYPE.label, color: COLORS.white, fontSize: 12, letterSpacing: 1 },
  onboardingBtnTextSecondary: { color: COLORS.accent },
  wearNudge: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.accent,
    overflow: 'hidden',
  },
  wearNudgeMain: {
    flex: 1,
    padding: SPACING.md,
    gap: 3,
  },
  wearNudgeNo: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.lg,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wearNudgeNoText: { ...TYPE.label, color: COLORS.muted, fontSize: 12, letterSpacing: 0.5 },
  wearNudgeLabel: { ...TYPE.eyebrow, color: COLORS.accent, fontSize: 10 },
  wearNudgeName: { fontFamily: FONTS.serif, fontSize: 18, fontWeight: '600', color: COLORS.text },
  wearNudgeHint: { ...TYPE.caption, color: COLORS.muted, fontStyle: 'italic' },
  sectionEmpty: {
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    gap: SPACING.sm,
  },
  sectionEmptyText: { ...TYPE.bodySmall, color: COLORS.muted, fontStyle: 'italic' },
  sectionEmptyBtn: { alignSelf: 'flex-start' },
  sectionEmptyBtnText: { ...TYPE.label, color: COLORS.accent, fontSize: 12, letterSpacing: 0.5 },
  heroReason: {
    ...TYPE.bodySmall,
    color: COLORS.muted,
    marginTop: SPACING.md,
    marginRight: SPACING.lg,
    fontStyle: 'italic',
    lineHeight: 21,
  },
  italic: { fontStyle: 'italic', color: COLORS.accent, fontWeight: '600' },
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
  sectionAction: { marginLeft: 'auto' },
  askBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentSoft,
  },
  askBtnText: { ...TYPE.label, fontSize: 11, color: COLORS.accent, letterSpacing: 0.5 },
});
