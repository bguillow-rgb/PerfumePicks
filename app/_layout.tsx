import { useEffect, useState, useCallback, useRef } from 'react';
import { LogBox, AppState, type AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Updates from 'expo-updates';

if (__DEV__) {
  LogBox.ignoreLogs([
    /\[RevenueCat\]/,
    /Error fetching offerings/,
  ]);
}

import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

// Load fonts directly from the @expo-google-fonts packages — these ship the
// .ttfs as JS modules, no manual asset placement needed. PinyonScript is the
// cursive wordmark; Cormorant Garamond is the serif used across headings.
import {
  useFonts as usePinyonFont,
  PinyonScript_400Regular,
} from '@expo-google-fonts/pinyon-script';
import {
  CormorantGaramond_400Regular,
  CormorantGaramond_500Medium,
  CormorantGaramond_600SemiBold,
  CormorantGaramond_700Bold,
  CormorantGaramond_400Regular_Italic,
} from '@expo-google-fonts/cormorant-garamond';

import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { COLORS } from '@/src/constants/theme';
import { StyledAlertHost } from '@/src/components/ui/StyledAlert';
import { HandwrittenSplash } from '@/src/components/splash/HandwrittenSplash';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { Session } from '@supabase/supabase-js';
import { initRevenueCat, identifyUser, getCustomerInfo, isProActive } from '@/src/lib/revenuecat';
import { useProStore } from '@/src/stores/useProStore';
import { useOnboardingStore } from '@/src/stores/useOnboardingStore';
import { useAppSync } from '@/src/lib/sync/useAppSync';
import { scheduleLivingDnaRecompute } from '@/src/lib/sync/recomputeScheduler';
import { useTasteProfileStore } from '@/src/stores/useTasteProfileStore';
import { useBadgeCheck } from '@/src/lib/useBadgeCheck';
import {
  initAnalytics,
  initErrorReporting,
  identify as identifyAnalytics,
  resetAnalytics,
  setErrorUser,
} from '@/src/lib/observability';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

const PerfumePicksTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: COLORS.accent,
    background: COLORS.bg,
    card: COLORS.card,
    text: COLORS.text,
    border: COLORS.border,
    notification: COLORS.accent,
  },
};

function useProtectedRoute(session: Session | null, isLoading: boolean) {
  const segments = useSegments();
  const router = useRouter();
  const hasSeenOnboarding = useOnboardingStore((s) => s.hasSeenOnboarding);
  const onboardingHydrated = useOnboardingStore((s) => s.hydrated);
  const retakeMode = useOnboardingStore((s) => s.retakeMode);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === 'auth';
    const inDnaGroup = segments[0] === 'dna';

    // Auth gate (real mode only). In demo mode (no env vars) we skip it so the
    // app boots without credentials for UI review on a physical device.
    if (isSupabaseConfigured) {
      if (!session && !inAuthGroup) {
        router.replace('/auth/login');
        return;
      }
      if (session && inAuthGroup && !session.user?.is_anonymous) {
        router.replace('/(tabs)');
        return;
      }
    }

    // Onboarding gate (BOTH modes): the Fragrance DNA picker is the required
    // front door. `(tabs)` and Today's hooks mount only after it completes. In
    // real mode this runs once a (guest/real) session exists, so it sits behind
    // the auth gate above; in demo mode it always runs.
    if (!onboardingHydrated) return;
    const authedOrDemo = !isSupabaseConfigured || !!session;
    if (authedOrDemo && !inAuthGroup) {
      if (!hasSeenOnboarding && !inDnaGroup) {
        router.replace('/dna');
      } else if (hasSeenOnboarding && inDnaGroup && !retakeMode) {
        // Onboarded users are normally bounced out of `/dna`, EXCEPT when they
        // deliberately re-entered to retake their DNA.
        router.replace('/(tabs)');
      }
    }
  }, [session, segments, isLoading, hasSeenOnboarding, onboardingHydrated, retakeMode]);
}

export default function RootLayout() {
  // Two font requests, joined: cursive wordmark + serif body.
  const [pinyonLoaded] = usePinyonFont({ PinyonScript_400Regular });
  const [serifLoaded] = usePinyonFont({
    CormorantGaramond_400Regular,
    CormorantGaramond_500Medium,
    CormorantGaramond_600SemiBold,
    CormorantGaramond_700Bold,
    'CormorantGaramond_400Regular_Italic': CormorantGaramond_400Regular_Italic,
    // Aliases so existing `fontFamily: 'Cormorant'` references keep working.
    'Cormorant': CormorantGaramond_400Regular,
    'Cormorant-Italic': CormorantGaramond_400Regular_Italic,
  });
  const fontsLoaded = pinyonLoaded && serifLoaded;

  const [showSplash, setShowSplash] = useState(true);
  const [animatedSplashReady, setAnimatedSplashReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    initErrorReporting();
    initAnalytics();
    initRevenueCat().catch((e) => {
      if (__DEV__) console.warn('[RevenueCat] Init failed:', e);
    });
  }, []);

  // OTA update check — runs on launch and every time the app comes to foreground.
  // Logs errors in dev so we can diagnose channel/runtime mismatches instead of
  // silently swallowing them.
  useEffect(() => {
    if (__DEV__) return;

    const checkForUpdate = async () => {
      try {
        const check = await Updates.checkForUpdateAsync();
        if (check.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch (e: any) {
        // Log in dev; in prod this surfaces in Sentry via initErrorReporting().
        console.warn('[OTA] Update check failed:', e?.message ?? e);
      }
    };

    // Check on launch.
    checkForUpdate();

    // Re-check every time the app comes to the foreground (handles the case
    // where the user never fully kills the app).
    let lastState: AppStateStatus = AppState.currentState;
    const sub = AppState.addEventListener('change', (next) => {
      if (lastState.match(/inactive|background/) && next === 'active') {
        checkForUpdate();
      }
      lastState = next;
    });

    return () => sub.remove();
  }, []);

  // Living DNA — refresh on foreground + a one-time launch migration (PRD §7.3).
  // Foreground: signals may have landed on another device (synced down on the
  // auth path); a debounced recompute folds them in. Migration: a single launch
  // recompute backfills `seededAt` onto pre-M2 seeds (deriveLivingDNA stamps any
  // seed missing it), so recency decay has a basis. Both no-op before onboarding.
  const didMigrateRef = useRef(false);
  useEffect(() => {
    const runMigrationOnce = () => {
      if (didMigrateRef.current) return;
      if (!useTasteProfileStore.getState().dna) return; // no DNA yet — nothing to migrate
      didMigrateRef.current = true;
      scheduleLivingDnaRecompute('migration');
    };

    // Run once the durable DNA has rehydrated (or immediately if already warm).
    if (useTasteProfileStore.getState().hasHydrated) runMigrationOnce();
    const unsub = useTasteProfileStore.subscribe((s) => {
      if (s.hasHydrated) runMigrationOnce();
    });

    let lastState: AppStateStatus = AppState.currentState;
    const sub = AppState.addEventListener('change', (next) => {
      if (lastState.match(/inactive|background/) && next === 'active') {
        scheduleLivingDnaRecompute('foreground');
      }
      lastState = next;
    });

    return () => {
      unsub();
      sub.remove();
    };
  }, []);

  useEffect(() => {
    // Demo mode (no Supabase) — skip the whole auth subscription path.
    if (!isSupabaseConfigured) {
      setAuthLoading(false);
      return;
    }
    const activate = useProStore.getState().activate;
    let identifiedUserId: string | null = null;

    const syncRevenueCat = async (userId: string) => {
      if (identifiedUserId === userId) return;
      identifiedUserId = userId;
      try {
        await identifyUser(userId);
        const info = await getCustomerInfo();
        if (info && isProActive(info)) activate();
      } catch {
        // RevenueCat not available
      }
    };

    const onSession = (sess: Session | null) => {
      setSession(sess);
      setAuthLoading(false);
      if (sess?.user?.id) {
        syncRevenueCat(sess.user.id);
        identifyAnalytics(sess.user.id, { is_anonymous: !!sess.user.is_anonymous });
        setErrorUser({ id: sess.user.id, email: sess.user.email ?? null });
      } else {
        resetAnalytics();
        setErrorUser(null);
        identifiedUserId = null;
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => onSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      onSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (fontsLoaded && animatedSplashReady) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, animatedSplashReady]);

  const handleSplashFinish = useCallback(() => {
    setShowSplash(false);
  }, []);

  // ── Notification deep-link handler ────────────────────────────────────────
  // When the user taps a notification, route to the relevant screen.
  // We keep a ref to the router so the effect closure stays fresh.
  const router = useRouter();
  const routerRef = useRef(router);
  useEffect(() => { routerRef.current = router; }, [router]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const screen = response.notification.request.content.data?.screen as string | undefined;
      if (screen === 'wardrobe') {
        routerRef.current.push('/(tabs)/wardrobe');
      } else {
        // Default: go to Today tab
        routerRef.current.push('/(tabs)');
      }
    });
    return () => sub.remove();
  }, []);

  useProtectedRoute(session, authLoading || showSplash);
  useAppSync(session?.user?.id ?? null, !!session?.user?.is_anonymous);
  useBadgeCheck();

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <ThemeProvider value={PerfumePicksTheme}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        {/* Fragrance detail lives in the root stack (not nested in tabs) so each
            push builds real back-history — Discover→Coco→dupe→back returns to
            Coco, not Home — and every detail gets a fresh mount (no param-swap
            stale-render flash). Tab bar is hidden here, matching brand/user. */}
        <Stack.Screen name="fragrance/[id]" />
        <Stack.Screen name="dna" options={{ gestureEnabled: false }} />
        <Stack.Screen name="auth/login" options={{ presentation: 'modal', gestureEnabled: false }} />
        <Stack.Screen name="quiz/index" />
        <Stack.Screen name="quiz/results" />
        <Stack.Screen name="preferences/index" />
        <Stack.Screen name="paywall" />
        <Stack.Screen name="brand/[name]" />
        <Stack.Screen name="rec/results" />
        <Stack.Screen name="taste-profile" />
        <Stack.Screen name="wrapped" />
        <Stack.Screen name="compare" />
        <Stack.Screen name="feed" />
        <Stack.Screen name="scan" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="user/[id]" />
        <Stack.Screen name="legal/privacy" options={{ presentation: 'modal' }} />
        <Stack.Screen name="legal/terms" options={{ presentation: 'modal' }} />
      </Stack>
      {showSplash && (
        <HandwrittenSplash
          fontsLoaded={fontsLoaded}
          onReady={() => setAnimatedSplashReady(true)}
          onFinish={handleSplashFinish}
        />
      )}
      <StyledAlertHost />
    </ThemeProvider>
    </GestureHandlerRootView>
  );
}
