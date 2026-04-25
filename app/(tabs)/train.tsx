import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, FONTS, RADIUS } from '@/src/constants/theme';

/**
 * Train tab — "Train My Nose" swipe screen.
 *
 * The keystone engagement loop. Each swipe-right increments the user's
 * `liked_notes` and `preferred_accords` weights; swipe-left penalizes them.
 * Free: 10 swipes/day. Pro: unlimited.
 *
 * Implementation will use react-native-deck-swiper (already in package.json).
 * STUB until catalog is seeded — renders the intro/onboarding screen.
 */
export default function TrainScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.container}>
        <View style={styles.iconCircle}>
          <Ionicons name="sparkles" size={36} color={COLORS.accent} />
        </View>
        <Text style={styles.eyebrow}>TRAIN MY NOSE</Text>
        <Text style={styles.headline}>
          Teach us what you <Text style={styles.italic}>love</Text>.
        </Text>
        <Text style={styles.body}>
          Swipe right on fragrances that intrigue you, left on those that don't.
          Every swipe sharpens your taste profile and improves your daily picks.
        </Text>
        <Pressable style={styles.cta}>
          <Text style={styles.ctaText}>Begin a Session</Text>
        </Pressable>
        <Text style={styles.footnote}>10 free swipes/day · Unlimited with Pro</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  eyebrow: { ...TYPE.eyebrow, marginBottom: SPACING.md },
  headline: {
    fontFamily: FONTS.serif,
    fontSize: 30,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.md,
    lineHeight: 38,
  },
  italic: { fontStyle: 'italic', color: COLORS.accent },
  body: {
    ...TYPE.body,
    textAlign: 'center',
    color: COLORS.muted,
    marginBottom: SPACING.xl,
    paddingHorizontal: SPACING.md,
  },
  cta: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.xxl,
    paddingVertical: 16,
    borderRadius: RADIUS.full,
    marginBottom: SPACING.md,
  },
  ctaText: { ...TYPE.label, color: COLORS.white, letterSpacing: 2 },
  footnote: { ...TYPE.caption },
});
