import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, RADIUS, FONTS } from '@/src/constants/theme';
import { useTasteProfileStore } from '@/src/stores/useTasteProfileStore';
import { ARCHETYPE_COPY } from '@/src/features/dna/revealCopy';
import { LivingArchetypeReadout } from '@/src/components/dna/LivingArchetypeReadout';

/**
 * My Fragrance DNA — the re-viewable home of the derived DNA on the You tab.
 *
 * M4 surface: renders the archetype the user landed on, proving the DNA is
 * durable across relaunch. Renders nothing until the store rehydrates AND a DNA
 * exists, so it never flashes for users who haven't completed the front door.
 * (M5 deepens this into the full archetype + View/Retake home.)
 */
export function MyDnaCard() {
  const router = useRouter();
  const hasHydrated = useTasteProfileStore((s) => s.hasHydrated);
  const dna = useTasteProfileStore((s) => s.dna);

  if (!hasHydrated || !dna) return null;

  const copy = ARCHETYPE_COPY[dna.archetype.primary];

  return (
    <Pressable
      style={styles.card}
      onPress={() => router.push('/taste-profile')}
      testID="my-dna-card"
      accessibilityLabel="My Fragrance DNA"
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.eyebrow}>MY FRAGRANCE DNA</Text>
        <Text style={styles.archetype} testID="my-dna-archetype">{copy.name}</Text>
        <Text style={styles.identity} numberOfLines={2}>{copy.identity}</Text>
        <LivingArchetypeReadout dna={dna} variant="compact" />
      </View>
      <Ionicons name="chevron-forward" size={20} color={COLORS.accent} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    padding: SPACING.lg,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  eyebrow: { ...TYPE.eyebrow, color: COLORS.accent },
  archetype: {
    fontFamily: FONTS.serif,
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 4,
  },
  identity: { ...TYPE.bodySmall, color: COLORS.muted, marginTop: 4, lineHeight: 18 },
});
