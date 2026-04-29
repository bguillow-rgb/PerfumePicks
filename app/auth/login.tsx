import { View, Text, StyleSheet, Platform, Pressable } from 'react-native';
import { Alert } from '@/src/components/ui/StyledAlert';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { supabase } from '@/lib/supabase';
import { Button } from '@/src/components/ui/Button';
import { COLORS, SPACING } from '@/src/constants/theme';
import { useProStore } from '@/src/stores/useProStore';

// Lazy-load Google Sign-In ONLY when the user actually taps the button.
// expo-router pre-imports every route file at app boot, so a top-level
// `import` here would force RNGoogleSignin's native module to initialize
// during boot — and it throws "GoogleService-Info.plist not found" before
// configure() even runs in demo mode.
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const isGoogleConfigured =
  !!GOOGLE_IOS_CLIENT_ID &&
  !!GOOGLE_WEB_CLIENT_ID &&
  !GOOGLE_IOS_CLIENT_ID.startsWith('REPLACE_') &&
  !GOOGLE_WEB_CLIENT_ID.startsWith('REPLACE_');

let _googleConfigured = false;
function loadGoogleSignIn() {
  // require() instead of import so the native module isn't touched until
  // someone actually taps "Continue with Google".
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const lib = require('@react-native-google-signin/google-signin');
  if (!_googleConfigured) {
    lib.GoogleSignin.configure({
      iosClientId: GOOGLE_IOS_CLIENT_ID,
      webClientId: GOOGLE_WEB_CLIENT_ID,
    });
    _googleConfigured = true;
  }
  return lib;
}

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const activatePro = useProStore((s) => s.activate);
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();

  // Comp Pro for owner/demo accounts after a successful sign-in. The allowlist
  // lives in the comped_users table (migration 013) and is opaque to the
  // client — the is_current_user_comped() RPC returns only a boolean so no PII
  // ships in the bundle.
  const maybeCompPro = async () => {
    try {
      const { data, error } = await supabase.rpc('is_current_user_comped');
      if (error) return;
      if (data === true) activatePro();
    } catch {
      // Network or transient error — skip comp silently rather than
      // blocking the user from reaching the home screen.
    }
  };

  const goHome = async () => {
    await maybeCompPro();
    if (returnTo) {
      router.replace(returnTo as any);
    } else {
      router.replace('/(tabs)');
    }
  };

  // ── Google Sign-In (native SDK) ──
  const handleGoogleSignIn = async () => {
    if (!isGoogleConfigured) {
      Alert.alert(
        'Google Sign-In not available',
        'This demo build is not configured for Google Sign-In. Use Apple or continue as a guest.',
      );
      return;
    }
    // Hoist statusCodes above the try block so the catch closure has a stable
    // reference without needing to re-call loadGoogleSignIn() (which can throw).
    let statusCodes: Record<string, string> = {};
    try {
      setLoading(true);
      const lib = loadGoogleSignIn();
      statusCodes = lib.statusCodes;
      const { GoogleSignin } = lib;
      await GoogleSignin.hasPlayServices();

      // Native Google sign-in: nonce checks skipped in Supabase config.
      // The id_token is still fully verified against Google's servers.
      const response = await GoogleSignin.signIn();

      if (!response.data?.idToken) {
        Alert.alert('Google Sign-In Error', 'No ID token received from Google.');
        return;
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: response.data.idToken,
      });
      if (error) throw error;
      goHome();
    } catch (e: any) {
      if (e?.code === statusCodes?.SIGN_IN_CANCELLED) return;
      if (e?.code === statusCodes?.IN_PROGRESS) return;
      Alert.alert('Google Sign-In Error', e?.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  // ── Apple Sign-In ──
  const handleAppleSignIn = async () => {
    if (Platform.OS !== 'ios') {
      Alert.alert('Not available', 'Apple Sign-In is only available on iOS.');
      return;
    }

    try {
      setLoading(true);

      const randomBytes = new Uint8Array(16);
      Crypto.getRandomValues(randomBytes);
      const rawNonce = Array.from(randomBytes, (b) => b.toString(16).padStart(2, '0')).join('');
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce
      );

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      if (!credential.identityToken) {
        Alert.alert('Error', 'No identity token received from Apple.');
        return;
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        nonce: rawNonce,
      });

      if (error) throw error;
      goHome();
    } catch (e: any) {
      if (e?.code === 'ERR_REQUEST_CANCELED') return;
      Alert.alert('Apple Sign-In Error', e?.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  // ── Guest Mode ──
  // Guest = free tier (no Pro). Sign in with comped email for Pro.
  const handleGuest = async () => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      router.replace('/(tabs)');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to continue as guest');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 80 }]}>
      <Text style={styles.wordmark}>Perfume Picks</Text>
      <View style={styles.brandRule} />
      <Text style={styles.tagline}>
        Sign in to sync your wardrobe across devices — or continue as a guest to explore.
      </Text>

      <View style={styles.buttons}>
        {Platform.OS === 'ios' && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={8}
            style={styles.appleButton}
            onPress={handleAppleSignIn}
          />
        )}

        <Button
          title="Continue with Google"
          onPress={handleGoogleSignIn}
          variant="secondary"
          disabled={loading}
        />

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <Button
          title="Continue as Guest"
          onPress={handleGuest}
          variant="ghost"
          disabled={loading}
        />
      </View>

      <Text style={styles.note}>
        Guest data stays on this device. Sign in later to sync.
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingHorizontal: SPACING.lg,
  },
  wordmark: {
    fontFamily: 'PinyonScript_400Regular',
    fontSize: 56,
    color: COLORS.accent,
    textAlign: 'center',
    lineHeight: 88,
  },
  brandRule: {
    width: 40,
    height: 2,
    backgroundColor: COLORS.accent,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: SPACING.md,
    borderRadius: 1,
  },
  tagline: {
    fontFamily: 'Cormorant',
    fontSize: 15,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 22,
  },
  buttons: {
    marginTop: SPACING.xxl,
    gap: SPACING.sm,
  },
  appleButton: {
    width: '100%',
    height: 48,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginVertical: SPACING.xs,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    fontFamily: 'Cormorant',
    fontSize: 13,
    color: COLORS.subtle,
  },
  note: {
    fontFamily: 'Cormorant',
    fontSize: 12,
    color: COLORS.subtle,
    textAlign: 'center',
    marginTop: SPACING.xl,
    lineHeight: 18,
  },
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.xxl,
    gap: SPACING.sm,
  },
  legalLink: {
    fontFamily: 'Cormorant',
    fontSize: 12,
    color: COLORS.muted,
    textDecorationLine: 'underline',
  },
  legalDot: {
    color: COLORS.subtle,
    fontSize: 12,
  },
});
