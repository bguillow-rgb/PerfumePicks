import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS } from '@/src/constants/theme';

export default function TermsScreen() {
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
        <Text style={styles.title}>Terms of Service</Text>
        <Text style={styles.effective}>Effective Date: April 14, 2026</Text>

        <Text style={styles.body}>
          These Terms of Service ("Terms") govern your use of Stick Picks ("the app"), published by Bob Guillow. By using the app, you agree to these Terms.
        </Text>

        <Text style={styles.h2}>1. Eligibility</Text>
        <Text style={styles.body}>
          You must be at least 21 years of age to use Stick Picks. By creating an account or using the app, you represent that you meet this age requirement. Stick Picks is a cigar reference and recommendation tool; it does not sell, distribute, or promote the sale of tobacco products.
        </Text>

        <Text style={styles.h2}>2. Accounts</Text>
        <Text style={styles.body}>
          You may sign in with Apple, Google, or continue as a guest. You are responsible for maintaining the security of your account credentials. Guest accounts store data locally on your device; signing in enables cloud sync across devices.
        </Text>

        <Text style={styles.h2}>3. Subscriptions</Text>
        <Text style={styles.body}>
          <Text style={styles.bold}>Stick Picks Pro</Text> is an optional auto-renewing subscription available as a monthly or yearly plan. Key terms:
        </Text>
        <Text style={styles.bullet}>•  Payment is charged to your Apple ID account at confirmation of purchase.</Text>
        <Text style={styles.bullet}>•  Subscriptions automatically renew unless canceled at least 24 hours before the end of the current period.</Text>
        <Text style={styles.bullet}>•  You can manage subscriptions and turn off auto-renewal in your device's Account Settings.</Text>
        <Text style={styles.bullet}>•  No refunds are provided for the unused portion of a subscription period. Refund requests must be directed to Apple.</Text>
        <Text style={styles.bullet}>•  Prices are displayed in your local currency and may vary by region. Price changes take effect at the next renewal.</Text>

        <Text style={styles.h2}>4. Free Tier</Text>
        <Text style={styles.body}>
          Free accounts include access to the basic quiz, up to 5 cigar scans, and the ability to track owned cigars in the humidor. Pro features (unlimited scans, advanced quiz, drink pairings, full humidor filters, ratings and reviews, cigar notes) require an active subscription.
        </Text>

        <Text style={styles.h2}>5. Cigar Identification</Text>
        <Text style={styles.body}>
          The Scan a Stick feature uses AI to identify cigars from photos. Identification results are provided on a best-effort basis and may be incorrect. We make no guarantees about the accuracy of identification results. You can correct misidentifications using the in-app correction flow.
        </Text>

        <Text style={styles.h2}>6. User Content</Text>
        <Text style={styles.body}>
          You retain ownership of content you create (reviews, notes, photos). By submitting reviews and ratings, you grant Stick Picks a non-exclusive, royalty-free license to display that content to other users within the app. You may delete your content at any time.
        </Text>
        <Text style={styles.body}>
          You agree not to submit content that is unlawful, defamatory, obscene, or infringes on the rights of others. We reserve the right to remove content that violates these Terms.
        </Text>

        <Text style={styles.h2}>7. Intellectual Property</Text>
        <Text style={styles.body}>
          The Stick Picks name, logo, design, and code are the property of Bob Guillow. Cigar brand names, logos, and product information are the property of their respective owners and are used for informational and identification purposes only.
        </Text>

        <Text style={styles.h2}>8. Health Notice & Assumption of Risk</Text>
        <View style={styles.warningBox}>
          <Text style={styles.warningTitle}>SURGEON GENERAL'S WARNING</Text>
          <Text style={styles.warningBody}>
            Cigar smoking can cause cancers of the mouth and throat, even if you do not inhale. Cigar smoking can cause lung cancer and heart disease. Tobacco use increases the risk of infertility, stillbirth, and low birth weight. Cigars are not a safe alternative to cigarettes.
          </Text>
        </View>
        <Text style={styles.body}>
          Stick Picks is a reference and identification tool only. The app does not sell, distribute, or promote tobacco products, and nothing in the app should be construed as medical advice or a recommendation to use tobacco.
        </Text>
        <Text style={styles.body}>
          By using Stick Picks you acknowledge and agree that:
        </Text>
        <Text style={styles.bullet}>•  Cigar smoking and all forms of tobacco use carry significant and well-documented health risks, including cancer, heart disease, lung disease, and addiction.</Text>
        <Text style={styles.bullet}>•  You voluntarily assume all risks associated with the use of tobacco products.</Text>
        <Text style={styles.bullet}>•  Stick Picks, Bob Guillow, and any affiliated parties shall have no liability whatsoever for any illness, injury, addiction, death, or other harm of any kind that may result from your use of tobacco products, whether or not those products were identified, recommended, or referenced through the app.</Text>
        <Text style={styles.bullet}>•  You are solely responsible for complying with all federal, state, and local laws regarding the purchase, possession, and use of tobacco products in your jurisdiction.</Text>

        <Text style={styles.h2}>9. Disclaimer of Warranties</Text>
        <Text style={styles.body}>
          Stick Picks is provided "AS IS" and "AS AVAILABLE" without warranties of any kind, express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, or non-infringement. We do not warrant that the app will be uninterrupted, error-free, or that identification results will be accurate. Cigar information (strength, flavor, origin) is provided for general reference and may not reflect every production variation.
        </Text>

        <Text style={styles.h2}>10. Limitation of Liability</Text>
        <Text style={styles.body}>
          To the maximum extent permitted by law, Stick Picks and its developer shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from or related to your use of the app, including but not limited to loss of data, inaccurate cigar identification, or any health-related claims. Our total liability for any claim related to the app shall not exceed the amount you paid for the app, if any, in the twelve months preceding the claim.
        </Text>

        <Text style={styles.h2}>11. Account Deletion</Text>
        <Text style={styles.body}>
          You may delete your account at any time from the Profile screen within the app. Deletion permanently removes all your data including humidor entries, journal entries, scan history, quiz results, and reviews. This action cannot be undone.
        </Text>
        <Text style={styles.body}>
          If you cannot access the app, you may also request deletion by emailing support@stickpicks.app from your account email; we will permanently remove your account within 7 days. Deleting your account does not cancel an active App Store subscription — manage subscriptions in Settings → Apple ID → Subscriptions.
        </Text>

        <Text style={styles.h2}>12. Changes to These Terms</Text>
        <Text style={styles.body}>
          We may update these Terms from time to time. Material changes will be communicated through the app. Continued use after changes constitutes acceptance of the revised Terms.
        </Text>

        <Text style={styles.h2}>13. Governing Law</Text>
        <Text style={styles.body}>
          These Terms are governed by the laws of the State of Florida, United States, without regard to conflict of law provisions.
        </Text>

        <Text style={styles.h2}>14. Contact</Text>
        <Text style={styles.body}>
          For questions about these Terms, contact us at: support@stickpicks.app
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
