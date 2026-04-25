// Stack layout for admin surfaces. Header visible so users always
// have a way back out. Screen-level AdminOnly gating happens inside
// each screen, not here, so a deep-linked route enforces gating
// whether or not this layout loads first.
//
// The admin home (`index`) gets an X close button in the header that
// dismisses the whole admin stack back to the Profile tab. Sub-screens
// rely on Stack's default back button (left side) plus the persistent
// tab bar below; they don't need their own X.

import { Pressable } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING } from '@/src/constants/theme';

export default function AdminLayout() {
  const router = useRouter();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.bg },
        headerTintColor: COLORS.text,
        headerTitleStyle: { fontFamily: 'Cormorant', fontWeight: '800' },
        contentStyle: { backgroundColor: COLORS.bg },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Admin',
          headerRight: () => (
            <Pressable
              onPress={() => router.replace('/(tabs)/profile')}
              hitSlop={12}
              style={{ paddingHorizontal: SPACING.xs }}
              accessibilityLabel="Close admin"
            >
              <Ionicons name="close" size={24} color={COLORS.muted} />
            </Pressable>
          ),
        }}
      />
      <Stack.Screen name="add-cigar" options={{ title: 'Add Cigar' }} />
      <Stack.Screen name="submissions" options={{ title: 'Review Submissions' }} />
      <Stack.Screen name="edit-cigar" options={{ title: 'Edit Cigars' }} />
      <Stack.Screen name="edit-cigar/[id]" options={{ title: 'Edit Cigar' }} />
      <Stack.Screen name="dashboard" options={{ title: 'Dashboard' }} />
      <Stack.Screen name="invites" options={{ title: 'Admin Invites' }} />
    </Stack>
  );
}
