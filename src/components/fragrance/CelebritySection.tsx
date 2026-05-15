import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, RADIUS, FONTS } from '@/src/constants/theme';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

interface Celebrity {
  celebrity_name: string;
  category: string | null;
  image_url: string | null;
}

interface Props {
  fragranceId: string;
}

const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  actor: 'film-outline',
  musician: 'musical-notes-outline',
  model: 'sparkles-outline',
  royal: 'diamond-outline',
  athlete: 'fitness-outline',
  influencer: 'phone-portrait-outline',
  designer: 'color-palette-outline',
  fashion: 'shirt-outline',
  brand_founder: 'rose-outline',
};

/**
 * "Who Wears This" section on fragrance detail.
 * Horizontal row of celebrity chips — compact, editorial.
 * Only renders when fragrance_celebrities has verified rows.
 */
export function CelebritySection({ fragranceId }: Props) {
  const [celebrities, setCelebrities] = useState<Celebrity[]>([]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase
      .from('fragrance_celebrities')
      .select('celebrity_name, category, image_url')
      .eq('fragrance_id', fragranceId)
      .eq('verified', true)
      .order('celebrity_name')
      .then(({ data }) => { if (data) setCelebrities(data); });
  }, [fragranceId]);

  if (celebrities.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {celebrities.map((c) => (
          <View key={c.celebrity_name} style={styles.chip}>
            <View style={styles.avatar}>
              {c.image_url ? (
                <View style={styles.avatarImage} />
              ) : (
                <Ionicons
                  name={CATEGORY_ICONS[c.category ?? ''] ?? 'person-outline'}
                  size={16}
                  color={COLORS.accent}
                />
              )}
            </View>
            <View style={styles.chipContent}>
              <Text style={styles.chipName} numberOfLines={1}>{c.celebrity_name}</Text>
              {c.category && (
                <Text style={styles.chipCategory}>{c.category}</Text>
              )}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: SPACING.sm },
  scroll: { gap: SPACING.sm, paddingRight: SPACING.lg },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 8,
    paddingHorizontal: 12,
    paddingRight: 16,
  },
  avatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: COLORS.blushSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarImage: { width: '100%', height: '100%', borderRadius: 16 },
  chipContent: { gap: 1 },
  chipName: { ...TYPE.label, fontSize: 12, color: COLORS.text },
  chipCategory: { ...TYPE.caption, fontSize: 9, textTransform: 'capitalize' },
});
