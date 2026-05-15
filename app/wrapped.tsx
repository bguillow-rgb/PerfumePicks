import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, RADIUS, FONTS } from '@/src/constants/theme';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useProStore } from '@/src/stores/useProStore';

/**
 * Perfume Wrapped — year-in-review stats.
 * Pro-gated. Queries get_year_in_review RPC.
 * Empty state for users with < 10 wears or before December 1.
 */
export default function WrappedScreen() {
  const router = useRouter();
  const isPro = useProStore((s) => s.isPro);
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);

  const currentYear = new Date().getFullYear();

  useEffect(() => {
    if (!isSupabaseConfigured || !isPro) { setLoading(false); return; }
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data: result } = await supabase.rpc('get_year_in_review', {
        target_user: user.id,
        target_year: currentYear,
      });
      if (result) setData(result);
      setLoading(false);
    })();
  }, [isPro, currentYear]);

  if (loading) return null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={COLORS.text} />
        </Pressable>
        <Text style={styles.title}>Perfume Wrapped</Text>
        <View style={{ width: 26 }} />
      </View>

      {!isPro ? (
        <EmptyState
          icon="lock-closed"
          title="Pro Feature"
          subtitle="Upgrade to Pro to see your year in fragrance."
          actionLabel="Upgrade"
          onAction={() => router.push('/paywall')}
        />
      ) : !data || (data.total_wears ?? 0) < 10 ? (
        <EmptyState
          icon="calendar-outline"
          title="Come back in December"
          subtitle="You need at least 10 wears this year for your Wrapped to appear. Keep logging!"
        />
      ) : (
        <View style={styles.body}>
          <View style={styles.statCard}>
            <Text style={styles.bigNum}>{data.total_wears}</Text>
            <Text style={styles.statLabel}>Total Wears</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.bigNum}>{data.unique_fragrances}</Text>
            <Text style={styles.statLabel}>Unique Fragrances</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.bigNum}>{data.longest_streak ?? 0}</Text>
            <Text style={styles.statLabel}>Longest Streak</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.bigNum}>{data.compliments_received ?? 0}</Text>
            <Text style={styles.statLabel}>Compliments</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.bigNum}>{data.reviews_written ?? 0}</Text>
            <Text style={styles.statLabel}>Reviews Written</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
  },
  title: { ...TYPE.heading, textAlign: 'center' },
  body: {
    flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md,
    padding: SPACING.lg, justifyContent: 'center',
  },
  statCard: {
    width: '45%', paddingVertical: SPACING.xl,
    backgroundColor: COLORS.card, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center',
  },
  bigNum: { fontFamily: FONTS.serif, fontSize: 48, fontWeight: '700', color: COLORS.accent, lineHeight: 52 },
  statLabel: { ...TYPE.caption, marginTop: 4 },
});
