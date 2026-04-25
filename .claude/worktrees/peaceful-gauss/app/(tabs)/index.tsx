import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { Alert } from '@/src/components/ui/StyledAlert';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS } from '@/src/constants/theme';
import { useProStore } from '@/src/stores/useProStore';
import { useUserAvatar } from '@/src/hooks/useUserAvatar';
import { useScanCount } from '@/src/hooks/useScanCount';

// Home uses zero photographic imagery so the first frame shown on cold start
// can never violate Apple 1.4.3 ("promotes tobacco use"). Feature cards use
// themed gradients + line icons instead of the original Unsplash cigar photos.

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isPro = useProStore((s) => s.isPro);
  const hasHydrated = useProStore((s) => s.hasHydrated);
  // Treat as Pro until hydration completes — avoids Pro users seeing "· Pro" / scan-limit
  // copy flash on every cold start while AsyncStorage rehydrates.
  const treatAsPro = !hasHydrated || isPro;
  const avatarUrl = useUserAvatar();
  const { remaining, limitReached } = useScanCount();

  function handleScan() {
    if (!treatAsPro && limitReached) {
      Alert.alert(
        'Scan Limit Reached',
        'Free accounts include 5 scans. Upgrade to Pro for unlimited scanning.',
        [
          { text: 'Not Now', style: 'cancel' },
          { text: 'Upgrade', onPress: () => router.push('/paywall') },
        ]
      );
      return;
    }
    router.push('/identify/camera');
  }

  function handleAdvancedQuiz() {
    if (treatAsPro) {
      router.push('/quiz?mode=advanced');
    } else {
      router.push('/paywall');
    }
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + SPACING.sm }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>STICK PICKS</Text>
          <View style={styles.brandRule} />
        </View>
        <Pressable onPress={() => router.push('/(tabs)/profile')} hitSlop={12}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarCircle}>
              <Ionicons name="person-outline" size={18} color={COLORS.accent} />
            </View>
          )}
        </Pressable>
      </View>

      {/* Welcome copy — collection-building framing that doesn't use smoking
          as a verb. Apple's App Review Guideline 1.4.3 flags copy that
          encourages tobacco consumption; humidor-additions framing is safer. */}
      <Text style={styles.welcome}>Let's add to your humidor today!</Text>

      {/* CTA Cards */}
      <View style={styles.cards}>
        {/* Quick Quiz (Free) */}
        <Pressable
          onPress={() => router.push('/quiz')}
          style={({ pressed }) => [styles.ctaCard, pressed && styles.pressed]}
        >
          <LinearGradient
            colors={['#1A3324', '#0D3B13', '#061610']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.ctaGradientFull}
          >
            <View style={styles.ctaIconWrap}>
              <Ionicons name="sparkles-outline" size={28} color={COLORS.accent} />
            </View>
            <View style={styles.ctaTextBlock}>
              <View style={styles.ctaLabelRow}>
                <View style={styles.ctaDot} />
                <Text style={styles.ctaLabel}>QUICK MATCH</Text>
              </View>
              <Text style={styles.ctaTitle}>Find Your Stick</Text>
              <Text style={styles.ctaSubtitle}>
                3 questions — we'll match your palate to the perfect cigar
              </Text>
            </View>
          </LinearGradient>
        </Pressable>

        {/* Advanced Quiz (Pro) */}
        <Pressable
          onPress={handleAdvancedQuiz}
          style={({ pressed }) => [styles.ctaCardSmall, pressed && styles.pressed]}
        >
          <Ionicons name="flask-outline" size={20} color={COLORS.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.ctaSmallTitle}>Advanced Quiz{!treatAsPro ? ' · Pro' : ''}</Text>
            <Text style={styles.ctaSmallSub}>9 questions for precision picks</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={COLORS.muted} />
        </Pressable>

        {/* Scan a Stick */}
        <Pressable
          onPress={handleScan}
          style={({ pressed }) => [styles.ctaCard, pressed && styles.pressed]}
        >
          <LinearGradient
            colors={['#264D35', '#12261A', '#061610']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.ctaGradientFull}
          >
            <View style={styles.ctaIconWrap}>
              <Ionicons name="scan-outline" size={28} color={COLORS.accent} />
            </View>
            <View style={styles.ctaTextBlock}>
              <View style={styles.ctaLabelRow}>
                <View style={styles.ctaDot} />
                <Text style={styles.ctaLabel}>IDENTIFICATION</Text>
              </View>
              <Text style={styles.ctaTitle}>Scan a Stick</Text>
              <Text style={styles.ctaSubtitle}>
                {!treatAsPro && remaining !== null
                  ? `${remaining} free scan${remaining !== 1 ? 's' : ''} remaining`
                  : 'Point your camera at any cigar band — AI does the rest'}
              </Text>
            </View>
          </LinearGradient>
        </Pressable>
      </View>

      {/* Bottom tagline — evergreen copy instead of a catalog size number.
          Showing "2,089 cigars" reads small next to competitors like Cigar
          Scanner (~13k) and plants a stale-catalog impression before the
          user has even tried the app. */}
      <Text style={styles.footer}>Premium handmade cigars, curated weekly.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingHorizontal: SPACING.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  brand: {
    fontFamily: FONTS.display,
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.accent,
    letterSpacing: 4,
  },
  brandRule: {
    width: 32,
    height: 2,
    backgroundColor: COLORS.accent,
    marginTop: 4,
    borderRadius: 1,
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: COLORS.accent,
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.card,
  },
  welcome: {
    fontFamily: FONTS.display,
    fontSize: 26,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.lg,
    lineHeight: 34,
  },
  cards: {
    flex: 1,
    gap: SPACING.md,
  },
  ctaCard: {
    flex: 1,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  // Full-bleed themed gradient that replaces the Unsplash-backed ImageBackground.
  // Keeps the "two hero cards" layout but uses zero photography.
  ctaGradientFull: {
    flex: 1,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  ctaIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(212,175,55,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaTextBlock: {
    flex: 1,
  },
  ctaLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  ctaDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.accent,
  },
  ctaLabel: {
    fontFamily: 'Cormorant',
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.accent,
    letterSpacing: 2,
  },
  ctaTitle: {
    fontFamily: FONTS.display,
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 4,
  },
  ctaSubtitle: {
    fontFamily: 'Cormorant',
    fontSize: 13,
    color: COLORS.muted,
    lineHeight: 18,
  },
  ctaCardSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
  },
  ctaSmallTitle: {
    fontFamily: 'Cormorant',
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  ctaSmallSub: {
    fontFamily: 'Cormorant',
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 2,
  },
  footer: {
    fontFamily: 'Cormorant',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.subtle,
    letterSpacing: 2,
    textTransform: 'uppercase',
    paddingVertical: SPACING.md,
  },
});
