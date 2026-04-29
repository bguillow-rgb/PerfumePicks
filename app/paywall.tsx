import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Alert } from '@/src/components/ui/StyledAlert';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import { Button } from '@/src/components/ui/Button';
import { COLORS, SPACING, RADIUS } from '@/src/constants/theme';
import { useProStore } from '@/src/stores/useProStore';
import { useRevenueCat } from '@/src/hooks/useRevenueCat';

type Plan = 'monthly' | 'yearly';

// Copy is tight on purpose. Users scan, not read. Each bullet earns its spot
// by naming the one thing that distinguishes Pro from free and from other apps.
const FEATURES = [
  {
    icon: 'sparkles-outline' as const,
    title: 'Unlimited Train My Nose',
    desc: 'Sharpen your taste with unlimited swipes — free is 10 per day.',
  },
  {
    icon: 'flask-outline' as const,
    title: '9-Question Precision Quiz',
    desc: 'Ten matches scored against your palate. Free is 3 questions, 3 picks.',
  },
  {
    icon: 'rose-outline' as const,
    title: 'Unlimited Wardrobe',
    desc: 'Track every bottle, decant and sample with mL meters and reorder alerts.',
  },
  {
    icon: 'analytics-outline' as const,
    title: 'Taste Profile Insights',
    desc: 'See your top notes, accords, and avoid list — your scent identity at a glance.',
  },
  {
    icon: 'pricetags-outline' as const,
    title: 'Dupes & Decant Intelligence',
    desc: 'Find lookalikes 30%+ cheaper, plus best-value mL across every retailer.',
  },
  {
    icon: 'sunny-outline' as const,
    title: 'Wear Today + Layering',
    desc: 'A daily pick tuned to weather, season and occasion — and pairs that layer well.',
  },
];

export default function PaywallScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const insets = useSafeAreaInsets();
  const [selectedPlan, setSelectedPlan] = useState<Plan>('yearly');
  // Default true so the purchase button is safely gated until the async
  // auth check resolves — prevents a race where a guest taps Purchase
  // before we know they're anonymous.
  const [isGuest, setIsGuest] = useState(true);
  const activate = useProStore((s) => s.activate);
  const isPro = useProStore((s) => s.isPro);
  const {
    monthlyPackage,
    yearlyPackage,
    loading: rcLoading,
    loadError: rcError,
    retry: rcRetry,
    purchasing,
    buy,
    restore,
  } = useRevenueCat();

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setIsGuest(data.user?.is_anonymous ?? true);
    })();
  }, []);

  // Locked launch pricing for Perfume Picks: $4.99/mo, $39.99/yr (7-day
  // free trial). These fallbacks must match the App Store Connect product
  // prices so the paywall and Apple purchase sheet never show different
  // numbers. DO NOT iterate post-spec — paywall pricing oscillation was
  // a documented source of late-stage churn in StickPicks.
  const yearlyPrice = yearlyPackage?.product.priceString ?? '$39.99';
  const monthlyPrice = monthlyPackage?.product.priceString ?? '$4.99';
  // Per-month equivalent of the annual plan — Apple 3.1.2(a) requires this
  // to be shown alongside the annual price.
  const yearlyPerMonth = yearlyPackage
    ? `$${(yearlyPackage.product.price / 12).toFixed(2)}/month billed annually`
    : '$3.33/month billed annually';

  async function handlePurchase() {
    if (isGuest) {
      Alert.alert(
        'Account Required',
        'Create an account or sign in to subscribe to Pro. Your purchase will be linked to your account.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign In', onPress: () => router.push('/auth/login?returnTo=/paywall') },
        ]
      );
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const pkg = selectedPlan === 'yearly' ? yearlyPackage : monthlyPackage;

    if (pkg) {
      // Real RevenueCat purchase
      const success = await buy(pkg);
      if (success) {
        if (returnTo) router.replace(returnTo as any);
        else router.back();
      }
    } else {
      // No packages available — RevenueCat not configured or no network
      Alert.alert('Unavailable', 'Subscriptions are not available right now. Please try again later.');
    }
  }

  async function handleRestore() {
    if (isGuest) {
      Alert.alert(
        'Account Required',
        'Sign in to restore a previous purchase.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign In', onPress: () => router.push('/auth/login') },
        ]
      );
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    if (yearlyPackage || monthlyPackage) {
      const success = await restore();
      if (success) {
        if (returnTo) router.replace(returnTo as any);
        else router.back();
      }
    } else {
      Alert.alert('Unavailable', 'Restore is not available right now. Please try again later.');
    }
  }

  return (
    <ScrollView
      style={[styles.screen]}
      // Regular stack push (not a modal) — add insets.top so the close X and
      // header clear the status bar / notch.
      contentContainerStyle={{
        paddingTop: insets.top + SPACING.md,
        paddingBottom: insets.bottom + 40,
      }}
    >
      {/* Close */}
      <Pressable onPress={() => router.back()} hitSlop={12} style={styles.closeBtn}>
        <Ionicons name="close" size={24} color={COLORS.muted} />
      </Pressable>

      {/* Already Pro state */}
      {isPro && (
        <View style={styles.alreadyProBox}>
          <Ionicons name="sparkles" size={32} color={COLORS.accent} />
          <Text style={styles.alreadyProTitle}>You're on Perfume Picks Pro</Text>
          <Text style={styles.alreadyProBody}>
            All features are unlocked. Manage your subscription in your Apple ID account settings.
          </Text>
          <Pressable style={styles.alreadyProBtn} onPress={() => router.back()}>
            <Text style={styles.alreadyProBtnText}>Got it</Text>
          </Pressable>
        </View>
      )}

      {/* Guest banner */}
      {isGuest && (
        <Pressable onPress={() => router.push('/auth/login')} style={styles.guestBanner}>
          <Ionicons name="person-outline" size={16} color={COLORS.accent} />
          <Text style={styles.guestBannerText}>Sign in or create an account to subscribe</Text>
          <Ionicons name="chevron-forward" size={14} color={COLORS.accent} />
        </Pressable>
      )}

      {/* Header */}
      <Text style={styles.header}>Perfume Picks Pro</Text>
      <Text style={styles.subheader}>Your personal fragrance concierge</Text>

      {/* Social proof */}
      <View style={styles.socialProof}>
        <Text style={styles.socialRating}>★★★★★</Text>
        <Text style={styles.socialRatingText}>Loved by fragrance enthusiasts</Text>
      </View>

      {/* Pitch — one sentence, named differentiators only. Users scan paywalls
          rather than read them; we frontload the two claims no competitor can
          make and let the bullets do the rest. */}
      <View style={styles.pitchCard}>
        <Text style={styles.pitchHeadline}>
          The only fragrance app that learns your nose — and finds the dupes.
        </Text>
      </View>

      {/* Features */}
      <View style={styles.features}>
        {FEATURES.map((f) => (
          <View key={f.title} style={styles.featureRow}>
            <Ionicons name={f.icon} size={22} color={COLORS.accent} />
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>{f.title}</Text>
              <Text style={styles.featureDesc}>{f.desc}</Text>
            </View>
          </View>
        ))}
      </View>

      {rcLoading ? (
        <ActivityIndicator color={COLORS.accent} style={{ marginVertical: SPACING.lg }} />
      ) : rcError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>Couldn't load subscription options.</Text>
          <Pressable onPress={rcRetry} style={styles.retryBtn}>
            <Text style={styles.retryText}>Try Again</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {/* Plan selection */}
          <View style={styles.plans}>
            <Pressable
              onPress={() => setSelectedPlan('yearly')}
              disabled={purchasing}
              style={[styles.planCard, selectedPlan === 'yearly' && styles.planCardSelected, purchasing && { opacity: 0.5 }]}
            >
              <View style={styles.planBadge}>
                <Text style={styles.planBadgeText}>BEST VALUE</Text>
              </View>
              <View style={styles.trialBadge}>
                <Text style={styles.trialBadgeText}>7-DAY FREE TRIAL</Text>
              </View>
              <Text style={styles.planPrice}>{yearlyPrice}</Text>
              <Text style={styles.planPeriod}>per year</Text>
              <Text style={styles.planPerMonth}>{yearlyPerMonth}</Text>
              <Text style={styles.planSavings}>
                {yearlyPackage && monthlyPackage
                  ? `Save ${Math.round((1 - yearlyPackage.product.price / (monthlyPackage.product.price * 12)) * 100)}%`
                  : 'Save 33%'}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setSelectedPlan('monthly')}
              disabled={purchasing}
              style={[styles.planCard, selectedPlan === 'monthly' && styles.planCardSelected, purchasing && { opacity: 0.5 }]}
            >
              <Text style={styles.planPrice}>{monthlyPrice}</Text>
              <Text style={styles.planPeriod}>per month</Text>
              <Text style={styles.planSavings}>Cancel anytime</Text>
            </Pressable>
          </View>

          {/* Pre-purchase disclosure — Apple 3.1.2(a) requires this BEFORE the CTA. */}
          <Text style={styles.preCtaDisclosure}>
            {selectedPlan === 'yearly'
              ? `Free for 7 days, then ${yearlyPrice}/year. Cancel anytime before trial ends.`
              : `Auto-renews at ${monthlyPrice}/month until canceled.`}
          </Text>

          {/* CTA */}
          <Button
            title={purchasing
              ? 'Processing...'
              : selectedPlan === 'yearly'
                ? `Try Free for 7 Days — then ${yearlyPrice}/yr`
                : `Start Pro — ${monthlyPrice}/mo`
            }
            onPress={handlePurchase}
            disabled={purchasing}
            loading={purchasing}
            style={{ marginTop: SPACING.xs }}
          />
        </>
      )}

      <Pressable onPress={handleRestore} style={styles.restoreBtn}>
        <Text style={styles.restoreText}>Restore Purchase</Text>
      </Pressable>

      <Text style={styles.legal}>
        Payment will be charged to your Apple ID account at confirmation of purchase.
        Subscription automatically renews unless canceled at least 24 hours before the end of the current period.
        Subscriptions may be managed and auto-renewal may be turned off in your Account Settings after purchase.
      </Text>

      <View style={styles.legalLinks}>
        <Pressable onPress={() => router.push('/legal/privacy')}>
          <Text style={styles.legalLink}>Privacy Policy</Text>
        </Pressable>
        <Text style={styles.legalDot}>{'\u00B7'}</Text>
        <Pressable onPress={() => router.push('/legal/terms')}>
          <Text style={styles.legalLink}>Terms of Service</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingHorizontal: SPACING.md,
  },
  closeBtn: {
    alignSelf: 'flex-end',
    marginBottom: SPACING.sm,
  },
  header: {
    fontFamily: 'CormorantGaramond_400Regular',
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.accent,
    textAlign: 'center',
  },
  subheader: {
    fontFamily: 'CormorantGaramond_400Regular',
    fontSize: 16,
    color: COLORS.muted,
    textAlign: 'center',
    marginTop: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  socialProof: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
    gap: 2,
  },
  socialRating: {
    fontSize: 18,
    color: COLORS.accent,
    letterSpacing: 3,
  },
  socialRatingText: {
    fontFamily: 'CormorantGaramond_400Regular',
    fontSize: 13,
    color: COLORS.muted,
    fontStyle: 'italic',
  },
  // Pitch card frames the two-sentence sell above the features grid. Gold
  // border on dark-green card echoes the section-title treatment from the
  // cigar detail page — reads as editorial, not marketing.
  pitchCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  pitchHeadline: {
    fontFamily: 'CormorantGaramond_400Regular',
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    lineHeight: 24,
  },
  features: {
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontFamily: 'CormorantGaramond_400Regular',
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  featureDesc: {
    fontFamily: 'CormorantGaramond_400Regular',
    fontSize: 13,
    color: COLORS.muted,
    marginTop: 2,
  },
  plans: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  planCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    padding: SPACING.md,
    alignItems: 'center',
  },
  planCardSelected: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.card,
  },
  planBadge: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.full,
    paddingVertical: 3,
    paddingHorizontal: 10,
    marginBottom: SPACING.xs,
  },
  planBadgeText: {
    fontFamily: 'CormorantGaramond_400Regular',
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.white,
    letterSpacing: 1,
  },
  trialBadge: {
    backgroundColor: COLORS.blushSoft ?? '#f5ede8',
    borderRadius: RADIUS.full,
    paddingVertical: 3,
    paddingHorizontal: 10,
    marginBottom: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  trialBadgeText: {
    fontFamily: 'CormorantGaramond_400Regular',
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.accent,
    letterSpacing: 1,
  },
  planPrice: {
    fontFamily: 'CormorantGaramond_400Regular',
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.text,
  },
  planPeriod: {
    fontFamily: 'CormorantGaramond_400Regular',
    fontSize: 13,
    color: COLORS.muted,
    marginTop: 2,
  },
  planSavings: {
    fontFamily: 'CormorantGaramond_400Regular',
    fontSize: 11,
    color: COLORS.accent,
    marginTop: 4,
  },
  planPerMonth: {
    fontFamily: 'CormorantGaramond_400Regular',
    fontSize: 11,
    color: COLORS.subtle,
    marginTop: 2,
    textAlign: 'center',
  },
  preCtaDisclosure: {
    fontFamily: 'CormorantGaramond_400Regular',
    fontSize: 11,
    color: COLORS.subtle,
    textAlign: 'center',
    marginTop: SPACING.md,
  },
  guestBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingVertical: 10,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },
  guestBannerText: {
    fontFamily: 'CormorantGaramond_400Regular',
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.accent,
  },
  restoreBtn: {
    alignItems: 'center',
    marginTop: SPACING.md,
    paddingVertical: 12,
  },
  restoreText: {
    fontFamily: 'CormorantGaramond_400Regular',
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.muted,
  },
  legal: {
    fontFamily: 'CormorantGaramond_400Regular',
    fontSize: 11,
    color: COLORS.subtle,
    textAlign: 'center',
    marginTop: SPACING.sm,
    lineHeight: 16,
  },
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.sm,
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  legalLink: {
    fontFamily: 'CormorantGaramond_400Regular',
    fontSize: 11,
    color: COLORS.muted,
    textDecorationLine: 'underline',
  },
  legalDot: {
    color: COLORS.subtle,
    fontSize: 11,
  },
  alreadyProBox: {
    alignItems: 'center',
    padding: SPACING.xl,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.accent,
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
  },
  alreadyProTitle: {
    fontFamily: 'CormorantGaramond_400Regular',
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
  alreadyProBody: {
    fontFamily: 'CormorantGaramond_400Regular',
    fontSize: 14,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  alreadyProBtn: {
    backgroundColor: COLORS.accent,
    paddingVertical: 12,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADIUS.full,
    marginTop: SPACING.sm,
  },
  alreadyProBtnText: {
    fontFamily: 'CormorantGaramond_400Regular',
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.white,
    letterSpacing: 1,
  },
  errorBox: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    gap: SPACING.md,
  },
  errorText: {
    fontFamily: 'CormorantGaramond_400Regular',
    fontSize: 15,
    color: COLORS.muted,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderRadius: RADIUS.full,
    paddingVertical: 10,
    paddingHorizontal: 28,
  },
  retryText: {
    fontFamily: 'CormorantGaramond_400Regular',
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.accent,
    letterSpacing: 1,
  },
});
