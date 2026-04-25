import { View, Text, StyleSheet, Image, Pressable, ScrollView } from 'react-native';
import { Alert } from '@/src/components/ui/StyledAlert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system/next';
import { decode } from 'base64-arraybuffer';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { COLORS, SPACING, FONTS } from '@/src/constants/theme';
import { useProStore } from '@/src/stores/useProStore';
import { StreakCard } from '@/src/components/streaks/StreakCard';
import { useIsAdmin } from '@/src/features/admin/useIsAdmin';
import type { User } from '@supabase/supabase-js';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [stats, setStats] = useState({ humidor: 0, smoked: 0, scans: 0 });
  const { isAdmin } = useIsAdmin();

  const fetchUser = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    setUser(data.user);
    return data.user;
  }, []);

  const fetchProfileAvatar = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', userId)
        .single();
      if (data?.avatar_url) {
        setProfileAvatarUrl(data.avatar_url);
      }
    } catch {
      // Non-blocking
    }
  }, []);

  const fetchStats = useCallback(async (userId: string) => {
    try {
      const [humidorRes, smokedRes, scansRes] = await Promise.all([
        supabase.from('humidor_items').select('id', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.from('humidor_items').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'smoked'),
        supabase.from('scan_images').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      ]);
      setStats({
        humidor: humidorRes.count ?? 0,
        smoked: smokedRes.count ?? 0,
        scans: scansRes.count ?? 0,
      });
    } catch {
      // Non-blocking
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const u = await fetchUser();
        if (u) {
          await Promise.all([
            fetchProfileAvatar(u.id),
            fetchStats(u.id),
          ]);
        }
      })();
    }, [fetchUser, fetchProfileAvatar, fetchStats])
  );

  const isGuest = user?.is_anonymous ?? true;
  const email = user?.email ?? '';
  const fullName =
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    '';
  // Priority: profiles table avatar > user_metadata avatar > Google picture
  const avatarUrl =
    profileAvatarUrl ??
    user?.user_metadata?.avatar_url ??
    user?.user_metadata?.picture ??
    '';
  const displayName = fullName || (email ? email.split('@')[0] : 'Guest');
  const initials = displayName
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'SP';

  const handlePickAvatar = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      // Limit avatar to 5 MB
      if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
        Alert.alert('File Too Large', 'Please choose an image under 5 MB.');
        return;
      }

      setUploading(true);
      const contentType = 'image/jpeg';
      const userId = user?.id ?? 'anon';
      const fileName = `${userId}/avatar.jpg`;

      const file = new File(asset.uri);
      const base64 = await file.base64();

      const { error: uploadError } = await supabase.storage
        .from('cigar-images')
        .upload(fileName, decode(base64), { contentType, upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('cigar-images')
        .getPublicUrl(fileName);

      // Bust cache with timestamp
      const publicUrl = urlData.publicUrl + '?t=' + Date.now();

      // Save to profiles table (persists across login/logout)
      await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', userId);

      // Also update user metadata as backup
      await supabase.auth.updateUser({
        data: { avatar_url: publicUrl },
      });

      setProfileAvatarUrl(publicUrl);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to upload photo');
    } finally {
      setUploading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      useProStore.getState().deactivate();
      await supabase.auth.signOut();
      router.replace('/auth/login');
    } catch {
      Alert.alert('Error', 'Failed to sign out');
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all associated data (humidor, journal, scan history, reviews). This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const userId = user?.id;
              if (!userId) return;

              // Edge Function does the auth.users deletion under service role,
              // plus wipes data tables and storage buckets in one shot.
              const { error: invokeError } = await supabase.functions.invoke('delete-account');
              if (invokeError) throw invokeError;

              useProStore.getState().deactivate();
              await supabase.auth.signOut();
              router.replace('/auth/login');
            } catch {
              // Keep the retry path in-app — Apple 5.1.1(v) requires self-service deletion.
              Alert.alert(
                'Deletion Failed',
                'We could not delete your account right now. Please check your connection and try again.',
              );
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingTop: insets.top + SPACING.md, paddingBottom: insets.bottom + SPACING.xl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Profile</Text>

      <Card style={styles.profileCard}>
        <Pressable onPress={handlePickAvatar} disabled={uploading}>
          <View style={styles.avatarWrap}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
            )}
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={12} color={COLORS.bg} />
            </View>
          </View>
        </Pressable>
        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.subtitle}>{isGuest ? 'Guest Mode' : email}</Text>
      </Card>

      <Pressable onPress={() => router.push('/(tabs)/humidor?filter=all')}>
        <Card style={styles.statsCard}>
          <Text style={styles.sectionTitle}>Your Stats</Text>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statNumber}>{stats.humidor}</Text>
              <Text style={styles.statLabel}>In Humidor</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statNumber}>{stats.smoked}</Text>
              <Text style={styles.statLabel}>Smoked</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statNumber}>{stats.scans}</Text>
              <Text style={styles.statLabel}>Scans</Text>
            </View>
          </View>
        </Card>
      </Pressable>

      {/* Gamification v1 — three daily streaks. Guests see a sign-in
          nudge inside the card instead of empty rows. Non-blocking:
          nothing else on this screen depends on streak state. */}
      <StreakCard userId={user?.id ?? null} />

      {/* Admin entry — only rendered if useIsAdmin() resolves true.
          RPC is loading-safe: hook returns isAdmin=false during the
          initial check, so there's no flash of admin UI on first
          render. */}
      {isAdmin && (
        <Pressable onPress={() => router.push('/admin')}>
          <Card style={styles.adminTile}>
            <Ionicons name="shield-checkmark-outline" size={22} color={COLORS.accent} />
            <View style={styles.adminTextWrap}>
              <Text style={styles.adminTitle}>Admin</Text>
              <Text style={styles.adminSubtitle}>
                Catalog, submissions, invites
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
          </Card>
        </Pressable>
      )}

      <View style={styles.actions}>
        <Button
          title="Sign Out"
          variant="secondary"
          onPress={handleSignOut}
        />
      </View>

      <View style={styles.legalLinks}>
        <Pressable onPress={() => router.push('/legal/privacy')}>
          <Text style={styles.legalLink}>Privacy Policy</Text>
        </Pressable>
        <Text style={styles.legalDot}>{'\u00B7'}</Text>
        <Pressable onPress={() => router.push('/legal/terms')}>
          <Text style={styles.legalLink}>Terms of Service</Text>
        </Pressable>
      </View>

      {!isGuest && (
        <Pressable onPress={handleDeleteAccount} style={styles.deleteBtn}>
          <Text style={styles.deleteText}>Delete Account</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scrollContent: {
    paddingHorizontal: SPACING.md,
  },
  title: {
    fontFamily: 'Cormorant',
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  profileCard: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    marginBottom: SPACING.md,
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: SPACING.sm,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: COLORS.accent,
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.bg,
  },
  avatarText: {
    fontFamily: 'Cormorant',
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.bg,
  },
  name: {
    fontFamily: 'Cormorant',
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
  },
  subtitle: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    color: COLORS.muted,
    marginTop: 4,
  },
  statsCard: {
    marginBottom: SPACING.md,
  },
  adminTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginTop: SPACING.md,
    paddingVertical: SPACING.md,
  },
  adminTextWrap: {
    flex: 1,
  },
  adminTitle: {
    fontFamily: 'Cormorant',
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  adminSubtitle: {
    fontFamily: 'Cormorant',
    fontSize: 13,
    color: COLORS.muted,
    marginTop: 2,
  },
  sectionTitle: {
    fontFamily: 'Cormorant',
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  statsRow: {
    flexDirection: 'row',
    // No justifyContent — each stat takes an exact 1/N slice so spacing is
    // mathematically equal regardless of label width.
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontFamily: 'Cormorant',
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.accent,
  },
  statLabel: {
    fontFamily: 'Cormorant',
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 4,
  },
  actions: {
    marginTop: SPACING.lg,
    gap: SPACING.sm,
  },
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.lg,
    gap: SPACING.sm,
  },
  legalLink: {
    fontFamily: 'Cormorant',
    fontSize: 13,
    color: COLORS.muted,
    textDecorationLine: 'underline',
  },
  legalDot: {
    color: COLORS.subtle,
    fontSize: 13,
  },
  deleteBtn: {
    alignItems: 'center',
    marginTop: SPACING.lg,
    paddingVertical: 12,
  },
  deleteText: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    fontWeight: '600',
    color: '#CC4444',
  },
});
