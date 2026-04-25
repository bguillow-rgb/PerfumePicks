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
          title: 'Today',
          tabBarIcon: ({ color, size }) => <TabIcon name="sparkles-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: 'Discover',
          tabBarIcon: ({ color, size }) => <TabIcon name="search-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="wardrobe"
        options={{
          title: 'Wardrobe',
          // "my" set in italic serif as a feminine flourish — mirrors the
          // StickPicks "myHumidor" treatment but feels editorial here.
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
              <Text style={{ fontStyle: 'italic' }}>my</Text>Wardrobe
            </Text>
          ),
          tabBarIcon: ({ color, size }) => <TabIcon name="rose-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="train"
        options={{
          title: 'Train',
          tabBarIcon: ({ color, size }) => <TabIcon name="heart-outline" color={color} size={size} />,
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
