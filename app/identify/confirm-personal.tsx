/**
 * Perfume Concierge — Confirm / Add screen.
 *
 * Universal post-scan landing. Every scan routes here, matched or not.
 * Mirrors Pour Picks' confirm-personal.tsx:
 *   - Confidence badge (Likely match / Best guess / Possible match)
 *   - Photo preview from scan
 *   - Editable Brand, Name, Concentration fields (pre-filled by AI or empty)
 *   - Suggest-for-catalog toggle when no catalog match
 *   - "Describe instead" fallback for empty/bad AI reads
 *   - Cancel discards the scan
 */

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DescribeFragranceSheet } from '@/src/components/identify/DescribeFragranceSheet';
import { SuggestFragranceSheet } from '@/src/components/identify/SuggestFragranceSheet';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '@/src/constants/theme';
import { getDeviceId } from '@/src/lib/deviceId';
import { track, EVENTS } from '@/src/lib/observability';
import { supabase } from '@/lib/supabase';
import { useWardrobeStore } from '@/src/stores/useWardrobeStore';

type ConfidenceTier = 'likely' | 'best_guess' | 'possible' | 'none';

function getConfidenceTier(c: number): ConfidenceTier {
  if (c >= 0.7) return 'likely';
  if (c >= 0.4) return 'best_guess';
  if (c > 0) return 'possible';
  return 'none';
}

const TIER_LABELS: Record<ConfidenceTier, string> = {
  likely: 'Likely match',
  best_guess: 'Best guess',
  possible: 'Possible match',
  none: '',
};

const CONCENTRATIONS = [
  'Eau de Parfum',
  'Eau de Toilette',
  'Extrait de Parfum',
  'Parfum',
  'Eau de Cologne',
  'Eau Fraîche',
];

export default function ConfirmPersonalScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    scanId: string;
    fragranceId: string;
    brand: string;
    name: string;
    concentration: string;
    confidence: string;
    reasoning: string;
    imageUri: string;
  }>();

  const hasCatalogMatch = !!params.fragranceId;
  const confidence = parseFloat(params.confidence || '0');
  const tier = getConfidenceTier(confidence);
  const hasAIRead = !!(params.brand || params.name);

  const [brand, setBrand] = useState(params.brand || '');
  const [name, setName] = useState(params.name || '');
  const [concentration, setConcentration] = useState(params.concentration || '');
  const [suggestForCatalog, setSuggestForCatalog] = useState(!hasCatalogMatch);
  const [saving, setSaving] = useState(false);
  const [describeVisible, setDescribeVisible] = useState(false);
  const [suggestVisible, setSuggestVisible] = useState(false);

  const handleSave = async () => {
    const b = brand.trim();
    const n = name.trim();
    if (!n) {
      Alert.alert('Name required', 'Enter a fragrance name to continue.');
      return;
    }

    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Mark scan as confirmed
      if (params.scanId) {
        await supabase
          .from('scan_images')
          .update({ user_confirmed: true })
          .eq('id', params.scanId);
      }

      // If catalog match and unedited → add to wardrobe + navigate to detail
      if (hasCatalogMatch && b === params.brand && n === params.name) {
        useWardrobeStore.getState().add({
          fragrance_id: params.fragranceId,
          status: 'have',
          unit_type: 'bottle',
          size_ml: 0,
          remaining_ml: 0,
        });

        track(EVENTS.SCAN_CONFIRMED, {
          fragrance_id: params.fragranceId,
          confidence,
          edited: false,
        });

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace(`/(tabs)/fragrance/${params.fragranceId}` as any);
        return;
      }

      // Catalog match but user edited, or no match — add wardrobe item if we have a catalog ID
      if (hasCatalogMatch) {
        useWardrobeStore.getState().add({
          fragrance_id: params.fragranceId,
          status: 'have',
          unit_type: 'bottle',
          size_ml: 0,
          remaining_ml: 0,
        });
        track(EVENTS.SCAN_CONFIRMED, {
          fragrance_id: params.fragranceId,
          confidence,
          edited: true,
        });
      }

      // Submit suggestion for catalog
      if (suggestForCatalog && b && n) {
        const deviceId = await getDeviceId();
        const { data: { user } } = await supabase.auth.getUser();

        await supabase.from('fragrance_submissions').insert({
          user_id: user?.id ?? null,
          device_id: deviceId,
          brand: b,
          name: n,
          concentration: concentration.trim() || null,
          scan_image_id: params.scanId || null,
        });
        track(EVENTS.SCAN_SUGGEST_SUBMITTED, { brand: b, name: n });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (hasCatalogMatch) {
        router.replace(`/(tabs)/fragrance/${params.fragranceId}` as any);
      } else {
        router.replace('/(tabs)/wardrobe' as any);
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    Alert.alert(
      'Discard this scan?',
      'This will count toward your free scans.',
      [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => router.replace('/(tabs)' as any),
        },
      ]
    );
  };

  // Describe sheet matched a fragrance → navigate to detail
  const handleDescribeMatch = (result: any) => {
    setDescribeVisible(false);
    if (result.fragranceId) {
      router.replace(`/(tabs)/fragrance/${result.fragranceId}` as any);
    } else {
      // Fill in whatever the describe path found
      if (result.displayBrand && result.displayBrand !== 'Unknown') setBrand(result.displayBrand);
      if (result.displayName && result.displayName !== 'Unknown') setName(result.displayName);
      if (result.displayConcentration) setConcentration(result.displayConcentration);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable onPress={handleCancel} hitSlop={12}>
            <Ionicons name="close" size={24} color={COLORS.text} />
          </Pressable>
          <Text style={styles.headerTitle}>PERFUME CONCIERGE</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {/* Confidence badge */}
          {tier !== 'none' && (
            <View style={[styles.badge, tier === 'likely' && styles.badgeLikely]}>
              <Ionicons
                name={tier === 'likely' ? 'checkmark-circle' : 'help-circle'}
                size={14}
                color={tier === 'likely' ? COLORS.accent : COLORS.muted}
              />
              <Text style={[styles.badgeText, tier === 'likely' && { color: COLORS.accent }]}>
                {TIER_LABELS[tier]}
              </Text>
            </View>
          )}

          {/* Heading */}
          <Text style={styles.heading}>
            {hasCatalogMatch ? 'Confirm or edit' : hasAIRead ? 'We read this from the label' : 'Add fragrance details'}
          </Text>
          <Text style={styles.subheading}>
            {hasCatalogMatch
              ? 'Editing will save a personal copy.'
              : 'Fill in what you know — we\'ll suggest it for the catalog.'}
          </Text>

          {/* Photo preview */}
          {params.imageUri ? (
            <Image source={{ uri: params.imageUri }} style={styles.photo} />
          ) : null}

          {/* AI reasoning (if any) */}
          {params.reasoning && hasAIRead ? (
            <View style={styles.reasoningCard}>
              <Ionicons name="sparkles" size={12} color={COLORS.accent} />
              <Text style={styles.reasoningText}>{params.reasoning}</Text>
            </View>
          ) : null}

          {/* Name field (required) */}
          <Text style={styles.label}>Fragrance Name *</Text>
          <TextInput
            style={[styles.input, !name.trim() && styles.inputError]}
            placeholder="e.g. Lost Cherry, Baccarat Rouge 540"
            placeholderTextColor={COLORS.subtle}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="next"
          />
          {!name.trim() && <Text style={styles.errorHint}>Name required</Text>}

          {/* Brand field */}
          <Text style={styles.label}>
            Brand / House <Text style={styles.labelDim}>(optional)</Text>
          </Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Tom Ford, Maison Francis Kurkdjian"
            placeholderTextColor={COLORS.subtle}
            value={brand}
            onChangeText={setBrand}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
          />

          {/* Concentration pills */}
          <Text style={styles.label}>
            Concentration <Text style={styles.labelDim}>(optional)</Text>
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pillRow}
          >
            {CONCENTRATIONS.map((c) => {
              const short = c
                .replace('Eau de ', '')
                .replace('Extrait de ', 'Extrait ')
                .replace('Eau ', '');
              const active = concentration === c;
              return (
                <Pressable
                  key={c}
                  style={[styles.pill, active && styles.pillActive]}
                  onPress={() => setConcentration(active ? '' : c)}
                >
                  <Text style={[styles.pillText, active && styles.pillTextActive]}>
                    {short}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Suggest toggle (only when no catalog match) */}
          {!hasCatalogMatch && (
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>Suggest for catalog</Text>
                <Text style={styles.toggleHint}>
                  We'll review and may add it. Your scan is never shared.
                </Text>
              </View>
              <Switch
                value={suggestForCatalog}
                onValueChange={setSuggestForCatalog}
                trackColor={{ true: COLORS.accent, false: COLORS.border }}
                thumbColor={COLORS.white}
              />
            </View>
          )}

          {/* Describe fallback — shown when AI couldn't fill fields */}
          {!hasAIRead && (
            <Pressable
              style={styles.describeLink}
              onPress={() => setDescribeVisible(true)}
            >
              <Ionicons name="chatbubble-outline" size={16} color={COLORS.accent} />
              <Text style={styles.describeLinkText}>
                Describe it in words instead
              </Text>
            </Pressable>
          )}
        </ScrollView>

        {/* Action buttons */}
        <View style={styles.footer}>
          <Pressable
            style={[styles.saveBtn, (saving || !name.trim()) && { opacity: 0.5 }]}
            onPress={handleSave}
            disabled={saving || !name.trim()}
          >
            {saving ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <>
                <Ionicons name="checkmark" size={18} color={COLORS.white} />
                <Text style={styles.saveBtnText}>
                  {hasCatalogMatch ? 'Confirm' : 'Add to wardrobe'}
                </Text>
              </>
            )}
          </Pressable>

          <Pressable style={styles.cancelBtn} onPress={handleCancel}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Sheets */}
      <DescribeFragranceSheet
        visible={describeVisible}
        onClose={() => setDescribeVisible(false)}
        onMatch={handleDescribeMatch}
        onNoMatch={() => {
          setDescribeVisible(false);
          setSuggestVisible(true);
        }}
      />
      <SuggestFragranceSheet
        visible={suggestVisible}
        onClose={() => setSuggestVisible(false)}
        scanId={params.scanId}
        prefill={{ brand, name, concentration }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
  },
  headerTitle: { ...TYPE.eyebrow, letterSpacing: 2 },
  content: {
    paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl, gap: 2,
  },

  // Badge
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.card, borderRadius: RADIUS.full,
    borderWidth: 1, borderColor: COLORS.border,
    paddingVertical: 6, paddingHorizontal: 14,
    alignSelf: 'flex-start', marginBottom: SPACING.sm,
  },
  badgeLikely: { borderColor: COLORS.accent },
  badgeText: { ...TYPE.caption, color: COLORS.muted },

  // Heading
  heading: {
    fontFamily: FONTS.serif, fontSize: 24, fontWeight: '600',
    color: COLORS.text, lineHeight: 30, marginBottom: 4,
  },
  subheading: {
    ...TYPE.bodySmall, color: COLORS.muted, marginBottom: SPACING.md,
  },

  // Photo
  photo: {
    width: '100%', height: 200, borderRadius: RADIUS.lg,
    marginBottom: SPACING.md, backgroundColor: COLORS.card,
  },

  // Reasoning
  reasoningCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: COLORS.card, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.sm, marginBottom: SPACING.md,
  },
  reasoningText: { ...TYPE.caption, color: COLORS.muted, flex: 1, lineHeight: 18 },

  // Form
  label: {
    fontFamily: FONTS.body, fontSize: 13, fontWeight: '600',
    color: COLORS.text, marginTop: SPACING.md, marginBottom: 4,
  },
  labelDim: { fontFamily: FONTS.body, fontWeight: '400', color: COLORS.subtle },
  input: {
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.md, paddingVertical: 12, paddingHorizontal: 14,
    fontFamily: FONTS.body, fontSize: 16, color: COLORS.text,
  },
  inputError: { borderColor: COLORS.danger },
  errorHint: { ...TYPE.caption, color: COLORS.danger, marginTop: 2 },

  // Concentration pills
  pillRow: { gap: 8, paddingVertical: 4 },
  pill: {
    paddingVertical: 6, paddingHorizontal: 14,
    borderRadius: RADIUS.full, borderWidth: 1,
    borderColor: COLORS.border, backgroundColor: COLORS.card,
  },
  pillActive: { borderColor: COLORS.accent, backgroundColor: COLORS.accent },
  pillText: { ...TYPE.caption, color: COLORS.muted, fontSize: 13 },
  pillTextActive: { color: COLORS.white },

  // Toggle
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    marginTop: SPACING.lg, paddingVertical: SPACING.sm,
  },
  toggleLabel: {
    fontFamily: FONTS.body, fontSize: 14, fontWeight: '600', color: COLORS.text,
  },
  toggleHint: { ...TYPE.caption, color: COLORS.subtle, marginTop: 2 },

  // Describe link
  describeLink: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: SPACING.lg, paddingVertical: SPACING.sm,
  },
  describeLinkText: {
    ...TYPE.label, color: COLORS.accent, letterSpacing: 0.3,
  },

  // Footer
  footer: {
    paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg,
    paddingTop: SPACING.sm, gap: SPACING.sm, alignItems: 'center',
  },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: COLORS.accent,
    borderRadius: RADIUS.full, paddingVertical: 14, width: '100%',
  },
  saveBtnText: {
    ...TYPE.label, color: COLORS.white, letterSpacing: 0.5, fontSize: 16,
  },
  cancelBtn: { paddingVertical: SPACING.sm },
  cancelBtnText: { ...TYPE.label, color: COLORS.muted, letterSpacing: 0.5 },
});
