import { Text, View, Image, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS } from '@/src/constants/theme';
import { useProfileStore } from '@/src/stores/useProfileStore';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, color, size }: { name: IoniconsName; color: string; size: number }) {
  return <Ionicons name={name} size={size} color={color} />;
}

/**
 * Profile tab icon — circular avatar with a champagne-gold ring.
 *
 * Active state thickens the ring (replaces the "tint color" feedback line
 * icons get for free). When the user uploads a photo, swap in the URI;
 * otherwise show a cursive monogram in champagne on soft blush.
 *
 * Sized at 26px so it carries the same visual weight as the surrounding
 * line icons — bigger and it looks like a sticker pasted onto the bar.
 */
function ProfileTabIcon({ focused }: { focused: boolean }) {
  // Read live from the persisted profile store so the avatar updates the
  // moment the user picks a new photo (or clears it back to monogram).
  const photoUri = useProfileStore((s) => s.photoUri);
  const monogram = useProfileStore((s) => s.getMonogram());
  const imageUri = photoUri;
  const size = 26;
  return (
    <View
      style={[
        profileIcon.ring,
        {
          width: size + 4,
          height: size + 4,
          borderRadius: (size + 4) / 2,
          borderWidth: focused ? 1.5 : 1,
          borderColor: focused ? COLORS.accent : COLORS.muted,
        },
      ]}
    >
      <View style={[profileIcon.disc, { width: size, height: size, borderRadius: size / 2 }]}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={{ width: '100%', height: '100%', borderRadius: size / 2 }} />
        ) : (
          <Text style={[profileIcon.monogram, { fontSize: size * 0.6, lineHeight: size * 0.95 }]}>
            {monogram}
          </Text>
        )}
      </View>
    </View>
  );
}

const profileIcon = StyleSheet.create({
  ring: { alignItems: 'center', justifyContent: 'center' },
  disc: {
    backgroundColor: COLORS.blushSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  monogram: {
    fontFamily: 'PinyonScript_400Regular',
    color: COLORS.accent,
    textAlign: 'center',
    lineHeight: undefined, // let React Native auto-size so ascenders don't clip
  },
});

/**
 * Train tab icon — the keystone engagement loop, so we elevate it as the
 * primary action: a larger, filled heart inside a champagne-gold disc that
 * sits slightly higher than the surrounding line icons. Pattern echoes
 * Instagram's center "+" or TikTok's center button — the eye lands here
 * first, which is exactly where we want users to lean in.
 */
function TrainTabIcon({ focused }: { focused: boolean }) {
  // 38px disc with a 22px heart inside — noticeably larger than the
  // surrounding ~22px line icons but small enough to live INSIDE the bar
  // (no lift / no overflow). Reads as the primary action without breaking
  // the bar's silhouette.
  const size = 38;
  return (
    <View
      style={[
        trainIcon.disc,
        { width: size, height: size, borderRadius: size / 2 },
        focused ? trainIcon.discActive : trainIcon.discInactive,
      ]}
    >
      <Ionicons
        name={focused ? 'heart' : 'heart-outline'}
        size={22}
        color={focused ? COLORS.white : COLORS.accent}
      />
    </View>
  );
}

const trainIcon = StyleSheet.create({
  disc: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  discInactive: {
    backgroundColor: COLORS.card,
    borderWidth: 1.25,
    borderColor: COLORS.accent,
  },
  discActive: {
    backgroundColor: COLORS.accent,
    borderWidth: 1.25,
    borderColor: COLORS.accent,
  },
});

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.accent,
        tabBarInactiveTintColor: COLORS.muted,
        tabBarStyle: {
          backgroundColor: COLORS.card,
          borderTopColor: COLORS.border,
          borderTopWidth: 0.5,
        },
        tabBarItemStyle: {
          flex: 1,
          paddingHorizontal: 0,
        },
        tabBarLabelStyle: {
          fontFamily: 'Cormorant',
          fontSize: 10,
          fontWeight: '600',
          includeFontPadding: false,
          textAlign: 'center',
        },
      }}
      screenListeners={{
        tabPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarTestID: 'tab-today',
          tabBarIcon: ({ color, size }) => <TabIcon name="sparkles-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: 'Discover',
          tabBarTestID: 'tab-discover',
          tabBarIcon: ({ color, size }) => <TabIcon name="search-outline" color={color} size={size} />,
        }}
      />
      {/* Train is the keystone engagement loop — elevated to the middle slot
          with a larger filled-heart icon to anchor the tray as the primary
          action. */}
      <Tabs.Screen
        name="train"
        options={{
          title: 'Train',
          tabBarTestID: 'tab-train',
          tabBarIcon: ({ focused }) => <TrainTabIcon focused={focused} />,
          // The 38px disc is taller than the line icons (≈22px) so the label
          // lands closer than the other tabs' rhythm. Push it down so the
          // gap between icon and label visually matches the rest of the bar.
          tabBarLabelStyle: {
            fontFamily: 'Cormorant',
            fontSize: 10,
            fontWeight: '600',
            includeFontPadding: false,
            textAlign: 'center',
            marginTop: 6,
          },
        }}
      />
      <Tabs.Screen
        name="wardrobe"
        options={{
          title: 'Wardrobe',
          tabBarTestID: 'tab-wardrobe',
          tabBarIcon: ({ color, size }) => <TabIcon name="rose-outline" color={color} size={size} />,
        }}
      />
      {/* Fragrance detail — lives inside tabs so the tab bar stays visible */}
      <Tabs.Screen
        name="fragrance/[id]"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'You',
          tabBarTestID: 'tab-profile',
          // Custom avatar icon (champagne ring + monogram or photo) instead
          // of a generic person line icon. Wire imageUri once the user can
          // upload one — currently falls back to a cursive monogram.
          tabBarIcon: ({ focused }) => <ProfileTabIcon focused={focused} />,
        }}
      />
    </Tabs>
  );
}
