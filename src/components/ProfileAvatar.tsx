import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '@/src/constants/theme';
import { useProfileStore } from '@/src/stores/useProfileStore';

/**
 * ProfileAvatar — top-right circular profile button.
 *
 * Drop into any screen header to give the user a one-tap entry into their
 * profile. Shows a user-uploaded image when available, falls back to an
 * elegant cursive monogram in champagne gold on a soft blush background.
 *
 * Feminine cues:
 *   - Soft blush background (COLORS.blushSoft)
 *   - 1px champagne-gold ring with a thin outer halo for jewelry-like depth
 *   - Cursive monogram instead of generic initials when no photo
 */
interface Props {
  /** Override the photo URI from the store (rarely needed). */
  imageUri?: string | null;
  /** Override the monogram from the store (rarely needed). */
  monogram?: string;
  /** Visible avatar diameter in px. Default 40. */
  size?: number;
}

export function ProfileAvatar({ imageUri, monogram, size = 40 }: Props) {
  const router = useRouter();
  // Pull from the persisted profile store so this avatar stays in sync with
  // every other avatar in the app the moment the photo or name changes.
  const storedPhoto = useProfileStore((s) => s.photoUri);
  const storedMonogram = useProfileStore((s) => s.getMonogram());
  const finalImage = imageUri !== undefined ? imageUri : storedPhoto;
  const finalMonogram = monogram ?? storedMonogram;

  return (
    <Pressable
      onPress={() => router.push('/profile')}
      hitSlop={10}
      style={({ pressed }) => [styles.touch, pressed && styles.pressed]}
    >
      <View style={[styles.haloRing, { width: size + 8, height: size + 8, borderRadius: (size + 8) / 2 }]}>
        <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
          {finalImage ? (
            <Image source={{ uri: finalImage }} style={[styles.image, { borderRadius: size / 2 }]} />
          ) : (
            <Text
              style={[
                styles.monogram,
                { fontSize: size * 0.55, lineHeight: size * 0.85 },
              ]}
            >
              {finalMonogram}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  touch: { alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.75 },
  // Outer ring — a translucent champagne halo for jewelry-like depth.
  haloRing: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(184,146,75,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(184,146,75,0.35)',
  },
  // Inner avatar disc — soft blush surface, gold border.
  avatar: {
    backgroundColor: COLORS.blushSoft,
    borderWidth: 1,
    borderColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  // Cursive monogram in champagne — feels personal, not generic.
  monogram: {
    fontFamily: 'PinyonScript_400Regular',
    color: COLORS.accent,
    textAlign: 'center',
  },
});
