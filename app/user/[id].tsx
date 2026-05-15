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
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !id) { setLoading(false); return; }
    (async () => {
      const [profileRes, wearsRes, userRes, followersRes, followingRes] = await Promise.all([
        supabase.from('profiles').select('display_name, bio, current_streak, total_sotd_count').eq('id', id).maybeSingle(),
        supabase.from('wear_logs').select('id', { count: 'exact', head: true }).eq('user_id', id),
        supabase.auth.getUser(),
        supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('followee_id', id),
        supabase.from('follows').select('followee_id', { count: 'exact', head: true }).eq('follower_id', id),
      ]);
      if (profileRes.data) setProfile(profileRes.data);
      setWearCount(wearsRes.count ?? 0);
      setFollowerCount(followersRes.count ?? 0);
      setFollowingCount(followingRes.count ?? 0);
      const me = userRes.data.user?.id ?? null;
      setMyUserId(me);
      // Check if already following
      if (me && me !== id) {
        const { data: followRow } = await supabase
          .from('follows').select('follower_id')
          .eq('follower_id', me).eq('followee_id', id).maybeSingle();
        setIsFollowing(!!followRow);
      }
      setLoading(false);
    })();
  }, [id]);

  const handleFollow = async () => {
    if (!myUserId || !id || myUserId === id) return;
    if (isFollowing) {
      setIsFollowing(false);
      setFollowerCount((c) => Math.max(0, c - 1));
      await supabase.from('follows').delete().eq('follower_id', myUserId).eq('followee_id', id);
    } else {
      setIsFollowing(true);
      setFollowerCount((c) => c + 1);
      await supabase.from('follows').insert({ follower_id: myUserId, followee_id: id });
    }
  };

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

        {myUserId && myUserId !== id && (
          <Pressable style={[styles.followBtn, isFollowing && styles.followBtnActive]} onPress={handleFollow}>
            <Ionicons name={isFollowing ? 'checkmark' : 'person-add-outline'} size={14} color={isFollowing ? COLORS.white : COLORS.accent} />
            <Text style={[styles.followBtnText, isFollowing && styles.followBtnTextActive]}>
              {isFollowing ? 'Following' : 'Follow'}
            </Text>
          </Pressable>
        )}

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{followerCount}</Text>
            <Text style={styles.statLabel}>Followers</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{followingCount}</Text>
            <Text style={styles.statLabel}>Following</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{wearCount}</Text>
            <Text style={styles.statLabel}>Wears</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{profile?.current_streak ?? 0}</Text>
            <Text style={styles.statLabel}>Streak</Text>
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
  bio: { ...TYPE.bodySmall, color: COLORS.muted, textAlign: 'center', paddingHorizontal: SPACING.xl, marginBottom: SPACING.md },
  followBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: SPACING.xl, paddingVertical: 10,
    borderRadius: RADIUS.full, borderWidth: 1.5, borderColor: COLORS.accent,
    marginBottom: SPACING.lg,
  },
  followBtnActive: { backgroundColor: COLORS.accent },
  followBtnText: { ...TYPE.label, fontSize: 13, color: COLORS.accent, letterSpacing: 0.5 },
  followBtnTextActive: { color: COLORS.white },
  statsRow: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.lg },
  statCard: {
    flex: 1, paddingVertical: SPACING.md,
    backgroundColor: COLORS.card, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center',
  },
  statValue: { fontFamily: FONTS.serif, fontSize: 24, fontWeight: '700', color: COLORS.accent },
  statLabel: { ...TYPE.caption, marginTop: 2 },
});
