import { useEffect, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE } from '@/src/constants/theme';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { recomputeTasteProfile } from '@/src/lib/sync/useAppSync';
import { useTasteProfileStore } from '@/src/stores/useTasteProfileStore';
import { useOnboardingStore } from '@/src/stores/useOnboardingStore';
import { DnaProfileContent, SignalsBlock, type TasteSignals } from '@/src/components/dna/DnaProfileContent';

/**
 * My Taste Profile — the ONE canonical Fragrance DNA page.
 *
 * Renders the shared <DnaProfileContent>. `?celebrate=1` plays the reveal
 * variant (entrance + haptic + lean payoff); without it, the re-viewable
 * profile (DNA card + journey + signals). The onboarding reveal renders the SAME
 * component inline in /dna (the onboarding route guard pins it there), so this
 * page and that reveal can never drift apart.
 */
export default function TasteProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ celebrate?: string }>();
  const celebrate = params.celebrate === '1';
  const [data, setData] = useState<TasteSignals | null>(null);
  const [loading, setLoading] = useState(true);
  const dna = useTasteProfileStore((s) => s.dna);
  const hero = useTasteProfileStore((s) => s.celebrateHero);

  const handleRetake = () => {
    useOnboardingStore.getState().startRetake();
    useTasteProfileStore.getState().retake();
    router.push('/dna');
  };

  useEffect(() => {
    (async () => {
      const profile = await recomputeTasteProfile();
      setData(profile);
      setLoading(false);
    })();
  }, []);

  const hasSignals = !!data && data.signal_count > 0;

  if (loading) return null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']} testID="taste-profile-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={COLORS.text} />
        </Pressable>
        <Text style={styles.title}>My Taste Profile</Text>
        <View style={{ width: 26 }} />
      </View>

      {!dna && !hasSignals ? (
        <EmptyState
          icon="sparkles-outline"
          title="No taste data yet"
          subtitle="Swipe fragrances in Train My Nose or add to your wardrobe to build your profile."
          actionLabel="Train My Nose"
          onAction={() => router.push('/(tabs)/train')}
        />
      ) : dna ? (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <DnaProfileContent
            dna={dna}
            hero={hero}
            celebrate={celebrate}
            signals={data}
            onViewDetails={(id) => router.push(`/fragrance/${id}`)}
            onSeeMoreMatches={() => router.push('/dna/matches')}
            onRetake={handleRetake}
          />
          <View style={{ height: SPACING.xxl }} />
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <SignalsBlock signals={data!} />
          <View style={{ height: SPACING.xxl }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
  },
  title: { ...TYPE.heading, textAlign: 'center' },
  body: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md },
});
