import { ScrollView, View, Text, StyleSheet, Pressable, Image, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useEffect, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, RADIUS, FONTS } from '@/src/constants/theme';
import { useProStore } from '@/src/stores/useProStore';
import { useProfileStore } from '@/src/stores/useProfileStore';
import { pickAndSetProfilePhoto, clearProfilePhoto } from '@/src/lib/profilePhoto';
import { restorePurchases, getCustomerInfo, isProActive } from '@/src/lib/revenuecat';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

/**
 * Profile tab — account, taste profile, settings, paywall entry.
 *
 * v1 sections:
 *   - Header: avatar + email + Pro badge
 *   - Taste Profile card (Pro): top notes, top accords, avoid list
 *   - Quick stats: wardrobe count, swipes, wear logs
 *   - Settings rows: Quiz, Subscription, Privacy, Terms, Sign out
 */
export default function ProfileScreen() {
  const router = useRouter();
  const isPro = useProStore((s) => s.isPro);
  const activate = useProStore((s) => s.activate);
  const deactivate = useProStore((s) => s.deactivate);
  const photoUri = useProfileStore((s) => s.photoUri);
  const monogram = useProfileStore((s) => s.getMonogram());
  const displayName = useProfileStore((s) => s.displayName);

  const [authUser, setAuthUser] = useState<User | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthUser(data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const isGuest = !authUser || authUser.is_anonymous;
  const userEmail = authUser?.email ?? null;
  // Prefer user metadata name, then local displayName, then nothing
  const userName = (authUser?.user_metadata?.full_name as string | undefined)
    ?? (displayName.trim().length > 0 ? displayName : null);

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive', onPress: async () => {
          await supabase.auth.signOut();
          router.replace('/auth/login');
        },
      },
    ]);
  };

  const handleChangePhoto = async () => {
    try {
      const result = await pickAndSetProfilePhoto();
      if (result === null) {
        // null means the picker returned without a photo — most likely a
        // permission denial. Alert the user so they know what happened.
        Alert.alert(
          'Photo Access Needed',
          'To add a profile photo, allow Perfume Picks to access your photo library in Settings.',
          [{ text: 'OK' }],
        );
      }
    } catch {
      // Unexpected error — fail silently, picker already handled its own errors.
    }
  };

  const handleRestorePurchases = async () => {
    try {
      const { isPro: restored } = await restorePurchases();
      if (restored) {
        activate();
        Alert.alert('Restored', 'Your Pro subscription has been restored.');
      } else {
        Alert.alert('No Purchase Found', "We couldn't find an active Pro subscription for this account.");
      }
    } catch (e: any) {
      Alert.alert('Restore Error', e?.message ?? 'Something went wrong');
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all your data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: async () => {
            try {
              const { data: { session } } = await supabase.auth.getSession();
              if (!session) {
                Alert.alert('Error', 'You must be signed in to delete your account.');
                return;
              }
              const resp = await supabase.functions.invoke('delete-account');
              if (resp.error) throw resp.error;
              await supabase.auth.signOut();
              router.replace('/auth/login');
            } catch (e: any) {
              Alert.alert('Error', e?.message ?? 'Account deletion failed. Please contact support.');
            }
          },
        },
      ],
    );
  };

  // Editable display name — debounced write to profiles table.
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(displayName);
  const nameTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveName = (name: string) => {
    useProfileStore.getState().setDisplayName(name);
    if (!isSupabaseConfigured || !authUser) return;
    if (nameTimeout.current) clearTimeout(nameTimeout.current);
    nameTimeout.current = setTimeout(async () => {
      await supabase.from('profiles').update({ display_name: name.trim() }).eq('id', authUser.id);
    }, 800);
  };

  // Editable bio — same pattern.
  const [editingBio, setEditingBio] = useState(false);
  const [bioInput, setBioInput] = useState('');
  const bioTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveBio = (bio: string) => {
    setBioInput(bio);
    if (!isSupabaseConfigured || !authUser) return;
    if (bioTimeout.current) clearTimeout(bioTimeout.current);
    bioTimeout.current = setTimeout(async () => {
      await supabase.from('profiles').update({ bio: bio.trim() }).eq('id', authUser.id);
    }, 800);
  };

  // Load bio from profiles on mount.
  useEffect(() => {
    if (!isSupabaseConfigured || !authUser) return;
    supabase.from('profiles').select('display_name, bio').eq('id', authUser.id).maybeSingle().then(({ data }) => {
      if (data?.display_name && !displayName) {
        useProfileStore.getState().setDisplayName(data.display_name);
        setNameInput(data.display_name);
      }
      if (data?.bio) setBioInput(data.bio);
    });
  }, [authUser?.id]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          {/* Tap the avatar to pick + crop a photo. Long-press to clear it
              back to the cursive monogram. The avatar everywhere in the app
              (tab bar, headers) updates instantly because it reads from the
              same persisted store. */}
          <Pressable
            onPress={handleChangePhoto}
            onLongPress={photoUri ? clearProfilePhoto : undefined}
            style={styles.avatarTouch}
          >
            <View style={styles.avatar}>
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarMonogram}>{monogram}</Text>
              )}
              {/* Small camera badge — affordance that the avatar is tappable. */}
              <View style={styles.cameraBadge}>
                <Ionicons name="camera" size={12} color={COLORS.white} />
              </View>
            </View>
          </Pressable>
          <Text style={styles.editPhotoHint}>
            {photoUri ? 'Tap to change · Hold to remove' : 'Tap to add a photo'}
          </Text>
          {editingName ? (
            <TextInput
              value={nameInput}
              onChangeText={(t) => { setNameInput(t); saveName(t); }}
              onBlur={() => setEditingName(false)}
              autoFocus
              style={[styles.name, styles.nameInput]}
              placeholder="Your name"
              placeholderTextColor={COLORS.subtle}
              returnKeyType="done"
              onSubmitEditing={() => setEditingName(false)}
            />
          ) : (
            <Pressable onPress={() => { setNameInput(displayName); setEditingName(true); }}>
              <Text style={styles.name}>{userName || 'Tap to add name'}</Text>
            </Pressable>
          )}
          <Text style={styles.email}>
            {userEmail ?? (isGuest ? 'Sign in to sync your wardrobe' : '')}
          </Text>
          {editingBio ? (
            <TextInput
              value={bioInput}
              onChangeText={saveBio}
              onBlur={() => setEditingBio(false)}
              autoFocus
              style={styles.bioInput}
              placeholder="A short bio..."
              placeholderTextColor={COLORS.subtle}
              multiline
              maxLength={160}
              returnKeyType="done"
              blurOnSubmit
            />
          ) : (
            <Pressable onPress={() => setEditingBio(true)}>
              <Text style={styles.bio}>{bioInput || 'Tap to add a bio'}</Text>
            </Pressable>
          )}
          {isPro ? (
            <View style={styles.proBadge}>
              <Text style={styles.proBadgeText}>PERFUME PICKS PRO</Text>
            </View>
          ) : (
            <Pressable style={styles.upgradeBtn} onPress={() => router.push('/paywall')}>
              <Text style={styles.upgradeText}>Upgrade to Pro</Text>
            </Pressable>
          )}
        </View>

        <Section title="Taste Profile">
          <Row label="Take the quiz" onPress={() => router.push('/quiz')} />
          <Row label="View taste insights" onPress={() => router.push('/taste-profile')} pro disabled={!isPro} />
          <Row label="Perfume Wrapped" onPress={() => router.push('/wrapped')} pro disabled={!isPro} />
        </Section>

        <BadgesSection />

        <Section title="Account">
          {isGuest && <Row label="Sign in" onPress={() => router.push('/auth/login')} />}
          <Row label="Subscription" onPress={() => router.push('/paywall')} />
          <Row label="Restore Purchases" onPress={handleRestorePurchases} />
          {!isGuest && <Row label="Sign Out" onPress={handleSignOut} danger />}
          {!isGuest && <Row label="Delete Account" onPress={handleDeleteAccount} danger />}
        </Section>

        <Section title="About">
          <Row label="Privacy Policy" onPress={() => router.push('/legal/privacy')} />
          <Row label="Terms of Service" onPress={() => router.push('/legal/terms')} />
        </Section>

        {__DEV__ && (
          <Section title="Dev Tools">
            <Row
              label={isPro ? '✓ Pro active — tap to revoke' : 'Simulate Pro purchase'}
              onPress={isPro ? deactivate : activate}
            />
          </Section>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const BADGE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  streak_7: 'flame', streak_30: 'flame', streak_100: 'flame', streak_365: 'flame',
  first_wear: 'water', first_review: 'create', collector_10: 'rose',
};
const BADGE_LABELS: Record<string, string> = {
  streak_7: '7-Day Streak', streak_30: '30-Day Streak', streak_100: '100-Day Streak', streak_365: '365-Day Streak',
  first_wear: 'First Wear', first_review: 'First Review', collector_10: 'Collector',
};

function BadgesSection() {
  const [badges, setBadges] = useState<{ badge_key: string; awarded_at: string }[]>([]);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('user_badges').select('badge_key, awarded_at').eq('user_id', user.id);
      if (data) setBadges(data);
    })();
  }, []);

  if (badges.length === 0) return null;

  return (
    <Section title="Badges">
      <View style={styles.sectionBody}>
        <View style={styles.badgeGrid}>
          {badges.map((b) => (
            <View key={b.badge_key} style={styles.badgeItem}>
              <Ionicons name={BADGE_ICONS[b.badge_key] ?? 'ribbon'} size={20} color={COLORS.accent} />
              <Text style={styles.badgeLabel}>{BADGE_LABELS[b.badge_key] ?? b.badge_key}</Text>
            </View>
          ))}
        </View>
      </View>
    </Section>
  );
}

function Row({
  label, onPress, pro, disabled, danger,
}: { label: string; onPress?: () => void; pro?: boolean; disabled?: boolean; danger?: boolean }) {
  const router = useRouter();
  // Disabled Pro rows still navigate to the paywall — tapping locked content
  // is the highest-intent conversion moment.
  const handlePress = disabled && pro
    ? () => router.push('/paywall')
    : disabled ? undefined : onPress;
  return (
    <Pressable
      style={[styles.row, disabled && styles.rowDisabled]}
      onPress={handlePress}
    >
      <Text style={[styles.rowLabel, disabled && styles.rowLabelDisabled, danger && styles.rowLabelDanger]}>{label}</Text>
      {pro && <Text style={styles.proPill}>PRO</Text>}
      {!danger && <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  container: { paddingBottom: SPACING.xxl },
  header: {
    alignItems: 'center',
    paddingTop: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  avatarTouch: { marginBottom: SPACING.xs },
  avatar: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: COLORS.blushSoft,
    borderWidth: 1.5, borderColor: COLORS.accent,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',                     // clips photo to circle
  },
  // Photo fills the circle. The avatar's `overflow: hidden` does the masking.
  avatarImage: {
    width: '100%', height: '100%',
  },
  // Cursive monogram fallback.
  avatarMonogram: {
    fontFamily: 'PinyonScript_400Regular',
    fontSize: 56,
    color: COLORS.accent,
    lineHeight: 88,
    textAlign: 'center',
  },
  // Tiny camera badge in the bottom-right of the avatar — affordance that
  // the avatar is tappable. Champagne gold disc with a white camera icon.
  cameraBadge: {
    position: 'absolute',
    right: 0, bottom: 0,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.accent,
    borderWidth: 2, borderColor: COLORS.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  editPhotoHint: {
    ...TYPE.caption,
    color: COLORS.muted,
    fontStyle: 'italic',
    marginBottom: SPACING.sm,
  },
  name: { ...TYPE.displayMedium, marginBottom: 4, textAlign: 'center' },
  nameInput: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.accent,
    paddingVertical: 4,
    minWidth: 160,
  },
  email: { ...TYPE.bodySmall, marginBottom: SPACING.sm },
  bio: { ...TYPE.bodySmall, color: COLORS.muted, fontStyle: 'italic', marginBottom: SPACING.md, textAlign: 'center' },
  bioInput: {
    ...TYPE.bodySmall,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    marginBottom: SPACING.md,
    minHeight: 48,
    textAlignVertical: 'top',
    width: '100%',
  },
  upgradeBtn: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.xl,
    paddingVertical: 12,
    borderRadius: RADIUS.full,
  },
  upgradeText: { ...TYPE.label, color: COLORS.white, letterSpacing: 1.5 },
  proBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderRadius: RADIUS.full,
  },
  proBadgeText: { ...TYPE.eyebrow, fontSize: 10 },
  section: { marginTop: SPACING.lg, paddingHorizontal: SPACING.lg },
  sectionTitle: { ...TYPE.eyebrow, marginBottom: SPACING.sm, paddingHorizontal: SPACING.sm },
  sectionBody: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  rowDisabled: { opacity: 0.5 },
  rowLabel: { ...TYPE.body, flex: 1 },
  rowLabelDisabled: { color: COLORS.subtle },
  rowLabelDanger: { color: COLORS.danger },
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, padding: SPACING.md },
  badgeItem: { alignItems: 'center', gap: 4, width: 70 },
  badgeLabel: { ...TYPE.caption, fontSize: 9, textAlign: 'center' },
  proPill: {
    ...TYPE.eyebrow,
    fontSize: 10,
    marginRight: SPACING.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderRadius: RADIUS.full,
  },
});
