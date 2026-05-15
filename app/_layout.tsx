import { useEffect, useState, useCallback } from 'react';
import { LogBox } from 'react-native';

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
import {
  initAnalytics,
  initErrorReporting,
  identify as identifyAnalytics,
  resetAnalytics,
  setErrorUser,
} from '@/src/lib/observability';
import { useAppSync } from '@/src/lib/sync/useAppSync';

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

  useEffect(() => {
    if (isLoading) return;

    // Demo mode: when Supabase isn't configured (no env vars), skip the auth
    // gate entirely so the app boots straight to (tabs) for UI review on a
    // physical device. Production builds set EXPO_PUBLIC_SUPABASE_URL via
    // eas.json and re-enable the real gate below.
    if (!isSupabaseConfigured) return;

    const inAuthGroup = segments[0] === 'auth';
    if (!session && !inAuthGroup) {
      router.replace('/auth/login');
    } else if (session && inAuthGroup && !session.user?.is_anonymous) {
      router.replace('/(tabs)');
    }
  }, [session, segments, isLoading]);
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

  useProtectedRoute(session, authLoading || showSplash);

  // Hydrate user-scoped stores from Supabase on sign-in; clear on sign-out.
  // The hook handles the demo-mode bypass when Supabase isn't configured.
  // M1 Phase A — was the highest-leverage fix in the foundation milestone:
  // the hook existed but was never mounted, so wardrobe / wear-log / swipe
  // stores never saw the user's real data after sign-in.
  useAppSync(session?.user?.id ?? null);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <ThemeProvider value={PerfumePicksTheme}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="auth/login" options={{ presentation: 'modal', gestureEnabled: false }} />
        <Stack.Screen name="quiz/index" />
        <Stack.Screen name="quiz/results" />
        <Stack.Screen name="paywall" />
        <Stack.Screen name="brand/[name]" />
        <Stack.Screen name="rec/results" />
        <Stack.Screen name="taste-profile" />
        <Stack.Screen name="wrapped" />
        <Stack.Screen name="feed" />
        <Stack.Screen name="scan" options={{ presentation: 'fullScreenModal' }} />
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
