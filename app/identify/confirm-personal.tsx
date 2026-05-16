/**
 * Perfume Concierge — Confirm / Add screen.
 *
 * Mirrors Pour Picks' confirm-personal.tsx:
 *   - Editable brand/name/concentration before save
 *   - Catalog-match mode: pre-fills from catalog, "Likely match" badge
 *   - Add mode: blank form for user to fill
 *   - Suggest-for-catalog toggle for unrecognized fragrances
 *   - Photo persisted from scan
 */

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
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

import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '@/src/constants/theme';
import { getDeviceId } from '@/src/lib/deviceId';
import { track, EVENTS } from '@/src/lib/observability';
import { supabase } from '@/lib/supabase';
import { useWardrobeStore } from '@/src/stores/useWardrobeStore';

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
    imageUri: string;
  }>();

  const hasCatalogMatch = !!params.fragranceId;
  const confidence = parseFloat(params.confidence || '0');

  const [brand, setBrand] = useState(params.brand || '');
  const [name, setName] = useState(params.name || '');
  const [concentration, setConcentration] = useState(params.concentration || '');
  const [suggestForCatalog, setSuggestForCatalog] = useState(!hasCatalogMatch);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const b = brand.trim();
    const n = name.trim();
    if (!b || !n) {
      Alert.alert('Missing info', 'Brand and fragrance name are required.');
      return;
    }

    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // If catalog match exists and user didn't edit, navigate to detail
      if (hasCatalogMatch && b === params.brand && n === params.name) {
        // Mark scan as confirmed
        if (params.scanId) {
          await supabase
            .from('scan_images')
            .update({ user_confirmed: true })
            .eq('id', params.scanId);
        }

        track(EVENTS.SCAN_CONFIRMED, {
          fragrance_id: params.fragranceId,
          confidence,
          edited: false,
        });

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace(`/(tabs)/fragrance/${params.fragranceId}` as any);
        return;
      }

      // User edited or no catalog match — add to wardrobe as want + submit suggestion
      const addItem = useWardrobeStore.getState().add;
      if (hasCatalogMatch) {
        // They edited a catalog match — still add the catalog fragrance
        addItem({
          fragrance_id: params.fragranceId,
          status: 'want',
          unit_type: 'bottle',
          size_ml: 0,
          remaining_ml: 0,
        });
        if (params.scanId) {
          await supabase
            .from('scan_images')
            .update({ user_confirmed: true })
            .eq('id', params.scanId);
        }
        track(EVENTS.SCAN_CONFIRMED, {
          fragrance_id: params.fragranceId,
          confidence,
          edited: true,
        });
      }

      // Submit suggestion for catalog if toggled on
      if (suggestForCatalog) {
        const deviceId = await getDeviceId();
        const {
          data: { user },
        } = await supabase.auth.getUser();

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
        Alert.alert(
          'Added!',
          suggestForCatalog
            ? "We'll review this fragrance for our catalog."
            : 'Fragrance noted.',
          [{ text: 'OK', onPress: () => router.replace('/(tabs)/wardrobe' as any) }]
        );
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </Pressable>
          <Text style={styles.headerTitle}>
            {hasCatalogMatch ? 'CONFIRM FRAGRANCE' : 'ADD FRAGRANCE'}
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {/* Photo preview */}
          {params.imageUri ? (
            <Image source={{ uri: params.imageUri }} style={styles.photo} />
          ) : null}

          {/* Catalog match badge */}
          {hasCatalogMatch && (
            <View style={styles.matchBadge}>
              <Ionicons name="checkmark-circle" size={14} color={COLORS.accent} />
              <Text style={styles.matchBadgeText}>
                Likely match · {Math.round(confidence * 100)}% confident
              </Text>
            </View>
          )}

          {/* Brand */}
          <Text style={styles.label}>Brand / House *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Tom Ford"
            placeholderTextColor={COLORS.subtle}
            value={brand}
            onChangeText={setBrand}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="next"
          />

          {/* Fragrance name */}
          <Text style={styles.label}>Fragrance Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Lost Cherry"
            placeholderTextColor={COLORS.subtle}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="next"
          />

          {/* Concentration picker */}
          <Text style={styles.label}>
            Concentration{' '}
            <Text style={styles.labelDim}>(optional)</Text>
          </Text>
          <View style={styles.concRow}>
            {CONCENTRATIONS.map((c) => {
              const active = concentration === c;
              return (
                <Pressable
                  key={c}
                  style={[styles.concPill, active && styles.concPillActive]}
                  onPress={() => setConcentration(active ? '' : c)}
                >
                  <Text
                    style={[
                      styles.concPillText,
                      active && styles.concPillTextActive,
                    ]}
                  >
                    {c.replace('Eau de ', '').replace('Extrait de ', 'Extrait ')}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Suggest for catalog toggle */}
          {!hasCatalogMatch && (
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>Suggest for catalog</Text>
                <Text style={styles.toggleHint}>
                  We'll review and add it if we can verify it
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
        </ScrollView>

        {/* Save button */}
        <View style={styles.footer}>
          <Pressable
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            <Ionicons name="checkmark" size={18} color={COLORS.white} />
            <Text style={styles.saveBtnText}>
              {hasCatalogMatch ? 'Confirm' : 'Save'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  headerTitle: { ...TYPE.eyebrow, letterSpacing: 2 },
  content: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
    gap: 4,
  },
  photo: {
    width: '100%',
    height: 200,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.md,
  },
  matchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.accent,
    paddingVertical: 6,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
    marginBottom: SPACING.md,
  },
  matchBadgeText: {
    ...TYPE.caption,
    color: COLORS.accent,
  },
  label: {
    fontFamily: FONTS.body,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: SPACING.md,
    marginBottom: 4,
  },
  labelDim: {
    fontFamily: FONTS.body,
    fontWeight: '400',
    color: COLORS.subtle,
  },
  input: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontFamily: FONTS.body,
    fontSize: 16,
    color: COLORS.text,
  },
  concRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  concPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  concPillActive: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accent,
  },
  concPillText: {
    ...TYPE.caption,
    color: COLORS.muted,
    fontSize: 12,
  },
  concPillTextActive: {
    color: COLORS.white,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginTop: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  toggleLabel: {
    fontFamily: FONTS.body,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  toggleHint: {
    ...TYPE.caption,
    color: COLORS.subtle,
    marginTop: 2,
  },
  footer: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
    paddingTop: SPACING.sm,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.full,
    paddingVertical: 14,
  },
  saveBtnText: {
    ...TYPE.label,
    color: COLORS.white,
    letterSpacing: 0.5,
    fontSize: 16,
  },
});
