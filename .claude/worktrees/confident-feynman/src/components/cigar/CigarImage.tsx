import { View, Text, Image, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, FONTS, SPACING } from '@/src/constants/theme';
import type { Cigar } from '@/src/types/cigar';
import type { ImageStyle, StyleProp } from 'react-native';

// Display-layer wrapper for every cigar image in the app. Centralizes the
// moderation rules so each call site doesn't re-implement them:
//   - image_status !== 'live' → render placeholder regardless of image_url
//   - image_url null/empty   → render placeholder
// On the detail page we also pass showAddAction to expose a "Add a photo"
// affordance when the image is missing; everywhere else it's display-only.

interface CigarImageProps {
  cigar: Pick<Cigar, 'image_url' | 'image_status' | 'brand' | 'line' | 'name'> | null | undefined;
  style?: StyleProp<ImageStyle>;
  resizeMode?: 'cover' | 'contain' | 'center';
  showAddAction?: boolean;
  onAddPress?: () => void;
  uploading?: boolean;
}

function hasLiveImage(
  cigar: CigarImageProps['cigar']
): cigar is { image_url: string; image_status: 'live'; brand: string; line: string; name: string } {
  if (!cigar) return false;
  if (!cigar.image_url) return false;
  // Defensive: older rows without the column present should still display.
  if (cigar.image_status && cigar.image_status !== 'live') return false;
  return true;
}

export function CigarImage({
  cigar,
  style,
  resizeMode = 'cover',
  showAddAction = false,
  onAddPress,
  uploading = false,
}: CigarImageProps) {
  if (hasLiveImage(cigar)) {
    return <Image source={{ uri: cigar.image_url }} style={style} resizeMode={resizeMode} />;
  }

  return (
    <View style={[styles.placeholder, style]}>
      <Ionicons name="image-outline" size={28} color={COLORS.muted} />
      <Text style={styles.placeholderLabel} numberOfLines={2}>
        No image available
      </Text>
      {showAddAction && (
        <Pressable onPress={onAddPress} disabled={uploading} style={styles.addBtn} hitSlop={6}>
          {uploading ? (
            <ActivityIndicator size="small" color={COLORS.accent} />
          ) : (
            <>
              <Ionicons name="add" size={14} color={COLORS.accent} />
              <Text style={styles.addText}>Add a photo</Text>
            </>
          )}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
  },
  placeholderLabel: {
    fontFamily: FONTS.body,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.muted,
    textAlign: 'center',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  addText: {
    fontFamily: FONTS.body,
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.accent,
  },
});
