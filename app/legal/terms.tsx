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
        <Text style={styles.title}>Terms of Service</Text>
        <Text style={styles.effective}>Effective Date: April 25, 2026</Text>

        <Text style={styles.body}>
          These Terms of Service ("Terms") govern your use of Perfume Picks ("the app"). By using the app, you agree to these Terms.
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
          Recommendations, similarity matches, and dupe suggestions are best-effort, based on community data and our taste-profile model. Personal scent perception varies — always sample before purchasing a full bottle.
        </Text>

        <Text style={styles.h2}>6. User Content</Text>
        <Text style={styles.body}>
          You retain ownership of content you create (wear logs, ratings, notes). By submitting public ratings, you grant Perfume Picks a non-exclusive, royalty-free license to display them within the app.
        </Text>

        <Text style={styles.h2}>7. Acceptable Use</Text>
        <Text style={styles.body}>
          No abuse, scraping, reverse-engineering, or interference. We may suspend accounts that violate these Terms.
        </Text>

        <Text style={styles.h2}>8. Intellectual Property</Text>
        <Text style={styles.body}>
          The Perfume Picks name, logo, design, and code are our property. Brand and product names are the property of their respective owners and used for informational purposes only.
        </Text>

        <Text style={styles.h2}>9. Disclaimer of Warranties</Text>
        <Text style={styles.body}>
          The app is provided "AS IS". Notes, accords, and performance information are general reference and may not reflect every batch.
        </Text>

        <Text style={styles.h2}>10. Limitation of Liability</Text>
        <Text style={styles.body}>
          To the maximum extent permitted by law, our total liability for any claim shall not exceed the amount you paid to us in the prior twelve months.
        </Text>

        <Text style={styles.h2}>11. Account Deletion</Text>
        <Text style={styles.body}>
          Delete your account anytime from the Profile screen. This permanently removes all your data and cannot be undone.
        </Text>

        <Text style={styles.h2}>12. Contact</Text>
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
