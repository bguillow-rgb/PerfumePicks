import { ScrollView, View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, RADIUS, FONTS } from '@/src/constants/theme';
import { useProStore } from '@/src/stores/useProStore';
import { useProfileStore } from '@/src/stores/useProfileStore';
import { pickAndSetProfilePhoto, clearProfilePhoto } from '@/src/lib/profilePhoto';

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
  const photoUri = useProfileStore((s) => s.photoUri);
  const monogram = useProfileStore((s) => s.getMonogram());
  const displayName = useProfileStore((s) => s.displayName);

  const handleChangePhoto = async () => {
    try {
      await pickAndSetProfilePhoto();
    } catch (e) {
      // Picker errors fail silently — most often it's "permission denied"
      // and the system already showed the user a settings prompt.
    }
  };

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
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.email}>Sign in to sync your wardrobe</Text>
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
          <Row label="View taste insights" pro disabled={!isPro} />
        </Section>

        <Section title="Account">
          <Row label="Sign in" onPress={() => router.push('/auth/login')} />
          <Row label="Subscription" onPress={() => router.push('/paywall')} />
        </Section>

        <Section title="About">
          <Row label="Privacy Policy" onPress={() => router.push('/legal/privacy')} />
          <Row label="Terms of Service" onPress={() => router.push('/legal/terms')} />
        </Section>
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

function Row({
  label, onPress, pro, disabled,
}: { label: string; onPress?: () => void; pro?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      style={[styles.row, disabled && styles.rowDisabled]}
      onPress={disabled ? undefined : onPress}
    >
      <Text style={[styles.rowLabel, disabled && styles.rowLabelDisabled]}>{label}</Text>
      {pro && <Text style={styles.proPill}>PRO</Text>}
      <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
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
  name: { ...TYPE.displayMedium, marginBottom: 4 },
  email: { ...TYPE.bodySmall, marginBottom: SPACING.md },
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
