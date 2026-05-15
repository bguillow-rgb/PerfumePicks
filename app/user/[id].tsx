import { useEffect, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, RADIUS, FONTS } from '@/src/constants/theme';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * Public user profile — shows wear log history, follower/following counts,
 * collection size, taste profile summary.
 * M2 stub: queries real Supabase, renders empty state for now.
 */

interface UserProfile {
  display_name: string | null;
  bio: string | null;
  current_streak: number;
  total_sotd_count: number;
}

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [wearCount, setWearCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured || !id) { setLoading(false); return; }
    (async () => {
      const [profileRes, wearsRes] = await Promise.all([
        supabase.from('profiles').select('display_name, bio, current_streak, total_sotd_count').eq('id', id).maybeSingle(),
        supabase.from('wear_logs').select('id', { count: 'exact', head: true }).eq('user_id', id),
      ]);
      if (profileRes.data) setProfile(profileRes.data);
      setWearCount(wearsRes.count ?? 0);
      setLoading(false);
    })();
  }, [id]);

  if (loading) return null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={COLORS.text} />
        </Pressable>
        <Text style={styles.title}>{profile?.display_name || 'Perfume Lover'}</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* Avatar placeholder */}
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarLetter}>
            {(profile?.display_name?.[0] ?? '?').toUpperCase()}
          </Text>
        </View>

        {profile?.bio && <Text style={styles.bio}>{profile.bio}</Text>}

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{wearCount}</Text>
            <Text style={styles.statLabel}>Wears</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{profile?.current_streak ?? 0}</Text>
            <Text style={styles.statLabel}>Streak</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{profile?.total_sotd_count ?? 0}</Text>
            <Text style={styles.statLabel}>SOTD</Text>
          </View>
        </View>

        <EmptyState
          icon="time-outline"
          title="Public wear history coming soon"
          subtitle="This user's shared wears and taste profile will appear here."
        />
      </ScrollView>
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
  body: { alignItems: 'center', paddingTop: SPACING.lg },
  avatarCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: COLORS.blushSoft,
    borderWidth: 1.5, borderColor: COLORS.accent,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  avatarLetter: { fontFamily: FONTS.serif, fontSize: 36, color: COLORS.accent },
  bio: { ...TYPE.bodySmall, color: COLORS.muted, textAlign: 'center', paddingHorizontal: SPACING.xl, marginBottom: SPACING.lg },
  statsRow: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.lg },
  statCard: {
    width: 90, paddingVertical: SPACING.md,
    backgroundColor: COLORS.card, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center',
  },
  statValue: { fontFamily: FONTS.serif, fontSize: 24, fontWeight: '700', color: COLORS.accent },
  statLabel: { ...TYPE.caption, marginTop: 2 },
});
