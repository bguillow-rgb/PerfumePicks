import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Alert } from '@/src/components/ui/StyledAlert';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { getCurrentUser } from '@/src/stores/useAuthStore';
import { Button } from '@/src/components/ui/Button';
import { COLORS, SPACING, RADIUS } from '@/src/constants/theme';
import { FREE_WARDROBE_CAP } from '@/src/lib/limits';
import { FREE_DAILY_SWIPE_LIMIT } from '@/src/stores/useSwipeStore';
import { useProStore } from '@/src/stores/useProStore';
import { useRevenueCat } from '@/src/hooks/useRevenueCat';
import { PromoCodeSheet } from '@/src/components/pro/PromoCodeSheet';
import { track, EVENTS } from '@/src/lib/observability';

type Plan = 'monthly' | 'yearly';

// Copy is tight on purpose. Users scan, not read. Each bullet earns its spot
// by naming the one thing that distinguishes Pro from free and from other apps.
// Lead with the two features that have real dollar/habit ROI (dupes + training),
// then the supporting features. Never list "unlimited X" as the primary pitch —
// that frames Pro as limit-removal rather than genuine added value.
// Order matters. Dupes lead: it is the only bullet with a dollar figure attached,
// and the only one a collector can do math on. DNA is LAST and reframed as depth
// rather than access — the DNA itself is free and 87% of users have already
// finished theirs, so leading with it told a reader the list was padded before
// they reached anything they didn't already have (2026-07-16).
//
// The old bullet 1 ("A Living Fragrance DNA", free) and bullet 4 ("Your Full
// Scent Profile", Pro) described the same feature twice. Merged into one.
const FEATURES = [
  {
    icon: 'pricetags-outline' as const,
    title: 'Find Cheaper Dupes Instantly',
    desc: "We match on accords, not marketing copy. Open any bottle and you'll see how close the nearest dupe is and what you'd save, usually 30 to 70 percent. Pro tells you which bottle it is.",
  },
  {
    icon: 'sparkles-outline' as const,
    title: 'Unlimited Train My Nose',
    desc: `Every swipe teaches your DNA something. Free gets ${FREE_DAILY_SWIPE_LIMIT} a day. Pro doesn't stop.`,
  },
  {
    icon: 'rose-outline' as const,
    title: 'Unlimited Wardrobe',
    desc: `Free holds ${FREE_WARDROBE_CAP} fragrances. Pro holds everything: bottles, decants, samples, the ones you want, the ones you tried once and passed on.`,
  },
  {
    icon: 'finger-print-outline' as const,
    title: 'Your Fragrance DNA, In Full',
    desc: "The DNA itself is free and keeps sharpening every time you wear or swipe. Pro shows the parts underneath: every accord broken out, the houses you keep returning to, and the notes you've ruled out.",
  },
];

export default function PaywallScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const insets = useSafeAreaInsets();
  const [selectedPlan, setSelectedPlan] = useState<Plan>('yearly');
  const [promoOpen, setPromoOpen] = useState(false);
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
    setIsGuest(getCurrentUser()?.is_anonymous ?? true);
  }, []);

  // Fire PAYWALL_VIEWED once per mount. Previously the entire monetization
  // funnel was uninstrumented (0 call sites), so paywall_viewed read 0 since
  // launch even though the screen is reachable from 6+ entry points.
  useEffect(() => {
    track(EVENTS.PAYWALL_VIEWED, { initial_plan: selectedPlan, return_to: returnTo ?? null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Locked launch pricing for Perfume Picks: $2.99/mo, $24.99/yr (7-day
  // free trial). These fallbacks must match the App Store Connect product
  // prices so the paywall and Apple purchase sheet never show different
  // numbers. DO NOT iterate post-spec — paywall pricing oscillation was
  // a documented source of late-stage churn in StickPicks.
  const yearlyPrice = yearlyPackage?.product.priceString ?? '$24.99';
  const monthlyPrice = monthlyPackage?.product.priceString ?? '$2.99';
  // Per-month equivalent of the annual plan — Apple 3.1.2(a) requires this
  // to be shown alongside the annual price.
  const yearlyPerMonth = yearlyPackage
    ? `$${(yearlyPackage.product.price / 12).toFixed(2)}/month billed annually`
    : '$2.08/month billed annually';

  // Whether RevenueCat actually returned purchasable products. When false we
  // must NOT present a live Subscribe button over the hardcoded fallback
  // prices — tapping it can only fail (Apple 2.1 rejection risk). Show a retry.
  const packagesAvailable = !!(yearlyPackage || monthlyPackage);

  async function handlePurchase() {
    // §5.1.1(v) — guests must be able to purchase without signing in first.
    // RevenueCat binds anonymous purchases to $RCAnonymousID; the entitlement
    // still activates. Sign-in is offered below as an optional sync step.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const pkg = selectedPlan === 'yearly' ? yearlyPackage : monthlyPackage;

    if (!pkg && rcError) {
      // RC errored on load — retry once silently before giving up
      await rcRetry();
    }
    const freshPkg = selectedPlan === 'yearly' ? yearlyPackage : monthlyPackage;
    if (freshPkg) {
      track(EVENTS.PRO_PURCHASE_STARTED, { plan: selectedPlan });
      const result = await buy(freshPkg);
      if (result.outcome === 'purchased') {
        track(EVENTS.PRO_PURCHASE_COMPLETED, { plan: selectedPlan });
        if (returnTo) router.replace(returnTo as any);
        else router.back();
      } else if (result.outcome === 'cancelled') {
        // User backed out of the StoreKit sheet — a choice, not a failure.
        track(EVENTS.PRO_PURCHASE_CANCELLED, { plan: selectedPlan });
      } else {
        // Genuine problem: 'error' (StoreKit/RC error, code preserved) or
        // 'not_entitled' (returned without an active entitlement).
        track(EVENTS.PRO_PURCHASE_FAILED, {
          plan: selectedPlan,
          reason: result.outcome,
          ...(result.outcome === 'error' ? { code: result.code, message: result.message } : {}),
        });
      }
    } else {
      track(EVENTS.PRO_PURCHASE_FAILED, { plan: selectedPlan, reason: 'no_package' });
      Alert.alert('Unavailable', 'Subscriptions are not available right now. Check your connection and try again.');
    }
  }

  async function handleRestore() {
    // §5.1.1(v) — Restore must work for guests. RC restores anonymous
    // purchases tied to the same Apple ID without requiring app-side accounts.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    if (yearlyPackage || monthlyPackage) {
      track(EVENTS.PRO_RESTORE_STARTED, {});
      const success = await restore();
      track(EVENTS.PRO_RESTORE_COMPLETED, { result: success ? 'success' : 'no_purchase_found' });
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
      testID="paywall-screen"
      style={[styles.screen]}
      // Regular stack push (not a modal) — add insets.top so the close X and
      // header clear the status bar / notch.
      contentContainerStyle={{
        paddingTop: insets.top + SPACING.md,
        paddingBottom: insets.bottom + 40,
      }}
    >
      {/* Close */}
      <Pressable onPress={() => router.back()} hitSlop={12} style={styles.closeBtn} accessibilityLabel="Close">
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


      {/* Header */}
      <Text style={styles.header}>Perfume Picks Pro</Text>
      <Text style={styles.subheader}>Your Fragrance DNA. Cheaper dupes. A sharper nose.</Text>

      {/* Pitch — one sentence, named differentiators only. Users scan paywalls
          rather than read them; we frontload the two claims no competitor can
          make and let the bullets do the rest. */}
      <View style={styles.pitchCard}>
        <Text style={styles.pitchHeadline}>
          The only app that learns your taste into a Fragrance DNA, then finds you cheaper bottles that smell just as good.
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
                  : 'Save 30%'}
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

          {/* CTA — when RC failed to return products, show a retry instead of a
              live Subscribe button that can only fail. */}
          {packagesAvailable ? (
            <Button
              title={purchasing
                ? 'Processing...'
                : selectedPlan === 'yearly'
                  ? `Try Free for 7 Days, then ${yearlyPrice}/yr`
                  : `Start Pro · ${monthlyPrice}/mo`
              }
              onPress={handlePurchase}
              disabled={purchasing}
              loading={purchasing}
              style={{ marginTop: SPACING.xs }}
            />
          ) : (
            <>
              <Text style={styles.preCtaDisclosure}>
                Subscriptions couldn’t be loaded. Check your connection and try again.
              </Text>
              <Button
                title={rcLoading ? 'Loading…' : 'Retry'}
                onPress={() => rcRetry()}
                disabled={rcLoading}
                loading={rcLoading}
                style={{ marginTop: SPACING.xs }}
              />
            </>
          )}

          {/* §5.1.1(v) — sign-in is optional, never a gate. Guests can purchase
              above; this hint just explains the cross-device sync benefit. */}
          {isGuest && (
            <Pressable onPress={() => router.push('/auth/login')} style={styles.guestSyncHint}>
              <Text style={styles.guestSyncHintText}>
                Sign in to sync your membership across devices (optional)
              </Text>
            </Pressable>
          )}
        </>
      )}

      <Pressable onPress={handleRestore} style={styles.restoreBtn}>
        <Text style={styles.restoreText}>Restore Purchase</Text>
      </Pressable>

      <Pressable onPress={() => setPromoOpen(true)} style={styles.restoreBtn} testID="paywall-promo">
        <Text style={styles.restoreText}>Have a promo code?</Text>
      </Pressable>

      <PromoCodeSheet
        visible={promoOpen}
        entry="paywall"
        onClose={() => setPromoOpen(false)}
        onRedeemed={() => { setPromoOpen(false); router.back(); }}
      />

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
          <Text style={styles.legalLink}>Terms of Use</Text>
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
  guestSyncHint: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    marginTop: SPACING.xs,
  },
  guestSyncHintText: {
    fontFamily: 'CormorantGaramond_400Regular',
    fontSize: 12,
    color: COLORS.muted,
    textDecorationLine: 'underline',
    textAlign: 'center',
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
