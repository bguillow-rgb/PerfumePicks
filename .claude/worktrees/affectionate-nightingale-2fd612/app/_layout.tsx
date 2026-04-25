import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
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
  withRepeat,
} from 'react-native-reanimated';
import 'react-native-reanimated';
import { COLORS, FONTS } from '@/src/constants/theme';
import { supabase } from '@/lib/supabase';
import { Session } from '@supabase/supabase-js';
import { initRevenueCat, identifyUser, getCustomerInfo, isProActive } from '@/src/lib/revenuecat';
import { useProStore } from '@/src/stores/useProStore';
import { useAgeGateStore, useHydrateAgeGate } from '@/src/stores/useAgeGateStore';
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

const StickPicksDark = {
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

function useProtectedRoute(
  session: Session | null,
  isLoading: boolean,
  ageState: 'verified' | 'blocked' | 'unknown' | 'loading',
) {
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (ageState === 'loading') return;

    const inAgeGate = segments[0] === 'age-gate';
    const inAuthGroup = segments[0] === 'auth';

    // 1) Age gate is the floor — everyone hits it first until they answer yes.
    if (ageState === 'unknown' && !inAgeGate) {
      router.replace('/age-gate');
      return;
    }
    if (ageState === 'blocked' && segments.join('/') !== 'age-gate/blocked') {
      router.replace('/age-gate/blocked');
      return;
    }

    // Don't redirect anyone OUT of age-gate routes — they own the flow once inside.
    if (inAgeGate) return;

    // 2) Auth gate
    if (!session && !inAuthGroup) {
      router.replace('/auth/login');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [session, segments, isLoading, ageState]);
}

function AnimatedSplash({
  onReady,
  onFinish,
}: {
  onReady?: () => void;
  onFinish: () => void;
}) {
  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0);
  const textOpacity = useSharedValue(0);
  const smokeOpacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 400 });
    scale.value = withSequence(
      withTiming(1.1, { duration: 600, easing: Easing.out(Easing.back(1.5)) }),
      withTiming(0.95, { duration: 300 }),
      withTiming(1, { duration: 300 }),
    );

    smokeOpacity.value = withDelay(500, withRepeat(
      withSequence(
        withTiming(0.6, { duration: 800 }),
        withTiming(0.2, { duration: 800 }),
      ),
      3,
      true,
    ));

    textOpacity.value = withDelay(600, withTiming(1, { duration: 500 }));

    const timeout = setTimeout(() => {
      opacity.value = withTiming(0, { duration: 400 });
      textOpacity.value = withTiming(0, { duration: 300 }, () => {
        runOnJS(onFinish)();
      });
    }, 2800);

    return () => clearTimeout(timeout);
  }, []);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const smokeStyle = useAnimatedStyle(() => ({
    opacity: smokeOpacity.value,
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
  }));

  return (
    <View
      style={splashStyles.container}
      // Fires once the splash view has been measured — a reliable signal that
      // the first frame is about to be painted. Used to hide the native launch
      // screen only AFTER this view is ready, eliminating the gap where the
      // (tabs) screen could flash through.
      onLayout={() => onReady?.()}
    >
      <Animated.View style={[splashStyles.topLine, smokeStyle]} />

      <Animated.View style={iconStyle}>
        <Image
          source={require('../assets/images/splash-icon.png')}
          style={splashStyles.cigarPhoto}
          resizeMode="cover"
        />
      </Animated.View>

      <Animated.View style={textStyle}>
        <Text style={splashStyles.brand}>STICK PICKS</Text>
        <View style={splashStyles.divider} />
        <Text style={splashStyles.tagline}>EST. 2025</Text>
      </Animated.View>

      <Animated.View style={[splashStyles.bottomLine, smokeStyle]} />
    </View>
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
  topLine: {
    position: 'absolute',
    top: '22%',
    width: 60,
    height: 2,
    backgroundColor: COLORS.accent,
    borderRadius: 1,
  },
  cigarPhoto: {
    width: 200,
    height: 200,
    borderRadius: 100,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: COLORS.accent,
  },
  brand: {
    fontFamily: FONTS.display,
    fontSize: 34,
    fontWeight: '800',
    color: COLORS.accent,
    textAlign: 'center',
    letterSpacing: 6,
  },
  divider: {
    width: 40,
    height: 2,
    backgroundColor: COLORS.accent,
    alignSelf: 'center',
    marginVertical: 10,
    borderRadius: 1,
  },
  tagline: {
    fontFamily: 'Cormorant',
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.muted,
    textAlign: 'center',
    letterSpacing: 4,
  },
  bottomLine: {
    position: 'absolute',
    bottom: '22%',
    width: 60,
    height: 2,
    backgroundColor: COLORS.accent,
    borderRadius: 1,
  },
});

export default function RootLayout() {
  const [loaded, error] = useFonts({
    'Cormorant': require('../assets/fonts/Cormorant-Variable.ttf'),
    'Cormorant-Italic': require('../assets/fonts/Cormorant-Italic-Variable.ttf'),
  });
  const [showSplash, setShowSplash] = useState(true);
  const [animatedSplashReady, setAnimatedSplashReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const ageState = useAgeGateStore((s) => s.status);
  useHydrateAgeGate();

  // Init RevenueCat + observability (analytics + error reporting).
  // Observability is no-op when EXPO_PUBLIC_SENTRY_DSN / EXPO_PUBLIC_POSTHOG_API_KEY are empty.
  useEffect(() => {
    initErrorReporting();
    initAnalytics();
    initRevenueCat().catch((e) => {
      if (__DEV__) console.warn('[RevenueCat] Init failed:', e);
    });
  }, []);

  // Listen for auth state changes + sync RevenueCat user
  useEffect(() => {
    const activate = useProStore.getState().activate;
    let identifiedUserId: string | null = null;

    const syncRevenueCat = async (userId: string) => {
      if (identifiedUserId === userId) return; // Prevent double-fire
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

    // Check existing session
    supabase.auth.getSession().then(({ data: { session } }) => onSession(session));

    // Subscribe to changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      onSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  // Hide the iOS native launch screen only once BOTH fonts are loaded AND the
  // JS AnimatedSplash has measured its first layout. Hiding earlier causes a
  // visible flash of whatever screen is underneath (usually (tabs)/index) before
  // the branded splash paints.
  useEffect(() => {
    if (loaded && animatedSplashReady) {
      SplashScreen.hideAsync();
    }
  }, [loaded, animatedSplashReady]);

  const handleSplashFinish = useCallback(() => {
    setShowSplash(false);
  }, []);

  // Protect routes based on age + auth state
  useProtectedRoute(session, authLoading || showSplash, ageState);

  if (!loaded) return null;

  return (
    <ThemeProvider value={StickPicksDark}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="age-gate/index" options={{ gestureEnabled: false }} />
        <Stack.Screen name="age-gate/blocked" options={{ gestureEnabled: false }} />
        <Stack.Screen name="auth/login" options={{ presentation: 'modal', gestureEnabled: false }} />
        <Stack.Screen name="quiz/index" />
        <Stack.Screen name="quiz/results" />
        <Stack.Screen name="identify/camera" />
        <Stack.Screen name="identify/result" />
        <Stack.Screen name="cigar/[id]" />
        <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
        <Stack.Screen name="legal/privacy" options={{ presentation: 'modal' }} />
        <Stack.Screen name="legal/terms" options={{ presentation: 'modal' }} />
      </Stack>
      {showSplash && (
        <AnimatedSplash
          onReady={() => setAnimatedSplashReady(true)}
          onFinish={handleSplashFinish}
        />
      )}
    </ThemeProvider>
  );
}
