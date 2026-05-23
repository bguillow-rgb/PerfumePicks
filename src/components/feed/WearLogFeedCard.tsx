import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, FONTS, RADIUS } from '@/src/constants/theme';
import { getFragranceFromStore } from '@/src/stores/useCatalogStore';
import type { SOTDEntry } from '@/src/features/feed/useSOTDFeed';

interface Props {
  entry: SOTDEntry;
}

/**
 * WearLogFeedCard — compact card for the SOTD community feed.
 * Tapping navigates to the fragrance detail page.
 */
export function WearLogFeedCard({ entry }: Props) {
  const router = useRouter();
  const fragrance = getFragranceFromStore(entry.fragrance_id);

  const fragName = fragrance?.name ?? entry.fragrance_name ?? 'Unknown fragrance';
  const fragBrand = fragrance?.brand ?? entry.fragrance_brand ?? '';

  return (
    <Pressable
      style={styles.card}
      onPress={() => router.push(`/fragrance/${entry.fragrance_id}` as any)}
    >
      <View style={styles.top}>
        <View style={styles.avatar}>
          <Text style={styles.avatarInitial}>
            {(entry.display_name ?? 'C')[0].toUpperCase()}
          </Text>
        </View>
        <View style={styles.meta}>
          <Text style={styles.name}>{entry.display_name ?? 'Community member'}</Text>
          <Text style={styles.date}>{prettyDate(entry.worn_on)}</Text>
        </View>
        {entry.rating != null && (
          <View style={styles.ratingRow}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Ionicons
                key={i}
                name={i < entry.rating! ? 'star' : 'star-outline'}
                size={11}
                color={COLORS.accent}
              />
            ))}
          </View>
        )}
      </View>

      <View style={styles.fragRow}>
        <Text style={styles.fragName}>{fragName}</Text>
        {fragBrand ? <Text style={styles.fragBrand}>· {fragBrand}</Text> : null}
      </View>

      {(entry.occasion || entry.weather) && (
        <View style={styles.tagRow}>
          {entry.occasion && (
            <View style={styles.tag}>
              <Text style={styles.tagText}>{entry.occasion}</Text>
            </View>
          )}
          {entry.weather && (
            <View style={styles.tag}>
              <Text style={styles.tagText}>{entry.weather}</Text>
            </View>
          )}
        </View>
      )}

      {entry.note ? (
        <Text style={styles.note} numberOfLines={2}>{entry.note}</Text>
      ) : null}
    </Pressable>
  );
}

function prettyDate(iso: string): string {
  const today = new Date().toLocaleDateString('en-CA');
  if (iso === today) return 'today';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  avatar: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: COLORS.blushSoft,
    borderWidth: 1, borderColor: COLORS.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { fontFamily: 'PinyonScript_400Regular', fontSize: 20, color: COLORS.accent, lineHeight: 26 },
  meta: { flex: 1 },
  name: { ...TYPE.body, fontWeight: '600', fontSize: 14 },
  date: { ...TYPE.caption, color: COLORS.muted },
  ratingRow: { flexDirection: 'row', gap: 1 },
  fragRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' },
  fragName: { fontFamily: FONTS.serif, fontSize: 18, fontWeight: '600', color: COLORS.text },
  fragBrand: { ...TYPE.bodySmall, color: COLORS.muted },
  tagRow: { flexDirection: 'row', gap: 6 },
  tag: {
    paddingHorizontal: 10, paddingVertical: 3,
    backgroundColor: COLORS.card2,
    borderRadius: RADIUS.full,
    borderWidth: 1, borderColor: COLORS.border,
  },
  tagText: { ...TYPE.caption, textTransform: 'capitalize' },
  note: { ...TYPE.bodySmall, color: COLORS.muted, fontStyle: 'italic', lineHeight: 20 },
});
