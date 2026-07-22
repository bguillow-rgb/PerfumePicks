// Promo code redemption sheet — shared by the paywall ("Have a promo code?")
// and the Profile › Account row ("Redeem a promo code"). The user types an
// influencer code and gets N months of free Pro. All validation + the grant
// happen server-side (redeem-promo Edge Function); this sheet only submits and
// reflects the outcome. On success the store flips serverPro and the UI unlocks.

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { COLORS, FONTS, RADIUS, SPACING } from '@/src/constants/theme';
import { redeemPromoCode } from '@/src/lib/promo';
import { useAuthStore } from '@/src/stores/useAuthStore';

interface Props {
  visible: boolean;
  onClose: () => void;
  entry: 'paywall' | 'profile';
  /** Called after a successful redemption (e.g. to dismiss the paywall). */
  onRedeemed?: (durationMonths: number) => void;
}

export function PromoCodeSheet({ visible, onClose, entry, onRedeemed }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // Reactive guest check — codes require a real, recoverable account.
  const authUser = useAuthStore((s) => s.user);
  const isGuest = !authUser || authUser.is_anonymous;
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMonths, setSuccessMonths] = useState<number | null>(null);

  // Reset on each open so the sheet never shows stale state.
  useEffect(() => {
    if (visible) {
      setCode('');
      setSubmitting(false);
      setError(null);
      setSuccessMonths(null);
    }
  }, [visible]);

  const canSubmit = code.trim().length > 0 && !submitting;

  const handleRedeem = async () => {
    if (!canSubmit) return;
    Keyboard.dismiss();
    setSubmitting(true);
    setError(null);
    const result = await redeemPromoCode(code, entry);
    setSubmitting(false);

    if (result.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSuccessMonths(result.durationMonths);
      onRedeemed?.(result.durationMonths);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(result.message);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={[styles.sheet, { paddingBottom: insets.bottom + SPACING.lg }]}
            >
              <View style={styles.grabber} />
              <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn} accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={COLORS.muted} />
              </Pressable>

              {isGuest ? (
                <View style={styles.successBox}>
                  <Ionicons name="lock-closed-outline" size={34} color={COLORS.accent} />
                  <Text style={styles.successTitle}>Sign in to redeem</Text>
                  <Text style={styles.successBody}>
                    Promo codes attach to your account so your Pro follows you across
                    devices. Sign in or create an account, then enter your code.
                  </Text>
                  <Pressable
                    style={styles.primaryBtn}
                    onPress={() => { onClose(); router.push('/auth/login'); }}
                  >
                    <Text style={styles.primaryBtnText}>Sign in</Text>
                  </Pressable>
                </View>
              ) : successMonths != null ? (
                <View style={styles.successBox}>
                  <Ionicons name="sparkles" size={36} color={COLORS.accent} />
                  <Text style={styles.successTitle}>You’re on Pro</Text>
                  <Text style={styles.successBody}>
                    {successMonths} month{successMonths === 1 ? '' : 's'} of Perfume Picks Pro is now
                    unlocked. Everything’s open — enjoy.
                  </Text>
                  <Pressable style={styles.primaryBtn} onPress={onClose}>
                    <Text style={styles.primaryBtnText}>Start exploring</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  <Text style={styles.title}>Redeem a promo code</Text>
                  <Text style={styles.subtitle}>
                    Got a code from a creator? Enter it below to unlock free Pro.
                  </Text>

                  <TextInput
                    style={styles.input}
                    value={code}
                    onChangeText={(t) => { setCode(t); if (error) setError(null); }}
                    placeholder="Enter code"
                    placeholderTextColor={COLORS.subtle}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    autoComplete="off"
                    autoFocus
                    returnKeyType="go"
                    editable={!submitting}
                    onSubmitEditing={handleRedeem}
                    accessibilityLabel="Promo code"
                  />

                  {error && <Text style={styles.error}>{error}</Text>}

                  <Pressable
                    style={[styles.primaryBtn, !canSubmit && styles.primaryBtnDisabled]}
                    onPress={handleRedeem}
                    disabled={!canSubmit}
                  >
                    {submitting ? (
                      <ActivityIndicator color={COLORS.white} />
                    ) : (
                      <Text style={styles.primaryBtnText}>Redeem</Text>
                    )}
                  </Pressable>
                </>
              )}
            </KeyboardAvoidingView>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginBottom: SPACING.sm,
  },
  closeBtn: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.md,
    zIndex: 1,
  },
  title: {
    fontFamily: FONTS.serif,
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: SPACING.sm,
  },
  subtitle: {
    fontFamily: FONTS.serif,
    fontSize: 15,
    color: COLORS.muted,
    marginTop: SPACING.xs,
    marginBottom: SPACING.lg,
    lineHeight: 20,
  },
  input: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontFamily: FONTS.serif,
    fontSize: 18,
    letterSpacing: 2,
    color: COLORS.text,
    backgroundColor: COLORS.card,
  },
  error: {
    fontFamily: FONTS.serif,
    fontSize: 13,
    color: COLORS.blush,
    marginTop: SPACING.sm,
  },
  primaryBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.full,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.lg,
    minHeight: 52,
  },
  primaryBtnDisabled: {
    opacity: 0.5,
  },
  primaryBtnText: {
    fontFamily: FONTS.serif,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
    letterSpacing: 0.5,
  },
  successBox: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
  },
  successTitle: {
    fontFamily: FONTS.serif,
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
  },
  successBody: {
    fontFamily: FONTS.serif,
    fontSize: 15,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 21,
    paddingHorizontal: SPACING.sm,
  },
});
