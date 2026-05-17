import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Alert } from '@/src/components/ui/StyledAlert';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import { Button } from '@/src/components/ui/Button';
import { COLORS, SPACING, RADIUS, FONTS, TYPE } from '@/src/constants/theme';
import { useProStore } from '@/src/stores/useProStore';
import { useRevenueCat } from '@/src/hooks/useRevenueCat';

type Plan = 'monthly' | 'yearly';

// ── 3 honest pillars — every claim maps to a real isPro check ──

const PILLARS = [
  {
    eyebrow: 'KNOW EVERY FRAGRANCE',
    cursive: 'go deep',
    icon: 'sparkles' as const,
    bullets: [
      { title: 'Cheaper alternatives & dupes', sub: 'Find lookalikes 30%+ cheaper, ranked by accord overlap.', lead: true },
      { title: 'Accord intensity + score tiles', sub: 'See exactly how loud each note is — and the compliments, versatility, and office-safe scores the community gives.' },
      { title: 'Who wears it', sub: 'Verified celebrity associations and the lore behind every bottle.' },
    ],
  },
  {
    eyebrow: 'TRACK EVERYTHING',
    cursive: 'never miss a wear',
    icon: 'bookmark' as const,
    bullets: [
      { title: 'Unlimited wardrobe, swipes & scans', sub: 'No 20-bottle cap. No 10-swipe-a-day limit. No 10-scan-a-day limit.', lead: true },
      { title: '9-question Precision Quiz', sub: 'Three free questions get you started — six more unlock your full taste profile.' },
      { title: 'Wrapped, badges & streaks', sub: 'Your year in fragrance, achievements as you log, and streak rewards.' },
    ],
  },
  {
    eyebrow: 'AI IN YOUR POCKET',
    cursive: 'your nose, smarter',
    icon: 'flask' as const,
    bullets: [
      { title: '"Why this?" explained', sub: 'Specific reasoning behind every daily pick — the exact notes and patterns we matched.', lead: true },
      { title: 'Perfume Concierge bottle scan', sub: 'Point your camera at any bottle and ID it instantly. Unlimited scans.' },
      { title: 'Layering pairs & taste profile', sub: 'Get layering suggestions and your full top-notes / top-accords / avoid list.' },
    ],
  },
];

export default function PaywallScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const insets = useSafeAreaInsets();
  const [selectedPlan, setSelectedPlan] = useState<Plan>('yearly');
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

  const yearlyPrice = yearlyPackage?.product.priceString ?? '$39.99';
  const monthlyPrice = monthlyPackage?.product.priceString ?? '$4.99';
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
      const success = await buy(pkg);
      if (success) {
        if (returnTo) router.replace(returnTo as any);
        else router.back();
      }
    } else {
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
      style={styles.screen}
      contentContainerStyle={{
        paddingTop: insets.top + SPACING.md,
        paddingBottom: insets.bottom + 40,
      }}
    >
      {/* Close */}
      <Pressable onPress={() => router.back()} hitSlop={12} style={styles.closeBtn}>
        <Ionicons name="close" size={24} color={COLORS.muted} />
      </Pressable>

      {/* Already Pro */}
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

      {/* ── 3 Pillar cards ── */}
      <View style={styles.pillars}>
        {PILLARS.map((pillar) => (
          <View key={pillar.eyebrow} style={styles.pillarCard}>
            <Text style={styles.pillarEyebrow}>{pillar.eyebrow}</Text>
            <Text style={styles.pillarCursive}>{pillar.cursive}</Text>

            <View style={styles.pillarBullets}>
              {pillar.bullets.map((bullet) => (
                <View key={bullet.title} style={styles.bulletRow}>
                  <Ionicons
                    name={pillar.icon}
                    size={(bullet as any).lead ? 24 : 18}
                    color={COLORS.accent}
                    style={{ marginTop: 2 }}
                  />
                  <View style={styles.bulletText}>
                    <Text style={styles.bulletTitle}>{bullet.title}</Text>
                    <Text style={styles.bulletSub}>{bullet.sub}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>

      {/* Plan cards + CTA */}
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
          <View style={styles.plans}>
            {/* Yearly */}
            <Pressable
              onPress={() => setSelectedPlan('yearly')}
              disabled={purchasing}
              style={[styles.planCard, selectedPlan === 'yearly' && styles.planCardSelected, purchasing && { opacity: 0.5 }]}
            >
              <View style={styles.planBadge}>
                <Text style={styles.planBadgeText}>BEST VALUE</Text>
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

            {/* Monthly */}
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

          {/* Pre-purchase disclosure */}
          <Text style={styles.preCtaDisclosure}>
            {selectedPlan === 'yearly'
              ? `Free for 7 days, then ${yearlyPrice}/year. Cancel anytime before trial ends.`
              : `Auto-renews at ${monthlyPrice}/month until canceled.`}
            {' '}Yearly plan includes a 7-day free trial.
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

  // ── Pillars ──
  pillars: {
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  pillarCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
  },
  pillarEyebrow: {
    ...TYPE.eyebrow,
    fontSize: 10,
    color: COLORS.muted,
    letterSpacing: 2.5,
  },
  pillarCursive: {
    fontFamily: 'PinyonScript_400Regular',
    fontSize: 18,
    color: COLORS.accent,
    paddingLeft: 6,
    marginTop: 2,
    marginBottom: SPACING.md,
  },
  pillarBullets: {
    gap: SPACING.md,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  bulletText: {
    flex: 1,
  },
  bulletTitle: {
    fontFamily: FONTS.serif,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  bulletSub: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: COLORS.muted,
    marginTop: 2,
    lineHeight: 18,
  },

  // ── Plans ──
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
  },
  planBadge: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.full,
    paddingVertical: 3,
    paddingHorizontal: 10,
    marginBottom: SPACING.xs,
  },
  planBadgeText: {
    fontFamily: FONTS.body,
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.white,
    letterSpacing: 1,
  },
  planPrice: {
    fontFamily: 'CormorantGaramond_400Regular',
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.text,
  },
  planPeriod: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: COLORS.muted,
    marginTop: 2,
  },
  planSavings: {
    fontFamily: FONTS.body,
    fontSize: 11,
    color: COLORS.accent,
    marginTop: 4,
  },
  planPerMonth: {
    fontFamily: FONTS.body,
    fontSize: 11,
    color: COLORS.subtle,
    marginTop: 2,
    textAlign: 'center',
  },
  preCtaDisclosure: {
    fontFamily: FONTS.body,
    fontSize: 11,
    color: COLORS.subtle,
    textAlign: 'center',
    marginTop: SPACING.md,
  },

  // ── Guest / Restore / Legal ──
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
    fontFamily: FONTS.body,
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
    fontFamily: FONTS.body,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.muted,
  },
  legal: {
    fontFamily: FONTS.body,
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
    fontFamily: FONTS.body,
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
    fontFamily: FONTS.serif,
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
  alreadyProBody: {
    fontFamily: FONTS.body,
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
    fontFamily: FONTS.body,
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
    fontFamily: FONTS.body,
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
    fontFamily: FONTS.body,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.accent,
    letterSpacing: 1,
  },
});
