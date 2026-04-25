import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Button } from '@/src/components/ui/Button';
import { useAgeGateStore } from '@/src/stores/useAgeGateStore';
import { COLORS, SPACING, FONTS } from '@/src/constants/theme';

export default function AgeGateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const confirmVerified = useAgeGateStore((s) => s.confirmVerified);
  const markBlocked = useAgeGateStore((s) => s.markBlocked);

  const handleYes = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await confirmVerified();
    router.replace('/auth/login');
  };

  const handleNo = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    // Session-only — does NOT persist. Relaunch restores to 'unknown'.
    markBlocked();
    router.replace('/age-gate/blocked');
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 80, paddingBottom: insets.bottom + 24 }]}>
      <Text style={styles.brand}>STICK PICKS</Text>
      <View style={styles.rule} />

      <View style={styles.body}>
        <Text style={styles.headline}>Are you 21 years of age{'\n'}or older?</Text>
        <Text style={styles.sub}>
          This app contains tobacco-related content intended for adults of legal smoking age in the United States.
        </Text>
      </View>

      <View style={styles.buttons}>
        <Button title="Yes, I am 21+" onPress={handleYes} />
        <Button title="No" variant="secondary" onPress={handleNo} />
      </View>

      <Text style={styles.legal}>
        By continuing, you confirm that you are of legal age to view tobacco-related content in your jurisdiction.
      </Text>
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
  },
  headline: {
    fontFamily: 'Cormorant',
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 34,
  },
  sub: {
    fontFamily: 'Cormorant',
    fontSize: 15,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.sm,
  },
  buttons: {
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  legal: {
    fontFamily: 'Cormorant',
    fontSize: 11,
    color: COLORS.subtle,
    textAlign: 'center',
    lineHeight: 16,
  },
});
