import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS } from '@/src/constants/theme';

export default function PrivacyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color={COLORS.muted} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingHorizontal: SPACING.lg }}
        showsVerticalScrollIndicator
        indicatorStyle="white"
      >
        <Text style={styles.brand}>STICK PICKS</Text>
        <Text style={styles.title}>Privacy Policy</Text>
        <Text style={styles.effective}>Effective Date: April 14, 2026</Text>

        <Text style={styles.body}>
          Stick Picks ("we", "our", or "the app") is a cigar recommendation and identification app published by Bob Guillow. This policy explains how we collect, use, and protect your information.
        </Text>

        <Text style={styles.h2}>1. Information We Collect</Text>
        <Text style={styles.body}>
          <Text style={styles.bold}>Account information.</Text> When you sign in with Apple or Google, we receive your name, email address, and profile photo as provided by the identity provider. Guest users are assigned an anonymous identifier with no personal information collected.
        </Text>
        <Text style={styles.body}>
          <Text style={styles.bold}>User-generated content.</Text> Cigar photos you scan, humidor entries, journal notes, ratings, reviews, and quiz responses are stored in your account.
        </Text>
        <Text style={styles.body}>
          <Text style={styles.bold}>Device information.</Text> We collect basic device metadata (OS version, device model) for crash reporting and compatibility. We do not collect location data.
        </Text>
        <Text style={styles.body}>
          <Text style={styles.bold}>Purchase information.</Text> Subscription transactions are processed entirely by Apple through the App Store. We receive a purchase confirmation but never see your payment details.
        </Text>

        <Text style={styles.h2}>2. How We Use Your Information</Text>
        <Text style={styles.bullet}>•  To provide cigar identification, recommendations, and personalized results</Text>
        <Text style={styles.bullet}>•  To sync your humidor, journal, and scan history across devices</Text>
        <Text style={styles.bullet}>•  To improve our cigar identification accuracy using anonymized scan data</Text>
        <Text style={styles.bullet}>•  To manage your subscription and account</Text>

        <Text style={styles.h2}>3. Cigar Scan Images</Text>
        <Text style={styles.body}>
          Photos you take with the Scan a Stick feature are uploaded to our servers for identification. These images may be retained in anonymized form to improve our identification models. Images are associated with your user ID for correction and history purposes but are not shared publicly.
        </Text>

        <Text style={styles.h2}>4. Data Sharing</Text>
        <Text style={styles.body}>We do not sell your personal information. We share data only with:</Text>
        <Text style={styles.bullet}>•  <Text style={styles.bold}>Supabase</Text> (database and authentication hosting)</Text>
        <Text style={styles.bullet}>•  <Text style={styles.bold}>Anthropic</Text> (AI-powered cigar identification, receives scan images only)</Text>
        <Text style={styles.bullet}>•  <Text style={styles.bold}>RevenueCat</Text> (subscription management)</Text>
        <Text style={styles.bullet}>•  <Text style={styles.bold}>Apple</Text> (authentication and payment processing)</Text>
        <Text style={styles.bullet}>•  <Text style={styles.bold}>Google</Text> (authentication)</Text>
        <Text style={styles.body}>
          Community ratings and reviews you submit are visible to other users. Your display name is shown alongside reviews; your email is never displayed.
        </Text>

        <Text style={styles.h2}>5. Data Retention</Text>
        <Text style={styles.body}>
          Your data is retained as long as your account is active. You may delete your account at any time from the Profile screen, which permanently removes all associated data including humidor entries, journal entries, scan history, and reviews.
        </Text>

        <Text style={styles.h2}>6. Data Security</Text>
        <Text style={styles.body}>
          All data is transmitted over HTTPS and stored in secured, access-controlled databases. Authentication tokens are stored securely on your device. We follow industry-standard practices to protect your information.
        </Text>

        <Text style={styles.h2}>7. Children's Privacy</Text>
        <Text style={styles.body}>
          Stick Picks is intended for users aged 21 and older. We do not knowingly collect information from anyone under 21. If we learn that a user is under 21, we will delete their account and associated data.
        </Text>

        <Text style={styles.h2}>8. Your Rights & Account Deletion</Text>
        <Text style={styles.body}>
          You may request access to, correction of, or deletion of your personal data at any time. To delete your account and all associated data:
        </Text>
        <Text style={styles.bullet}>•  <Text style={styles.bold}>In-app:</Text> open the Profile tab and tap "Delete Account" at the bottom.</Text>
        <Text style={styles.bullet}>•  <Text style={styles.bold}>By email:</Text> if you cannot access the app, email support@stickpicks.app from your account email with the subject "Delete My Account". We will permanently remove your account within 7 days.</Text>
        <Text style={styles.body}>
          California residents and EU users have additional rights under CCPA and GDPR respectively.
        </Text>

        <Text style={styles.h2}>9. Health Notice</Text>
        <View style={styles.warningBox}>
          <Text style={styles.warningTitle}>SURGEON GENERAL'S WARNING</Text>
          <Text style={styles.warningBody}>
            Cigar smoking can cause cancers of the mouth and throat, even if you do not inhale. Cigar smoking can cause lung cancer and heart disease. Tobacco use increases the risk of infertility, stillbirth, and low birth weight. Cigars are not a safe alternative to cigarettes.
          </Text>
        </View>
        <Text style={styles.body}>
          Stick Picks is a reference and identification tool only. We do not sell, distribute, or promote tobacco products and we make no health claims about any cigar. By using this app you acknowledge that smoking carries significant health risks and that you assume all responsibility for any health consequences arising from your use of tobacco. Stick Picks and its developer expressly disclaim all liability for any illness, injury, or other harm related to tobacco use.
        </Text>

        <Text style={styles.h2}>10. Changes to This Policy</Text>
        <Text style={styles.body}>
          We may update this policy from time to time. Material changes will be communicated through the app. Continued use after changes constitutes acceptance.
        </Text>

        <Text style={styles.h2}>11. Contact</Text>
        <Text style={styles.body}>
          For questions about this privacy policy or your data, contact us at: support@stickpicks.app
        </Text>

        <Text style={styles.footer}>© 2026 Stick Picks. All rights reserved.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    fontFamily: FONTS.display,
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.accent,
    letterSpacing: 6,
    textAlign: 'center',
    marginBottom: 8,
  },
  title: {
    fontFamily: 'Cormorant',
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.accent,
    textAlign: 'center',
  },
  effective: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    color: COLORS.muted,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
  h2: {
    fontFamily: 'Cormorant',
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.accent,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  body: {
    fontFamily: 'Cormorant',
    fontSize: 15,
    color: COLORS.muted,
    lineHeight: 24,
    marginBottom: SPACING.sm,
  },
  bullet: {
    fontFamily: 'Cormorant',
    fontSize: 15,
    color: COLORS.muted,
    lineHeight: 24,
    marginBottom: 4,
    paddingLeft: SPACING.sm,
  },
  bold: {
    fontWeight: '700',
    color: COLORS.text,
  },
  warningBox: {
    borderWidth: 2,
    borderColor: COLORS.text,
    padding: SPACING.md,
    marginVertical: SPACING.sm,
  },
  warningTitle: {
    fontFamily: 'Cormorant',
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: 1,
    marginBottom: SPACING.xs,
  },
  warningBody: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 21,
  },
  footer: {
    fontFamily: 'Cormorant',
    fontSize: 12,
    color: COLORS.subtle,
    textAlign: 'center',
    marginTop: SPACING.xl,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
});
