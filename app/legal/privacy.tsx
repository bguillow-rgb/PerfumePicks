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
      >
        <Text style={styles.wordmark}>Perfume Picks</Text>
        <Text style={styles.title}>Privacy Policy</Text>
        <Text style={styles.effective}>Effective Date: April 25, 2026</Text>

        <Text style={styles.body}>
          Perfume Picks ("we", "our", or "the app") is a fragrance discovery, tracking, and recommendation app. This policy explains how we collect, use, and protect your information.
        </Text>

        <Text style={styles.h2}>1. Information We Collect</Text>
        <Text style={styles.body}>
          <Text style={styles.bold}>Account information.</Text> If you sign in with Apple or Google, we receive your email and a unique identifier from the provider. Guest accounts only store an anonymous identifier.
        </Text>
        <Text style={styles.body}>
          <Text style={styles.bold}>User-generated content.</Text> Wardrobe entries, wear logs, ratings, swipe feedback, and quiz responses are stored in your account.
        </Text>
        <Text style={styles.body}>
          <Text style={styles.bold}>Device data.</Text> A device identifier and basic diagnostics are collected to deliver core features and prevent abuse.
        </Text>

        <Text style={styles.h2}>2. How We Use Your Information</Text>
        <Text style={styles.bullet}>•  To provide fragrance recommendations and personalized picks</Text>
        <Text style={styles.bullet}>•  To sync your wardrobe and wear history across devices</Text>
        <Text style={styles.bullet}>•  To improve our taste-profile model using anonymized swipe and wear data</Text>
        <Text style={styles.bullet}>•  To process subscription payments through the App Store</Text>

        <Text style={styles.h2}>3. Third-Party Services</Text>
        <Text style={styles.body}>
          We rely on the following third parties to operate the app. Each receives only the data necessary for the service it provides:
        </Text>
        <Text style={styles.bullet}>•  <Text style={styles.bold}>Supabase</Text> — backend storage and authentication</Text>
        <Text style={styles.bullet}>•  <Text style={styles.bold}>RevenueCat</Text> — subscription management</Text>
        <Text style={styles.bullet}>•  <Text style={styles.bold}>Apple / Google</Text> — sign-in and payment processing</Text>
        <Text style={styles.bullet}>•  <Text style={styles.bold}>PostHog</Text> — anonymous usage analytics</Text>
        <Text style={styles.bullet}>•  <Text style={styles.bold}>Sentry</Text> — anonymous crash reporting</Text>

        <Text style={styles.h2}>4. Data Retention</Text>
        <Text style={styles.body}>
          Your data is retained as long as your account is active. You may delete your account at any time from the Profile screen, which permanently removes all associated data including wardrobe entries, wear logs, swipes, quiz results, and ratings.
        </Text>

        <Text style={styles.h2}>5. Your Rights</Text>
        <Text style={styles.body}>
          You may request a copy of your data, request correction or deletion, and withdraw consent at any time. Contact us using the address below.
        </Text>

        <Text style={styles.h2}>6. Children's Privacy</Text>
        <Text style={styles.body}>
          Perfume Picks is not directed to children under 13. We do not knowingly collect information from anyone under 13.
        </Text>

        <Text style={styles.h2}>7. How to Delete Your Account</Text>
        <Text style={styles.body}>You may delete your account in two ways:</Text>
        <Text style={styles.bullet}>•  <Text style={styles.bold}>In-app:</Text> Profile → Delete Account.</Text>
        <Text style={styles.bullet}>•  <Text style={styles.bold}>By email:</Text> if you cannot access the app, email support@perfumepicks.app from your account email with the subject "Delete My Account". We will permanently remove your account within 7 days.</Text>

        <Text style={styles.h2}>8. Contact</Text>
        <Text style={styles.body}>
          For questions about this privacy policy or your data, contact us at: support@perfumepicks.app
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
