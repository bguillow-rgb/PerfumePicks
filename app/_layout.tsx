import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, LogBox } from 'react-native';

// RevenueCat can't fetch offerings until products are live in App Store
// Connect, which only happens for release builds. In dev, the expected failure
// surfaces as a red LogBox toast that obscures the UI we're testing — silence.
if (__DEV__) {
  LogBox.ignoreLogs([
    /\[RevenueCat\]/,
    /Error fetching offerings/,
  ]);
}
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import 'react-native-reanimated';
import { COLORS, FONTS } from '@/src/constants/theme';
import { StyledAlertHost } from '@/src/components/ui/StyledAlert';
import { supabase } from '@/lib/supabase';
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
    const inAuthGroup = segments[0] === 'auth';

    // Anonymous (guest) sessions are valid — let them in. Only kick to /auth
    // when there's no session at all.
    if (!session && !inAuthGroup) {
      router.replace('/auth/login');
    } else if (session && inAuthGroup && !session.user?.is_anonymous) {
      router.replace('/(tabs)');
    }
  }, [session, segments, isLoading]);
}

function AnimatedSplash({
  onReady,
  onFinish,
}: {
  onReady?: () => void;
  onFinish: () => void;
}) {
  const scale = useSharedValue(0.85);
  const opacity = useSharedValue(0);
  const wordmarkOpacity = useSharedValue(0);
  const taglineOpacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 500 });
    scale.value = withSequence(
      withTiming(1.04, { duration: 700, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 400 }),
    );
    wordmarkOpacity.value = withDelay(400, withTiming(1, { duration: 700 }));
    taglineOpacity.value = withDelay(900, withTiming(1, { duration: 600 }));

    const timeout = setTimeout(() => {
      opacity.value = withTiming(0, { duration: 500 });
      wordmarkOpacity.value = withTiming(0, { duration: 400 });
      taglineOpacity.value = withTiming(0, { duration: 400 }, () => {
        runOnJS(onFinish)();
      });
    }, 2600);

    return () => clearTimeout(timeout);
  }, []);

  const wordmarkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: wordmarkOpacity.value,
  }));

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const taglineStyle = useAnimatedStyle(() => ({
    opacity: taglineOpacity.value,
  }));

  return (
    <Animated.View
      style={[splashStyles.container, containerStyle]}
      onLayout={() => onReady?.()}
    >
      <View style={splashStyles.ornamentTop} />
      <Animated.View style={wordmarkStyle}>
        {/* Cursive wordmark — uses Pinyon Script, the script font loaded in
            useFonts() below. Loaded as 'Wordmark' so the font reference here
            stays stable even if we swap the underlying TTF. */}
        <Text style={splashStyles.wordmark}>Perfume Picks</Text>
      </Animated.View>
      <Animated.View style={taglineStyle}>
        <View style={splashStyles.divider} />
        <Text style={splashStyles.tagline}>FRAGRANCE, REFINED</Text>
      </Animated.View>
      <View style={splashStyles.ornamentBottom} />
    </Animated.View>
  );
}

const splashStyles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  ornamentTop: {
    position: 'absolute',
    top: '24%',
    width: 80,
    height: 1,
    backgroundColor: COLORS.accent,
    opacity: 0.5,
  },
  wordmark: {
    fontFamily: 'Wordmark',
    fontSize: 68,
    color: COLORS.accent,
    textAlign: 'center',
    // Pinyon Script descenders sit low — extra line height prevents clipping.
    lineHeight: 90,
    paddingHorizontal: 24,
  },
  divider: {
    width: 36,
    height: 1,
    backgroundColor: COLORS.accent,
    alignSelf: 'center',
    marginVertical: 14,
    opacity: 0.6,
  },
  tagline: {
    fontFamily: FONTS.serif,
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.muted,
    textAlign: 'center',
    letterSpacing: 5,
  },
  ornamentBottom: {
    position: 'absolute',
    bottom: '24%',
    width: 80,
    height: 1,
    backgroundColor: COLORS.accent,
    opacity: 0.5,
  },
});

export default function RootLayout() {
  const [loaded, error] = useFonts({
    // Cursive wordmark font for the splash screen. Pinyon Script is a
    // refined, feminine script — placeholder until the .ttf is dropped into
    // assets/fonts/. Until then expo-font falls back to the system serif.
    'Wordmark': require('../assets/fonts/PinyonScript-Regular.ttf'),
    'Cormorant': require('../assets/fonts/Cormorant-Variable.ttf'),
    'Cormorant-Italic': require('../assets/fonts/Cormorant-Italic-Variable.ttf'),
  });
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
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded && animatedSplashReady) {
      SplashScreen.hideAsync();
    }
  }, [loaded, animatedSplashReady]);

  const handleSplashFinish = useCallback(() => {
    setShowSplash(false);
  }, []);

  useProtectedRoute(session, authLoading || showSplash);

  if (!loaded) return null;

  return (
    <ThemeProvider value={PerfumePicksTheme}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="auth/login" options={{ presentation: 'modal', gestureEnabled: false }} />
        <Stack.Screen name="quiz/index" />
        <Stack.Screen name="quiz/results" />
        <Stack.Screen name="fragrance/[id]" />
        <Stack.Screen name="train/index" />
        <Stack.Screen name="paywall" />
        <Stack.Screen name="legal/privacy" options={{ presentation: 'modal' }} />
        <Stack.Screen name="legal/terms" options={{ presentation: 'modal' }} />
      </Stack>
      {showSplash && (
        <AnimatedSplash
          onReady={() => setAnimatedSplashReady(true)}
          onFinish={handleSplashFinish}
        />
      )}
      <StyledAlertHost />
    </ThemeProvider>
  );
}
