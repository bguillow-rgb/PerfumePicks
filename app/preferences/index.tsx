import { ScrollView, View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, FONTS, RADIUS } from '@/src/constants/theme';
import { AVOID_GROUPS } from '@/src/constants/accords';
import { GENDER_PREF_OPTIONS, type GenderPref } from '@/src/lib/genderFilter';
import { useCatalogStore } from '@/src/stores/useCatalogStore';
import { track, EVENTS } from '@/src/lib/observability';
import {
  useScentPreferencesStore,
  type PrefOccasion,
  type PrefSeason,
} from '@/src/stores/useScentPreferencesStore';

/**
 * Scent Preferences — the user's stated constraints, the third taste layer
 * beside Fragrance DNA (identity) and Train Your Nose (learned taste). Every
 * choice writes straight to the persisted store and is read by the rec engine
 * (useRecommendations) on the next render — no explicit save step.
 */

const BUDGET_TIERS: { tier: number | null; label: string }[] = [
  { tier: 1, label: '$' },
  { tier: 2, label: '$$' },
  { tier: 3, label: '$$$' },
  { tier: 4, label: '$$$$' },
  { tier: 5, label: '$$$$$' },
  { tier: null, label: 'No limit' },
];

const OCCASIONS: { value: PrefOccasion | null; label: string }[] = [
  { value: 'casual', label: 'Everyday' },
  { value: 'office', label: 'Office' },
  { value: 'date', label: 'Date' },
  { value: 'evening', label: 'Evening' },
  { value: 'formal', label: 'Formal' },
  { value: 'workout', label: 'Active' },
  { value: 'travel', label: 'Travel' },
  { value: null, label: 'No preference' },
];

const SEASONS: { value: PrefSeason | null; label: string }[] = [
  { value: 'spring', label: 'Spring' },
  { value: 'summer', label: 'Summer' },
  { value: 'fall', label: 'Fall' },
  { value: 'winter', label: 'Winter' },
  { value: null, label: 'All year' },
];

function Chip({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      style={[styles.chip, active && styles.chipOn]}
      testID={testID}
    >
      <Text style={[styles.chipText, active && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

export default function ScentPreferences() {
  const router = useRouter();
  const avoid = useScentPreferencesStore((s) => s.avoid);
  const budget = useScentPreferencesStore((s) => s.budget);
  const occasion = useScentPreferencesStore((s) => s.occasion);
  const season = useScentPreferencesStore((s) => s.season);
  const toggleAvoid = useScentPreferencesStore((s) => s.toggleAvoid);
  const setBudget = useScentPreferencesStore((s) => s.setBudget);
  const setOccasion = useScentPreferencesStore((s) => s.setOccasion);
  const setSeason = useScentPreferencesStore((s) => s.setSeason);
  const genderPref = useScentPreferencesStore((s) => s.genderPref);
  const setGenderPref = useScentPreferencesStore((s) => s.setGenderPref);

  /**
   * Audience is the one setting on this screen that FILTERS rather than ranks,
   * so it can't just sit in the store and wait to be read on the next score
   * pass — everything already fetched under the old filter is now wrong. Drop
   * the catalog cache so the next read goes back to Supabase.
   */
  const chooseAudience = (pref: GenderPref) => {
    if (pref === genderPref) return; // no-op tap: don't churn the cache
    track(EVENTS.AUDIENCE_CHANGED, { pref, from: genderPref });
    setGenderPref(pref);
    useCatalogStore.getState().clearCache();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']} testID="preferences-screen">
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityLabel="Back"
          testID="preferences-back"
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </Pressable>
        <Text style={styles.eyebrow}>SCENT PREFERENCES</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.cursive}>your rules</Text>
        <Text style={styles.title}>Set your boundaries</Text>
        <Text style={styles.sub}>
          These sit on top of your Fragrance DNA. Hard limits we'll respect every
          time we pick something for you.
        </Text>

        {/* ── Audience ───────────────────────────────────────────────────── */}
        {/* First, because it's the only setting here that HIDES bottles — the
            rest just re-rank them. Someone who can't find a fragrance they
            know exists should hit this control before anything else. */}
        <Text style={styles.sectionLabel}>SHOW ME</Text>
        <Text style={styles.sectionHint}>
          Which side of the shelf we pick from. Unisex bottles appear either way.
        </Text>
        <View style={styles.chipWrap}>
          {GENDER_PREF_OPTIONS.map((o) => (
            <Chip
              key={o.value}
              label={o.label}
              active={genderPref === o.value}
              onPress={() => chooseAudience(o.value)}
              testID={`pref-audience-${o.value}`}
            />
          ))}
        </View>

        {/* ── Budget ─────────────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>BUDGET</Text>
        <Text style={styles.sectionHint}>The most you'd spend on a bottle.</Text>
        <View style={styles.chipWrap}>
          {BUDGET_TIERS.map((b) => (
            <Chip
              key={b.label}
              label={b.label}
              active={budget === b.tier}
              onPress={() => setBudget(b.tier)}
              testID={`pref-budget-${b.tier ?? 'none'}`}
            />
          ))}
        </View>

        {/* ── Avoid ──────────────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>AVOID</Text>
        <Text style={styles.sectionHint}>
          Notes you never want. We'll steer clear. Pick as many as you like.
        </Text>
        <View style={styles.chipWrap}>
          {AVOID_GROUPS.map((g) => (
            <Chip
              key={g.id}
              label={g.label}
              active={avoid.includes(g.id)}
              onPress={() => toggleAvoid(g.id)}
              testID={`pref-avoid-${g.id}`}
            />
          ))}
        </View>

        {/* ── Occasion ───────────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>OCCASION</Text>
        <Text style={styles.sectionHint}>What you mostly wear fragrance for.</Text>
        <View style={styles.chipWrap}>
          {OCCASIONS.map((o) => (
            <Chip
              key={o.label}
              label={o.label}
              active={occasion === o.value}
              onPress={() => setOccasion(o.value)}
              testID={`pref-occasion-${o.value ?? 'none'}`}
            />
          ))}
        </View>

        {/* ── Season ─────────────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>SEASON</Text>
        <Text style={styles.sectionHint}>Bias picks toward a time of year.</Text>
        <View style={styles.chipWrap}>
          {SEASONS.map((s) => (
            <Chip
              key={s.label}
              label={s.label}
              active={season === s.value}
              onPress={() => setSeason(s.value)}
              testID={`pref-season-${s.value ?? 'none'}`}
            />
          ))}
        </View>

        <Pressable
          style={styles.doneBtn}
          onPress={() => router.back()}
          testID="preferences-done"
        >
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  backBtn: { padding: 4 },
  eyebrow: { ...TYPE.eyebrow },
  body: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl },
  cursive: {
    fontFamily: 'PinyonScript_400Regular',
    fontSize: 36,
    color: COLORS.accent,
    lineHeight: 52,
    paddingLeft: 6,
  },
  title: {
    fontFamily: FONTS.serif,
    fontSize: 28,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 2,
  },
  sub: { ...TYPE.bodySmall, color: COLORS.muted, marginTop: SPACING.sm, lineHeight: 21 },
  sectionLabel: { ...TYPE.eyebrow, color: COLORS.text, marginTop: SPACING.xl },
  sectionHint: { ...TYPE.bodySmall, color: COLORS.muted, marginTop: 4 },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 9,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  chipOn: { borderColor: COLORS.accent, backgroundColor: COLORS.blushSoft },
  chipText: { ...TYPE.label, fontWeight: '500', color: COLORS.muted },
  chipTextOn: { color: COLORS.burgundy ?? COLORS.accent, fontWeight: '600' },
  doneBtn: {
    backgroundColor: COLORS.accent,
    paddingVertical: 16,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    marginTop: SPACING.xxl,
  },
  doneText: { ...TYPE.label, color: COLORS.white, letterSpacing: 2 },
});
