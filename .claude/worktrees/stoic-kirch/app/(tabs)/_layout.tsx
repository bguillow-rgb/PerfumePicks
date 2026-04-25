import { Text } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS } from '@/src/constants/theme';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, color, size }: { name: IoniconsName; color: string; size: number }) {
  return <Ionicons name={name} size={size} color={color} />;
}

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
        // Each tab gets exactly 1/N of the width → perfectly even spacing.
        tabBarItemStyle: {
          flex: 1,
          paddingHorizontal: 0,
        },
        tabBarLabelStyle: {
          fontFamily: 'Cormorant',
          fontSize: 11,
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
          title: 'Home',
          tabBarIcon: ({ color, size }) => <TabIcon name="home-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="browse"
        options={{
          title: 'Browse',
          tabBarIcon: ({ color, size }) => <TabIcon name="search-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="humidor"
        options={{
          title: 'myHumidor',
          // Match the default tab label metrics exactly: single text node, same
          // fontSize/lineHeight as tabBarLabelStyle. Italic "my" via nested Text.
          tabBarLabel: ({ color }) => (
            <Text
              numberOfLines={1}
              style={{
                fontFamily: 'Cormorant',
                fontSize: 11,
                lineHeight: 14,
                fontWeight: '600',
                textAlign: 'center',
                includeFontPadding: false,
                color,
              }}
            >
              <Text style={{ fontStyle: 'italic' }}>my</Text>Humidor
            </Text>
          ),
          tabBarIcon: ({ color, size }) => <TabIcon name="archive-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="journal"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="cigar/[id]"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <TabIcon name="person-outline" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
