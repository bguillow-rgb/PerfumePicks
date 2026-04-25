import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAgeGateStore } from '@/src/stores/useAgeGateStore';
import { COLORS, SPACING, FONTS } from '@/src/constants/theme';

export default function AgeGateBlockedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const reset = useAgeGateStore((s) => s.reset);

  const handleGoBack = () => {
    reset();
    router.replace('/age-gate');
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 80, paddingBottom: insets.bottom + 24 }]}>
      <Text style={styles.brand}>STICK PICKS</Text>
      <View style={styles.rule} />

      <View style={styles.body}>
        <Ionicons name="lock-closed-outline" size={48} color={COLORS.muted} />
        <Text style={styles.headline}>Access Restricted</Text>
        <Text style={styles.sub}>
          You must be 21 years of age or older to use Stick Picks.
        </Text>
      </View>

      <Pressable onPress={handleGoBack} style={styles.goBackBtn} hitSlop={12}>
        <Text style={styles.goBackText}>Tapped this by mistake? Go back</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingHorizontal: SPACING.lg,
  },
  brand: {
    fontFamily: FONTS.display,
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.accent,
    textAlign: 'center',
    letterSpacing: 5,
  },
  rule: {
    width: 40,
    height: 2,
    backgroundColor: COLORS.accent,
    alignSelf: 'center',
    marginTop: 8,
    borderRadius: 1,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.md,
  },
  headline: {
    fontFamily: 'Cormorant',
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  sub: {
    fontFamily: 'Cormorant',
    fontSize: 15,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: SPACING.md,
  },
  goBackBtn: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  goBackText: {
    fontFamily: 'Cormorant',
    fontSize: 13,
    color: COLORS.accent,
    textDecorationLine: 'underline',
  },
});
