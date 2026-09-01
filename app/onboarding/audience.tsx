import { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING, TYPE, FONTS, RADIUS } from '@/src/constants/theme';
import { GENDER_PREF_OPTIONS, type GenderPref } from '@/src/lib/genderFilter';
import { useScentPreferencesStore } from '@/src/stores/useScentPreferencesStore';
import { track, EVENTS } from '@/src/lib/observability';

/**
 * Audience question — the first screen of first run, ahead of the DNA picker.
 *
 * WHY IT COMES FIRST: everything after it is a catalogue view. The DNA picker
 * grid is the very next screen, and picking 12 tiles out of a pool that is
 * mostly the wrong half of the shelf poisons the taste profile that the whole
 * app is then built on. Asking here costs one tap and fixes the pool before it
 * is ever drawn.
 *
 * WHY THERE IS NO SKIP: there isn't a wrong answer — "Everything" IS the
 * default and a legitimate choice (a quarter of our engaged users wear both
 * sides, see the note in lib/genderFilter). A skip button would just be a
 * third way to say "everything" while leaving audienceChosen false, which
 * would re-prompt them on the next cold start.
 *
 * WHY EXISTING USERS NEVER SEE THIS: the route guard in app/_layout.tsx only
 * sends people here who have not completed onboarding. Someone who has been
 * using the app for months has already told us what they like by using it;
 * interrupting them with a setup question would read as a bug. They get the
 * same control in Settings instead.
 */
export default function AudienceScreen() {
  const router = useRouter();

  useEffect(() => {
    track(EVENTS.AUDIENCE_PROMPT_SHOWN);
  }, []);

  const choose = (pref: GenderPref) => {
    Haptics.selectionAsync();
    // setGenderPref also flips audienceChosen, which is what releases the
    // route guard below us — so this single call is the whole hand-off.
    useScentPreferencesStore.getState().setGenderPref(pref);
    track(EVENTS.AUDIENCE_SELECTED, { pref });
    router.replace('/dna');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']} testID="audience-screen">
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.eyebrow}>FIRST, THE SHELF</Text>
        <Text style={styles.cursive}>your side</Text>
        <Text style={styles.title}>What should we show you?</Text>
        <Text style={styles.sub}>
          So your picks come from the right half of the shelf. Unisex bottles
          show up either way — most of the good ones are.
        </Text>

        <View style={styles.options}>
          {GENDER_PREF_OPTIONS.map((o) => (
            <Pressable
              key={o.value}
              testID={`audience-opt-${o.value}`}
              accessibilityRole="button"
              accessibilityLabel={`${o.label}. ${o.detail}`}
              style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
              onPress={() => choose(o.value)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.optionLabel}>{o.label}</Text>
                <Text style={styles.optionDesc}>{o.detail}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
            </Pressable>
          ))}
        </View>

        <Text style={styles.foot}>You can change this anytime in Settings.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  body: {
    flexGrow: 1,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.xl,
  },
  eyebrow: { ...TYPE.eyebrow },
  cursive: {
    fontFamily: 'PinyonScript_400Regular',
    fontSize: 32,
    color: COLORS.accent,
    lineHeight: 50,
    marginTop: 4,
    paddingLeft: 8,
  },
  title: {
    fontFamily: FONTS.serif,
    fontSize: 32,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: SPACING.sm,
    lineHeight: 38,
  },
  sub: {
    ...TYPE.bodySmall,
    color: COLORS.muted,
    marginTop: SPACING.sm,
    lineHeight: 21,
  },
  // Cards are deliberately taller than the Settings chips: this is a one-tap
  // decision screen, not a dense preferences list.
  options: { gap: SPACING.sm, marginTop: SPACING.xl },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.lg,
    gap: SPACING.md,
  },
  optionPressed: { borderColor: COLORS.accent, backgroundColor: COLORS.blushSoft },
  optionLabel: { fontFamily: FONTS.serif, fontSize: 22, fontWeight: '600', color: COLORS.text },
  optionDesc: { ...TYPE.bodySmall, marginTop: 3, fontStyle: 'italic' },
  foot: {
    ...TYPE.caption,
    color: COLORS.subtle,
    textAlign: 'center',
    marginTop: 'auto',
    paddingTop: SPACING.xl,
  },
});
