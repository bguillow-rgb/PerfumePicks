import { ScrollView, View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, RADIUS } from '@/src/constants/theme';
import { useProStore } from '@/src/stores/useProStore';

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

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Ionicons name="person-outline" size={32} color={COLORS.accent} />
          </View>
          <Text style={styles.name}>Welcome</Text>
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
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.accent,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.md,
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
