import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Alert, Animated as RNAnimated, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { COLORS, SPACING, TYPE, RADIUS, FONTS } from '@/src/constants/theme';
import { scanBottle } from '@/src/lib/claude';
import { resolveScanMatch } from '@/src/lib/scanMatch';
import { useCatalogStore, type Fragrance } from '@/src/stores/useCatalogStore';
import { useWardrobeStore, WARDROBE_CAP_HIT } from '@/src/stores/useWardrobeStore';
import { useCustomFragranceStore } from '@/src/stores/useCustomFragranceStore';
import { useScanStore, FREE_LIFETIME_SCAN_LIMIT } from '@/src/stores/useScanStore';
import { useProStore } from '@/src/stores/useProStore';
import { track } from '@/src/lib/observability/analytics';
import { EVENTS } from '@/src/lib/observability/events';

type ScanState = 'ready' | 'scanning' | 'result' | 'no_match';
type Confidence = 'exact' | 'likely' | 'guess' | 'unsure';

function getConfidenceTier(c: number): Confidence {
  if (c >= 0.85) return 'exact';
  if (c >= 0.7) return 'likely';
  if (c >= 0.5) return 'guess';
  return 'unsure';
}

const CONFIDENCE_LABELS: Record<Confidence, string> = {
  exact: 'EXACT MATCH', likely: 'LIKELY MATCH', guess: 'BEST GUESS', unsure: 'UNSURE',
};

/**
 * Bottle Scan — Perfume Concierge.
 *
 * Replicates the Pour Picks / Stick Picks identify flow:
 * landing → camera (expo-image-picker) → shimmer loading → confidence-tiered
 * result card → confirm/reject → navigate to detail or manual search.
 */
export default function ScanScreen() {
  const router = useRouter();
  const [state, setState] = useState<ScanState>('ready');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [result, setResult] = useState<{ brand: string | null; name: string | null; confidence: number } | null>(null);
  const [quickAddName, setQuickAddName] = useState('');
  const [quickAddBrand, setQuickAddBrand] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const search = useCatalogStore((s) => s.search);
  const isPro = useProStore((s) => s.isPro);
  const recordScan = useScanStore((s) => s.recordScan);
  const isAtLimit = useScanStore((s) => s.isAtLimit);
  // Subscribe to the raw count so the "remaining" hint re-renders after a scan —
  // selecting the getter function alone is a stable ref and never updates.
  const lifetimeScanCount = useScanStore((s) => s.lifetimeScanCount);
  const remainingScans = Math.max(0, FREE_LIFETIME_SCAN_LIMIT - lifetimeScanCount);

  // Toast animation
  const toastOpacity = useRef(new RNAnimated.Value(0)).current;

  const showToast = () => {
    RNAnimated.sequence([
      RNAnimated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      RNAnimated.delay(2000),
      RNAnimated.timing(toastOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  };

  const checkScanLimit = (): boolean => {
    if (isPro) return true;
    if (isAtLimit()) {
      track(EVENTS.SCAN_LIMIT_HIT, { lifetime_scan_count: lifetimeScanCount });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert(
        "You've used your free scans",
        `That's all ${FREE_LIFETIME_SCAN_LIMIT} free scans. Go Pro for unlimited bottle identification.`,
        [
          { text: 'Not Now', style: 'cancel' },
          { text: 'Upgrade', onPress: () => router.push('/paywall?from=scan_limit' as any) },
        ],
      );
      return false;
    }
    return true;
  };

  const handleCapture = async () => {
    if (!checkScanLimit()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera Access Needed', 'Allow camera access in Settings to scan bottles.');
      return;
    }

    const pickerResult = await ImagePicker.launchCameraAsync({
      quality: 1,
      base64: false,
      allowsEditing: false,
    });

    if (pickerResult.canceled || !pickerResult.assets?.[0]?.uri) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const uri = pickerResult.assets[0].uri;

    // Resize for optimal upload size
    const manipulated = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1200 } }],
      { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
    );

    setPhotoUri(manipulated.uri);
    setState('scanning');

    try {
      const base64 = await FileSystem.readAsStringAsync(manipulated.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const scanResult = await scanBottle({ image_base64: base64 });
      recordScan();
      setResult(scanResult);

      if (scanResult.confidence >= 0.5 && scanResult.name) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setState('result');
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        if (scanResult.name) setQuickAddName(scanResult.name);
        if (scanResult.brand) setQuickAddBrand(scanResult.brand);
        setState('no_match');
      }
    } catch (e) {
      console.warn('[scan] error:', e);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setState('no_match');
    }
  };

  const handleGallery = async () => {
    if (!checkScanLimit()) return;
    Haptics.selectionAsync();
    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      base64: false,
    });
    if (pickerResult.canceled || !pickerResult.assets?.[0]?.uri) return;

    const manipulated = await ImageManipulator.manipulateAsync(
      pickerResult.assets[0].uri,
      [{ resize: { width: 1200 } }],
      { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
    );

    setPhotoUri(manipulated.uri);
    setState('scanning');

    try {
      const base64 = await FileSystem.readAsStringAsync(manipulated.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const scanResult = await scanBottle({ image_base64: base64 });
      recordScan();
      setResult(scanResult);
      if (scanResult.confidence >= 0.5 && scanResult.name) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setState('result');
      } else {
        if (scanResult.name) setQuickAddName(scanResult.name);
        if (scanResult.brand) setQuickAddBrand(scanResult.brand);
        setState('no_match');
      }
    } catch {
      setState('no_match');
    }
  };

  const handleConfirm = async () => {
    if (!result?.name) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Search WITH the brand (catalog ranking scores on name alone, so a common
    // name would otherwise land on an arbitrary house) and then require the
    // chosen row to actually be that brand — see pickScanMatch.
    const brand = result.brand?.trim();
    const best = await resolveScanMatch(search, result.name, brand);
    if (best) {
      showToast();
      setTimeout(() => router.replace(`/fragrance/${best.id}` as any), 1800);
    } else {
      // Either nothing matched, or nothing matched THIS brand. Opening a
      // different house's bottle after a correct identification is a silent
      // wrong answer; offering the manual path is honest and recoverable.
      setQuickAddName(result.name);
      if (brand) setQuickAddBrand(brand);
      Alert.alert(
        'Not in Catalog',
        `"${result.name}"${brand ? ` by ${brand}` : ''} isn't in our catalog yet — you can still add it.`,
      );
      setState('no_match');
    }
  };

  const handleRetry = () => {
    setPhotoUri(null);
    setResult(null);
    setQuickAddName('');
    setQuickAddBrand('');
    setState('ready');
  };

  const handleQuickAdd = async () => {
    const name = quickAddName.trim();
    if (!name) return;
    setIsAdding(true);
    try {
      const brand = quickAddBrand.trim();
      const query = brand ? `${name} ${brand}` : name;
      const matches = await search(query, 5);
      const best = matches[0] ?? null;

      // If not in catalog, create a custom entry so the user isn't blocked.
      // Copy the scan photo to permanent storage so it survives app restarts.
      // Persist only the bare filename (not the absolute container path) so the
      // photo survives iOS rotating the app container UUID on reinstall/OTA.
      // The custom store rebuilds the path against the current documentDirectory
      // at read time (resolveCustomImageUri).
      let customImageUrl = '';
      if (!best && photoUri) {
        try {
          const filename = `custom-frag-${Date.now()}.jpg`;
          const dest = `${FileSystem.documentDirectory}${filename}`;
          await FileSystem.copyAsync({ from: photoUri, to: dest });
          customImageUrl = filename;
        } catch { /* no image — that's fine */ }
      }
      // Custom entries persist on-device via the custom-fragrance store so the
      // bottle (and its photo) survives a cold restart — the detail screen
      // resolves it through the catalog store's custom fallback.
      const fragrance: Fragrance = best ?? useCustomFragranceStore.getState().add({
        name,
        brand,
        image_url: customImageUrl,
      });

      const wardrobeId = useWardrobeStore.getState().add({
        fragrance_id: fragrance.id,
        status: 'have',
        unit_type: 'bottle',
        size_ml: 0,
        remaining_ml: 0,
      });
      if (wardrobeId === WARDROBE_CAP_HIT) {
        track(EVENTS.WARDROBE_CAP_HIT, {
          wardrobe_count: useWardrobeStore.getState().items.length,
          status: 'have',
          source: 'scan',
        });
        router.push('/paywall?from=wardrobe_cap' as any);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast();
      // For catalog matches navigate to detail; for custom items go to wardrobe
      setTimeout(() => {
        if (best) router.replace(`/fragrance/${best.id}` as any);
        else router.replace('/(tabs)/wardrobe' as any);
      }, 1600);
    } finally {
      setIsAdding(false);
    }
  };

  const tier = result ? getConfidenceTier(result.confidence) : 'unsure';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Close scan">
          <Ionicons name="close" size={28} color={COLORS.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Perfume Concierge</Text>
        <View style={{ width: 28 }} />
      </View>

      {/* ── Ready state ── */}
      {state === 'ready' && (
        <View style={styles.center}>
          <View style={styles.iconCircle}>
            <Ionicons name="sparkles" size={36} color={COLORS.accent} />
          </View>
          <Text style={styles.heroTitle}>Identify a Fragrance</Text>
          <Text style={styles.heroSub}>
            Take a photo of a perfume bottle — our AI will identify it for you.
          </Text>
          <View style={styles.tipsCard}>
            <Tip icon="scan-outline" text="Fill the frame with the bottle" />
            <Tip icon="sunny-outline" text="Even, bright lighting works best" />
            <Tip icon="hand-left-outline" text="Hold steady, keep the label visible" />
          </View>
          <Pressable style={styles.conciergeBtn} onPress={handleCapture} accessibilityLabel="Perfume Concierge">
            <Ionicons name="sparkles" size={16} color={COLORS.white} />
            <Text style={styles.conciergeBtnText}>Perfume Concierge</Text>
          </Pressable>
          <Pressable style={styles.galleryBtn} onPress={handleGallery} accessibilityLabel="Choose from Library">
            <Ionicons name="images-outline" size={16} color={COLORS.muted} />
            <Text style={styles.galleryBtnText}>Choose from Library</Text>
          </Pressable>
          <Pressable
            style={styles.galleryBtn}
            onPress={() => { setPhotoUri(null); setState('no_match'); }}
            accessibilityLabel="Add a fragrance manually"
          >
            <Ionicons name="create-outline" size={16} color={COLORS.muted} />
            <Text style={styles.galleryBtnText}>Add a fragrance manually</Text>
          </Pressable>
          {!isPro && (
            <Text style={styles.scanLimitHint}>
              {remainingScans} of {FREE_LIFETIME_SCAN_LIMIT} free scans left
            </Text>
          )}
        </View>
      )}

      {/* ── Scanning / shimmer state ── */}
      {state === 'scanning' && (
        <View style={styles.center}>
          {photoUri && (
            <View style={styles.shimmerWrap}>
              <Image source={{ uri: photoUri }} style={styles.scanImage} />
              <ShimmerOverlay />
            </View>
          )}
          <Text style={styles.scanningTitle}>Identifying your fragrance</Text>
          <Text style={styles.scanningHint}>Reading the label and bottle shape...</Text>
        </View>
      )}

      {/* ── Result state ── */}
      {state === 'result' && result && (
        <View style={styles.center}>
          {photoUri && <Image source={{ uri: photoUri }} style={styles.resultImage} />}
          <View style={[styles.resultCard, tier === 'exact' && styles.resultCardExact, tier === 'likely' && styles.resultCardLikely]}>
            <Text style={[styles.resultKicker, tier === 'exact' && styles.resultKickerExact]}>
              {CONFIDENCE_LABELS[tier]}
            </Text>
            <Text style={styles.resultBrand}>{result.brand?.toUpperCase() ?? 'UNKNOWN'}</Text>
            <Text style={styles.resultName}>{result.name}</Text>
            <Text style={styles.resultConf}>{Math.round(result.confidence * 100)}% confident</Text>
          </View>
          <Text style={styles.confirmLabel}>Does this look right?</Text>
          <View style={styles.btnRow}>
            <Pressable style={styles.confirmBtn} onPress={handleConfirm}>
              <Ionicons name="checkmark-circle" size={18} color={COLORS.white} />
              <Text style={styles.confirmBtnText}>Yes, confirm</Text>
            </Pressable>
            <Pressable style={styles.rejectBtn} onPress={() => router.replace('/(tabs)/discover' as any)}>
              <Text style={styles.rejectBtnText}>Not quite...</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ── No match → quick-add form ── */}
      {state === 'no_match' && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.quickAddScroll}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
            showsVerticalScrollIndicator={false}
          >
            {photoUri && (
              <Image source={{ uri: photoUri }} style={styles.quickAddThumb} resizeMode="cover" />
            )}
            <Text style={styles.quickAddTitle}>Add it manually</Text>
            <Text style={styles.quickAddSub}>
              {photoUri
                ? "Couldn't read the label. Type what you know and we'll match it."
                : "Type what you know and we'll match it to our catalog, or add it to your wardrobe as is."}
            </Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>FRAGRANCE NAME</Text>
              <TextInput
                style={styles.fieldInput}
                value={quickAddName}
                onChangeText={setQuickAddName}
                placeholder="e.g. Libre"
                placeholderTextColor={COLORS.subtle}
                autoCorrect={false}
                autoCapitalize="words"
                returnKeyType="next"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>BRAND</Text>
              <TextInput
                style={styles.fieldInput}
                value={quickAddBrand}
                onChangeText={setQuickAddBrand}
                placeholder="e.g. Yves Saint Laurent"
                placeholderTextColor={COLORS.subtle}
                autoCorrect={false}
                autoCapitalize="words"
                returnKeyType="done"
                onSubmitEditing={handleQuickAdd}
              />
            </View>

            <Pressable
              style={[styles.confirmBtn, { marginTop: SPACING.lg, minWidth: '100%' }, (!quickAddName.trim() || isAdding) && { opacity: 0.5 }]}
              onPress={handleQuickAdd}
              disabled={!quickAddName.trim() || isAdding}
            >
              <Ionicons name="add-circle" size={18} color={COLORS.white} />
              <Text style={styles.confirmBtnText}>{isAdding ? 'Finding…' : 'Add to Wardrobe'}</Text>
            </Pressable>

            <Pressable style={styles.rejectBtn} onPress={handleRetry}>
              <Ionicons name="camera-outline" size={14} color={COLORS.muted} />
              <Text style={[styles.rejectBtnText, { marginLeft: 4 }]}>Retake Photo</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* Toast */}
      <RNAnimated.View style={[styles.toast, { opacity: toastOpacity }]} pointerEvents="none">
        <Ionicons name="checkmark-circle" size={16} color={COLORS.accent} />
        <Text style={styles.toastText}>Identified. Opening details</Text>
      </RNAnimated.View>
    </SafeAreaView>
  );
}

function Tip({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.tipRow}>
      <Ionicons name={icon} size={16} color={COLORS.accent} />
      <Text style={styles.tipText}>{text}</Text>
    </View>
  );
}

/** Accent-colored shimmer bar sweeping vertically over the photo. */
function ShimmerOverlay() {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.ease) }),
      -1, false,
    );
  }, []);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -260 + progress.value * 520 }],
  }));
  return (
    <View style={styles.shimmerClip} pointerEvents="none">
      <Animated.View style={[styles.shimmerBar, style]} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
  },
  headerTitle: { ...TYPE.label, letterSpacing: 1.5, color: COLORS.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl, gap: SPACING.md },

  iconCircle: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.accent,
    alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.sm,
  },
  heroTitle: { fontFamily: FONTS.serif, fontSize: 26, fontWeight: '600', color: COLORS.text, textAlign: 'center', lineHeight: 32 },
  heroSub: { ...TYPE.bodySmall, color: COLORS.muted, textAlign: 'center', paddingHorizontal: SPACING.sm },

  tipsCard: {
    backgroundColor: COLORS.card, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.md, gap: 10, width: '100%', marginTop: SPACING.md,
  },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  tipText: { ...TYPE.bodySmall, color: COLORS.text, flex: 1 },

  conciergeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.accent,
    paddingHorizontal: 40, paddingVertical: 16,
    borderRadius: RADIUS.full, minWidth: 240, justifyContent: 'center',
    marginTop: SPACING.lg,
  },
  conciergeBtnText: { ...TYPE.label, color: COLORS.white, letterSpacing: 1.5, fontSize: 14 },
  galleryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: SPACING.sm,
  },
  galleryBtnText: { ...TYPE.label, color: COLORS.muted, fontSize: 12, letterSpacing: 0.5 },
  scanLimitHint: { ...TYPE.caption, color: COLORS.subtle, fontStyle: 'italic', marginTop: SPACING.xs },

  // Shimmer
  shimmerWrap: { width: 220, height: 280, borderRadius: RADIUS.lg, overflow: 'hidden', marginBottom: SPACING.lg },
  scanImage: { width: '100%', height: '100%' },
  shimmerClip: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  shimmerBar: { position: 'absolute', left: 0, right: 0, height: 6, backgroundColor: COLORS.accent, opacity: 0.5, borderRadius: 3 },
  scanningTitle: { fontFamily: FONTS.serif, fontSize: 20, fontWeight: '600', color: COLORS.text, textAlign: 'center' },
  scanningHint: { ...TYPE.caption, color: COLORS.muted, fontStyle: 'italic' },

  // Result
  resultImage: { width: 180, height: 240, borderRadius: RADIUS.lg, marginBottom: SPACING.md },
  resultCard: {
    backgroundColor: COLORS.card, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.lg, alignItems: 'center', width: '100%',
  },
  resultCardExact: { borderColor: COLORS.accent, borderWidth: 2, shadowColor: COLORS.accent, shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  resultCardLikely: { borderColor: COLORS.accent, borderWidth: 1.5 },
  resultKicker: { ...TYPE.eyebrow, fontSize: 10, color: COLORS.muted, marginBottom: 6, letterSpacing: 2 },
  resultKickerExact: { color: COLORS.accent },
  resultBrand: { ...TYPE.eyebrow, fontSize: 10, marginBottom: 2 },
  resultName: { fontFamily: FONTS.serif, fontSize: 24, fontWeight: '600', color: COLORS.text, textAlign: 'center', lineHeight: 28 },
  resultConf: { ...TYPE.caption, color: COLORS.accent, marginTop: SPACING.sm },

  confirmLabel: { ...TYPE.bodySmall, color: COLORS.muted, fontStyle: 'italic', marginTop: SPACING.sm },
  btnRow: { gap: SPACING.sm, alignItems: 'center', marginTop: SPACING.sm },
  confirmBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.accent, paddingHorizontal: SPACING.xl, paddingVertical: 14,
    borderRadius: RADIUS.full, minWidth: 200, justifyContent: 'center',
  },
  confirmBtnText: { ...TYPE.label, color: COLORS.white, letterSpacing: 1 },
  rejectBtn: { paddingVertical: SPACING.sm },
  rejectBtnText: { ...TYPE.label, color: COLORS.muted, letterSpacing: 0.5 },

  // Quick-add form
  quickAddScroll: { alignItems: 'center', padding: SPACING.xl, paddingTop: SPACING.lg, gap: SPACING.md },
  quickAddThumb: { width: 120, height: 160, borderRadius: RADIUS.lg, marginBottom: SPACING.sm },
  quickAddTitle: { fontFamily: FONTS.serif, fontSize: 24, fontWeight: '600', color: COLORS.text, textAlign: 'center' },
  quickAddSub: { ...TYPE.bodySmall, color: COLORS.muted, textAlign: 'center', paddingHorizontal: SPACING.sm, marginBottom: SPACING.sm },
  fieldGroup: { width: '100%', gap: 6 },
  fieldLabel: { ...TYPE.eyebrow, fontSize: 10, color: COLORS.muted, letterSpacing: 1.5 },
  fieldInput: {
    backgroundColor: COLORS.card, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: SPACING.md, paddingVertical: 14,
    ...TYPE.body, color: COLORS.text,
  },

  // Toast
  toast: {
    position: 'absolute', bottom: 100, left: SPACING.xl, right: SPACING.xl,
    flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center',
    backgroundColor: COLORS.card, borderRadius: RADIUS.full,
    borderWidth: 1, borderColor: COLORS.border,
    paddingVertical: 12, paddingHorizontal: SPACING.lg,
    shadowColor: COLORS.black, shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
  },
  toastText: { ...TYPE.label, fontSize: 13, color: COLORS.text, letterSpacing: 0.5 },
});
