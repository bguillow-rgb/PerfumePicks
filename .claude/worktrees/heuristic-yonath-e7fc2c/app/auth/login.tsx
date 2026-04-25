import { View, Text, StyleSheet, Alert, Platform, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { supabase } from '@/lib/supabase';
import { Button } from '@/src/components/ui/Button';
import { COLORS, SPACING, FONTS } from '@/src/constants/theme';
import { useProStore } from '@/src/stores/useProStore';

// Accounts that get Pro comped automatically (owner / demo accounts)
const COMPED_EMAILS = new Set(
  (process.env.EXPO_PUBLIC_COMPED_EMAILS ?? '').split(',').filter(Boolean).map((e) => e.trim().toLowerCase())
);

GoogleSignin.configure({
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
});

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const activatePro = useProStore((s) => s.activate);

  // Comp Pro for owner/demo accounts after a successful sign-in
  const maybeCompPro = async () => {
    const { data } = await supabase.auth.getUser();
    const email = data.user?.email?.toLowerCase();
    if (email && COMPED_EMAILS.has(email)) {
      activatePro();
    }
  };

  const goHome = async () => {
    await maybeCompPro();
    router.replace('/(tabs)');
  };

  // ── Google Sign-In (native SDK) ──
  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
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
      if (e?.code === statusCodes.SIGN_IN_CANCELLED) return;
      if (e?.code === statusCodes.IN_PROGRESS) return;
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

      const rawNonce = Math.random().toString(36).substring(2) + Date.now().toString(36);
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
      <Text style={styles.brand}>STICK PICKS</Text>
      <View style={styles.brandRule} />
      <Text style={styles.tagline}>
        Sign in to sync your humidor and scan history — or jump right in as a guest.
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
  brand: {
    fontFamily: FONTS.display,
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.accent,
    textAlign: 'center',
    letterSpacing: 6,
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
