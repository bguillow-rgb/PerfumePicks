import { Text, View, Image, StyleSheet, Pressable, Modal } from 'react-native';
import { useEffect, useState } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING, TYPE, RADIUS, FONTS } from '@/src/constants/theme';
import { useProfileStore } from '@/src/stores/useProfileStore';
import { resolveAvatarUri } from '@/src/lib/profilePhoto';
import { useSwipeStore, FREE_DAILY_SWIPE_LIMIT } from '@/src/stores/useSwipeStore';
import { useProStore } from '@/src/stores/useProStore';
import { useRetailerLinksStore } from '@/src/stores/useRetailerLinksStore';
import { useNotificationStore } from '@/src/stores/useNotificationStore';
import { useSessionStore } from '@/src/stores/useSessionStore';
import { useTasteProfileStore } from '@/src/stores/useTasteProfileStore';
import { useCompareStore } from '@/src/stores/useCompareStore';
import { FeedbackBubble } from '@/src/components/feedback/FeedbackBubble';
import {
  requestNotificationPermission,
  registerPushToken,
  ensurePushRegistered,
  scheduleSotdNotification,
  scheduleAddBottlesNotification,
} from '@/src/lib/notifications';
import { resolveCheckout2Flag } from '@/src/lib/checkout2Flag';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, color, size }: { name: IoniconsName; color: string; size: number }) {
  return <Ionicons name={name} size={size} color={color} />;
}

/**
 * Profile tab icon — circular avatar with a champagne-gold ring.
 *
 * Active state thickens the ring (replaces the "tint color" feedback line
 * icons get for free). When the user uploads a photo, swap in the URI;
 * otherwise show a cursive monogram in champagne on soft blush.
 *
 * Sized at 26px so it carries the same visual weight as the surrounding
 * line icons — bigger and it looks like a sticker pasted onto the bar.
 */
function ProfileTabIcon({ focused }: { focused: boolean }) {
  // Read live from the persisted profile store so the avatar updates the
  // moment the user picks a new photo (or clears it back to monogram).
  const photoUri = useProfileStore((s) => s.photoUri);
  const monogram = useProfileStore((s) => s.getMonogram());
  const imageUri = resolveAvatarUri(photoUri);
  const size = 26;
  return (
    <View
      style={[
        profileIcon.ring,
        {
          width: size + 4,
          height: size + 4,
          borderRadius: (size + 4) / 2,
          borderWidth: focused ? 1.5 : 1,
          borderColor: focused ? COLORS.accent : COLORS.muted,
        },
      ]}
    >
      <View style={[profileIcon.disc, { width: size, height: size, borderRadius: size / 2 }]}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={{ width: '100%', height: '100%', borderRadius: size / 2 }} />
        ) : monogram === '?' ? (
          // No name yet — a clean person glyph reads better than a cursive "?".
          <Ionicons name="person" size={size * 0.62} color={COLORS.accent} />
        ) : (
          <Text style={[profileIcon.monogram, { fontSize: size * 0.6, lineHeight: size * 0.95 }]}>
            {monogram}
          </Text>
        )}
      </View>
    </View>
  );
}

const profileIcon = StyleSheet.create({
  ring: { alignItems: 'center', justifyContent: 'center' },
  disc: {
    backgroundColor: COLORS.blushSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  monogram: {
    fontFamily: 'PinyonScript_400Regular',
    color: COLORS.accent,
    textAlign: 'center',
    lineHeight: undefined, // let React Native auto-size so ascenders don't clip
  },
});

function TrainTabIcon({ focused }: { focused: boolean }) {
  const size = 32;
  return (
    <View
      style={[
        trainIcon.disc,
        { width: size, height: size, borderRadius: size / 2 },
        focused ? trainIcon.discActive : trainIcon.discInactive,
      ]}
    >
      <Ionicons
        name={focused ? 'heart' : 'heart-outline'}
        size={22}
        color={focused ? COLORS.white : COLORS.accent}
      />
    </View>
  );
}

const trainIcon = StyleSheet.create({
  disc: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  discInactive: {
    backgroundColor: COLORS.card,
    borderWidth: 1.25,
    borderColor: COLORS.accent,
  },
  discActive: {
    backgroundColor: COLORS.accent,
    borderWidth: 1.25,
    borderColor: COLORS.accent,
  },
});

/**
 * Floating camera button — visible on all main tabs.
 * 56px gold disc, camera icon, absolute bottom-right.
 * Tap → open /scan (Perfume Concierge).
 */
function ScanFAB() {
  const router = useRouter();
  return (
    <Pressable
      style={({ pressed }) => [fabStyles.btn, pressed && { opacity: 0.8, transform: [{ scale: 0.96 }] }]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        router.push('/scan');
      }}
      accessibilityLabel="Scan a bottle"
      accessibilityRole="button"
    >
      <Ionicons name="camera" size={24} color={COLORS.white} />
    </Pressable>
  );
}

const fabStyles = StyleSheet.create({
  btn: {
    position: 'absolute',
    bottom: 80,
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.black,
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    zIndex: 100,
  },
});

/**
 * Floating compare pill — bottom-left, visible on all tabs ONLY while the
 * compare tray holds ≥1 fragrance. The tray is otherwise reachable only via the
 * "View" button on a detail page, so a user who queues bottles and navigates
 * away loses access. This persistent affordance fixes that. Dark pill + gold
 * count badge differentiate it from the gold round Scan FAB on the right.
 */
function CompareFAB() {
  const router = useRouter();
  const count = useCompareStore((s) => s.ids.length);
  if (count < 1) return null;
  return (
    <Pressable
      style={({ pressed }) => [compareFab.pill, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push('/compare' as any);
      }}
      accessibilityRole="button"
      accessibilityLabel={`Open compare, ${count} selected`}
    >
      <Ionicons name="git-compare-outline" size={18} color={COLORS.white} />
      <Text style={compareFab.label}>Compare</Text>
      <View style={compareFab.badge}>
        <Text style={compareFab.badgeText}>{count}</Text>
      </View>
    </Pressable>
  );
}

const compareFab = StyleSheet.create({
  pill: {
    position: 'absolute',
    bottom: 80,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 44,
    paddingLeft: 14,
    paddingRight: 10,
    borderRadius: 22,
    backgroundColor: COLORS.text,
    shadowColor: COLORS.black,
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    zIndex: 100,
  },
  label: {
    fontFamily: FONTS.serif,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
    letterSpacing: 0.3,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontFamily: FONTS.serif,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.white,
    lineHeight: 16,
  },
});

export default function TabLayout() {
  const isPro = useProStore((s) => s.isPro);
  const loadRetailerLinks = useRetailerLinksStore((s) => s.load);
  useEffect(() => { loadRetailerLinks(); }, []);
  const dailySwipeCount = useSwipeStore((s) => s.dailySwipeCount);
  const dailySwipeDate = useSwipeStore((s) => s.dailySwipeDate);

  // ── Notification onboarding prompt ──────────────────────────────────────
  const userId = useSessionStore((s) => s.userId);
  const dna = useTasteProfileStore((s) => s.dna);
  const onboardingPromptShown = useNotificationStore((s) => s.onboardingPromptShown);
  const setOnboardingPromptShown = useNotificationStore((s) => s.setOnboardingPromptShown);
  const [showNotifPrompt, setShowNotifPrompt] = useState(false);

  useEffect(() => {
    // Ask AFTER the value moment, not on cold launch. The prompt used to fire
    // 1.2s after the home tab loaded for anyone with a session — before the user
    // had felt anything the notification delivers, which torched the accept rate.
    // Now it waits until they have a Fragrance DNA (so they've been through the
    // reveal and are looking at their first Scent of the Day), then asks in terms
    // of that: "want tomorrow's pick?" The delay lets the SOTD settle on screen.
    if (userId && dna && !onboardingPromptShown) {
      const timer = setTimeout(() => setShowNotifPrompt(true), 2500);
      return () => clearTimeout(timer);
    }
  }, [userId, dna, onboardingPromptShown]);

  // Build the reachable audience on every launch. Requests PROVISIONAL push
  // authorization, which iOS grants SILENTLY for the undetermined majority (no
  // prompt), then registers the token — so a user gets quiet daily SOTD
  // notifications without ever tapping "Allow". This is the fix for "only 1 person
  // opted in": nearly everyone is still OS-undetermined (the soft pre-prompt gated
  // the real dialog), so this converts them into reachable tokens. No-op for users
  // who already granted or explicitly denied. Idempotent.
  useEffect(() => {
    if (!userId) return;
    void ensurePushRegistered();
  }, [userId]);

  // Checkout 2.0 launch gate (plans/PRD-checkout-2.0.md): resolve the
  // checkout_2_enabled app_settings row once at start (+ re-check on
  // foreground, inside the resolver) so the Buy handler's synchronous read is
  // warm before anyone reaches a buy button. Fails closed → product page.
  useEffect(() => {
    resolveCheckout2Flag();
  }, []);

  const handleNotifAccept = async () => {
    setShowNotifPrompt(false);
    setOnboardingPromptShown();
    const granted = await requestNotificationPermission();
    if (granted) {
      await registerPushToken(); // server push (reaches lapsed users)
      await scheduleSotdNotification(); // local 8am (belt-and-suspenders on-device)
      await scheduleAddBottlesNotification();
    }
  };

  const handleNotifDecline = () => {
    setShowNotifPrompt(false);
    setOnboardingPromptShown();
  };

  // Compute remaining swipes for the Train badge (free users only)
  const today = new Date().toLocaleDateString('en-CA');
  const usedToday = dailySwipeDate === today ? dailySwipeCount : 0;
  const remaining = FREE_DAILY_SWIPE_LIMIT - usedToday;
  const trainBadge = !isPro && remaining < FREE_DAILY_SWIPE_LIMIT && remaining > 0
    ? remaining
    : undefined;

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: COLORS.accent,
          tabBarInactiveTintColor: COLORS.muted,
          tabBarStyle: {
            backgroundColor: COLORS.card,
            borderTopColor: COLORS.border,
            borderTopWidth: 0.5,
          },
          tabBarItemStyle: {
            flex: 1,
            paddingHorizontal: 0,
          },
          tabBarLabelStyle: {
            fontFamily: 'Cormorant',
            fontSize: 10,
            fontWeight: '600',
            includeFontPadding: false,
            textAlign: 'center',
          },
        }}
        screenListeners={{
          tabPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Today',
            tabBarButtonTestID: 'tab-today',
            tabBarIcon: ({ color, size }) => <TabIcon name="sparkles-outline" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="discover"
          options={{
            title: 'Discover',
            tabBarButtonTestID: 'tab-discover',
            tabBarIcon: ({ color, size }) => <TabIcon name="search-outline" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="train"
          options={{
            title: 'Taste',
            tabBarButtonTestID: 'tab-taste',
            tabBarIcon: ({ focused }) => <TrainTabIcon focused={focused} />,
            tabBarBadge: trainBadge,
            tabBarBadgeStyle: {
              backgroundColor: COLORS.blush,
              color: COLORS.white,
              fontSize: 10,
              minWidth: 18,
              height: 18,
              lineHeight: 18,
            },
            tabBarLabelStyle: {
              fontFamily: 'Cormorant',
              fontSize: 10,
              fontWeight: '600',
              includeFontPadding: false,
              textAlign: 'center',
              marginTop: 4,
            },
          }}
        />
        <Tabs.Screen
          name="wardrobe"
          options={{
            title: 'Wardrobe',
            tabBarButtonTestID: 'tab-wardrobe',
            tabBarIcon: ({ color, size }) => <TabIcon name="rose-outline" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'You',
            tabBarButtonTestID: 'tab-profile',
            // Custom avatar icon (champagne ring + monogram or photo) instead
            // of a generic person line icon. Wire imageUri once the user can
            // upload one — currently falls back to a cursive monogram.
            tabBarIcon: ({ focused }) => <ProfileTabIcon focused={focused} />,
          }}
        />
      </Tabs>
      <ScanFAB />
      <FeedbackBubble />
      <CompareFAB />

      {/* ── Notification permission prompt ─────────────────────────────── */}
      <Modal
        visible={showNotifPrompt}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <View style={notifPrompt.overlay}>
          <View style={notifPrompt.card}>
            <Text style={notifPrompt.emoji}>🌸</Text>
            <Text style={notifPrompt.title}>Your scent, every morning</Text>
            <Text style={notifPrompt.body}>
              We'll send tomorrow's Scent of the Day at 8am, picked from your wardrobe for the day ahead.
            </Text>
            <Pressable style={notifPrompt.acceptBtn} onPress={handleNotifAccept}>
              <Text style={notifPrompt.acceptText}>Turn on notifications</Text>
            </Pressable>
            <Pressable style={notifPrompt.declineBtn} onPress={handleNotifDecline}>
              <Text style={notifPrompt.declineText}>Not now</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const notifPrompt = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  card: {
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    alignItems: 'center',
    width: '100%',
    gap: SPACING.sm,
  },
  emoji: {
    fontSize: 40,
    marginBottom: SPACING.xs,
  },
  title: {
    fontFamily: FONTS.serif,
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
  },
  body: {
    ...TYPE.bodySmall,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  acceptBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.full,
    paddingVertical: 14,
    paddingHorizontal: SPACING.xl,
    width: '100%',
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  acceptText: {
    fontFamily: FONTS.serif,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
    letterSpacing: 0.3,
  },
  declineBtn: {
    paddingVertical: SPACING.sm,
    width: '100%',
    alignItems: 'center',
  },
  declineText: {
    ...TYPE.bodySmall,
    color: COLORS.muted,
  },
});
