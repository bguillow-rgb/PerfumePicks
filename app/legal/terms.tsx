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
      >
        <Text style={styles.wordmark}>Perfume Picks</Text>
        <Text style={styles.title}>Terms of Use</Text>
        <Text style={styles.effective}>Effective Date: June 9, 2026</Text>

        <Text style={styles.body}>
          These Terms of Use ("Terms") govern your use of Perfume Picks ("the app"). By using the app, you agree to these Terms.
        </Text>

        <Text style={styles.h2}>1. Eligibility</Text>
        <Text style={styles.body}>
          You must be at least 13 years of age to use Perfume Picks.
        </Text>

        <Text style={styles.h2}>2. Account & Sign-In</Text>
        <Text style={styles.body}>
          You may sign in with Apple or Google, or continue as a guest. You are responsible for activity under your account.
        </Text>

        <Text style={styles.h2}>3. Subscriptions</Text>
        <Text style={styles.body}>
          <Text style={styles.bold}>Perfume Picks Pro</Text> is an optional auto-renewing subscription:
        </Text>
        <Text style={styles.bullet}>•  Pricing is shown in-app at the time of purchase.</Text>
        <Text style={styles.bullet}>•  Subscriptions auto-renew unless canceled at least 24 hours before renewal.</Text>
        <Text style={styles.bullet}>•  You can manage or cancel anytime in your Apple ID settings.</Text>
        <Text style={styles.bullet}>•  Refund requests must be made through Apple.</Text>

        <Text style={styles.h2}>4. Free vs Pro</Text>
        <Text style={styles.body}>
          Free includes the basic 3-question quiz, 10 swipes/day in Train My Nose, limited daily picks, and a 20-item wardrobe cap. Pro adds unlimited swipes, the full 9-question quiz, dupes, decant intelligence, taste insights, layering suggestions, and advanced filters.
        </Text>

        <Text style={styles.h2}>5. Recommendations</Text>
        <Text style={styles.body}>
          Recommendations, similarity matches, dupe suggestions, and layering ideas are best-effort, based on community data and our taste-profile model. They are informational only and are not a guarantee of accuracy, suitability, or satisfaction. Personal scent perception varies widely — always sample before purchasing a full bottle. Any decision you make based on the app is your own, and you rely on it at your own risk.
        </Text>

        <Text style={styles.h2}>6. Third-Party Purchases & Affiliate Links</Text>
        <Text style={styles.body}>
          Perfume Picks is not a retailer. We do not sell, ship, or fulfill any fragrance. Some links in the app are affiliate links — if you click one and buy, we may earn a small commission, which does not change the price you pay.
        </Text>
        <Text style={styles.body}>
          Any purchase you make is a contract between you and the third-party retailer. We are not responsible for their pricing, availability, shipping, returns, product authenticity, formulation, or any other aspect of that transaction. If a fragrance you buy doesn't meet your expectations, is reformulated, or smells different than you hoped, that is not something we are liable for. All purchase and return questions must go to the retailer.
        </Text>

        <Text style={styles.h2}>7. User Content</Text>
        <Text style={styles.body}>
          You retain ownership of content you create (wear logs, ratings, notes). By submitting public ratings, you grant Perfume Picks a non-exclusive, royalty-free license to display them within the app.
        </Text>

        <Text style={styles.h2}>8. Acceptable Use</Text>
        <Text style={styles.body}>
          No abuse, scraping, reverse-engineering, or interference. We may suspend accounts that violate these Terms.
        </Text>

        <Text style={styles.h2}>9. Intellectual Property</Text>
        <Text style={styles.body}>
          The Perfume Picks name, logo, design, and code are our property. Brand and product names are the property of their respective owners and used for informational purposes only.
        </Text>

        <Text style={styles.h2}>10. Disclaimer of Warranties</Text>
        <Text style={styles.body}>
          The app is provided "AS IS" and "AS AVAILABLE", without warranties of any kind, express or implied. Notes, accords, and performance information are general reference and may not reflect every batch or reformulation. We make no claims about the safety, suitability, or compatibility of any fragrance with your skin or health. If you have a known fragrance sensitivity or allergy, consult the retailer or manufacturer before purchasing.
        </Text>

        <Text style={styles.h2}>11. Limitation of Liability</Text>
        <Text style={styles.body}>
          To the maximum extent permitted by law, your use of the app is at your sole risk, and our total liability for any claim related to the app shall not exceed the amount you paid to us in the prior twelve months. We are not liable for any indirect, incidental, special, consequential, or punitive damages — including dissatisfaction with a fragrance you purchased, money spent on products, or loss of data — arising from or related to your use of the app or any recommendation it provides.
        </Text>

        <Text style={styles.h2}>12. Account Deletion</Text>
        <Text style={styles.body}>
          Delete your account anytime from the Profile screen. This permanently removes all your data and cannot be undone.
        </Text>

        <Text style={styles.h2}>13. Contact</Text>
        <Text style={styles.body}>
          Questions? support@perfumepicks.app
        </Text>

        <Text style={styles.footer}>© 2026 Perfume Picks. All rights reserved.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, flexDirection: 'row', justifyContent: 'flex-end' },
  closeBtn: { padding: 4 },
  wordmark: { fontFamily: 'PinyonScript_400Regular', fontSize: 38, color: COLORS.accent, textAlign: 'center', lineHeight: 50, marginBottom: 4 },
  title: { fontFamily: FONTS.serif, fontSize: 24, fontWeight: '700', color: COLORS.text, textAlign: 'center', marginBottom: 6 },
  effective: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.muted, textAlign: 'center', marginBottom: SPACING.lg, fontStyle: 'italic' },
  h2: { fontFamily: FONTS.serif, fontSize: 17, fontWeight: '700', color: COLORS.text, marginTop: SPACING.lg, marginBottom: 6 },
  body: { fontFamily: FONTS.body, fontSize: 14, color: COLORS.text, lineHeight: 21, marginBottom: 8 },
  bullet: { fontFamily: FONTS.body, fontSize: 14, color: COLORS.text, lineHeight: 21, marginBottom: 4, paddingLeft: 4 },
  bold: { fontWeight: '700' },
  footer: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.subtle, textAlign: 'center', marginTop: SPACING.xl, fontStyle: 'italic' },
});
