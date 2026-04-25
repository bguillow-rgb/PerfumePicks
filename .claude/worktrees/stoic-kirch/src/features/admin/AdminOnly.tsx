// Wrapper component for admin-only screens. Enforces gating at the
// UI layer (defense in depth on top of RLS). Wrap any admin screen's
// top-level return in <AdminOnly>...</AdminOnly>.
//
// Non-admins landing on an admin route (via deep link, stale session,
// etc.) see a "Not authorized" placeholder and are redirected to the
// Profile tab on next tick.

import { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS, SPACING } from '@/src/constants/theme';
import { useIsAdmin } from './useIsAdmin';

export function AdminOnly({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading } = useIsAdmin();
  const router = useRouter();

  useEffect(() => {
    // Redirect non-admins off admin surfaces. Delayed to next tick so
    // router is mounted before we try to navigate.
    if (!loading && !isAdmin) {
      router.replace('/(tabs)/profile');
    }
  }, [loading, isAdmin, router]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  if (!isAdmin) {
    // Brief flash while the redirect fires. Show something non-blank
    // so there's no "did the button do anything?" confusion.
    return (
      <View style={styles.center}>
        <Text style={styles.notAuth}>Not authorized</Text>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bg,
    padding: SPACING.lg,
  },
  notAuth: {
    fontFamily: 'Cormorant',
    color: COLORS.muted,
    fontSize: 16,
  },
});
