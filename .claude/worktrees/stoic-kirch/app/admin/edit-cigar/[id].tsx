// Edit Cigar — detail form. Fetches the existing cigars row by id,
// lets the admin edit any field (same shape as Add Cigar), and
// persists via UPDATE. Also exposes Delete (admin-only RLS from
// migration 016).
//
// Shares visual language with /admin/add-cigar but deliberately not
// sharing code — the behaviors diverge (load+populate, UPDATE vs
// INSERT, delete option) enough that a common abstraction would save
// fewer lines than it would obscure. Revisit if/when a third similar
// surface appears.

import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Image,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '@/lib/supabase';
import { Alert } from '@/src/components/ui/StyledAlert';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { AdminOnly } from '@/src/features/admin/AdminOnly';
import { captureException } from '@/src/lib/observability';
import { COLORS, FONTS, RADIUS, SPACING } from '@/src/constants/theme';
import type { Cigar } from '@/src/types/cigar';

export default function EditCigarDetailScreen() {
  return (
    <AdminOnly>
      <Editor />
    </AdminOnly>
  );
}

interface FormState {
  brand: string;
  line: string;
  name: string;
  vitola: string;
  origin: string;
  wrapper: string;
  binder: string;
  filler: string;
  strength: number;
  body: number;
  flavors: string;
  description: string;
  priceUsd: string;
  popularityTier: number;
}

function Editor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<FormState | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('cigars')
          .select('*')
          .eq('id', id)
          .single();
        if (error) throw error;
        const c = data as Cigar & {
          description?: string | null;
          popularity_tier?: number | null;
          price_usd_cents?: number | null;
          wrapper?: string | null;
          binder?: string | null;
          filler?: string[] | null;
          flavors?: string[] | null;
          origin?: string | null;
        };
        setState({
          brand: c.brand ?? '',
          line: c.line ?? '',
          name: c.name ?? '',
          vitola: c.vitola ?? '',
          origin: c.origin ?? '',
          wrapper: c.wrapper ?? '',
          binder: c.binder ?? '',
          filler: (c.filler ?? []).join(', '),
          strength: c.strength ?? 3,
          body: c.body ?? 3,
          flavors: (c.flavors ?? []).join(', '),
          description: c.description ?? '',
          priceUsd:
            c.price_usd_cents != null ? (c.price_usd_cents / 100).toFixed(2) : '',
          popularityTier: c.popularity_tier ?? 3,
        });
        setOriginalImageUrl(c.image_url ?? null);
        setPhotoUri(c.image_url ?? null);
      } catch (e) {
        captureException(e, { context: 'admin.editCigar.load' });
        Alert.alert('Load failed', 'Could not load this cigar.');
        router.back();
      } finally {
        setLoading(false);
      }
    })();
  }, [id, router]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setState((s) => (s ? { ...s, [k]: v } : s));

  const pickPhoto = async () => {
    Alert.alert('Replace photo', 'Take a new photo or choose one?', [
      {
        text: 'Take photo',
        onPress: async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) {
            Alert.alert('Camera access needed', 'Enable camera access in Settings.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ]);
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.85,
          });
          if (!result.canceled && result.assets[0]?.uri) setPhotoUri(result.assets[0].uri);
        },
      },
      {
        text: 'Choose from library',
        onPress: async () => {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted) return;
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.85,
          });
          if (!result.canceled && result.assets[0]?.uri) setPhotoUri(result.assets[0].uri);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const uploadPhotoIfNew = async (): Promise<string | null> => {
    if (!photoUri) return null;
    if (photoUri === originalImageUrl) return originalImageUrl;
    if (photoUri.startsWith('http://') || photoUri.startsWith('https://')) return photoUri;
    const resized = await ImageManipulator.manipulateAsync(
      photoUri,
      [{ resize: { width: 1024 } }],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
    );
    const res = await fetch(resized.uri);
    const blob = await res.blob();
    const fileName = `admin-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    const path = `admin-catalog/${fileName}`;
    const { error } = await supabase.storage
      .from('cigar-images')
      .upload(path, blob, { contentType: 'image/jpeg' });
    if (error) throw error;
    const { data } = supabase.storage.from('cigar-images').getPublicUrl(path);
    return data.publicUrl;
  };

  const parseList = (s: string): string[] =>
    s.split(',').map((x) => x.trim()).filter(Boolean);

  const save = async () => {
    if (!state || !id) return;
    if (!state.brand.trim() || !state.line.trim() || !state.vitola.trim() || !state.origin.trim()) {
      return Alert.alert('Missing', 'Brand, line, vitola, origin are all required.');
    }
    setSubmitting(true);
    try {
      const imageUrl = await uploadPhotoIfNew();
      const priceDollars = state.priceUsd.trim() === '' ? null : Number(state.priceUsd);
      const update = {
        brand: state.brand.trim(),
        line: state.line.trim(),
        name: state.name.trim() || `${state.brand.trim()} ${state.line.trim()}`,
        vitola: state.vitola.trim(),
        origin: state.origin.trim(),
        wrapper: state.wrapper.trim() || null,
        binder: state.binder.trim() || null,
        filler: parseList(state.filler),
        strength: state.strength,
        body: state.body,
        flavors: parseList(state.flavors),
        description: state.description.trim() || null,
        price_usd_cents:
          priceDollars === null || Number.isNaN(priceDollars)
            ? null
            : Math.round(priceDollars * 100),
        popularity_tier: state.popularityTier,
        image_url: imageUrl,
      };
      const { error } = await supabase.from('cigars').update(update).eq('id', id);
      if (error) throw error;
      Alert.alert('Saved', `${update.name} updated.`);
      router.back();
    } catch (e: any) {
      captureException(e, { context: 'admin.editCigar.save' });
      Alert.alert('Save failed', e?.message ?? 'Could not save. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = () => {
    if (!id || !state) return;
    Alert.alert(
      'Delete this cigar?',
      `${state.brand} / ${state.line} will be removed from the catalog. Any humidor entries referencing it may be affected. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setSubmitting(true);
              const { error } = await supabase.from('cigars').delete().eq('id', id);
              if (error) throw error;
              Alert.alert('Deleted', 'Cigar removed.');
              router.back();
            } catch (e: any) {
              captureException(e, { context: 'admin.editCigar.delete' });
              Alert.alert('Delete failed', e?.message ?? 'Could not delete.');
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
    );
  };

  if (loading || !state) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Card style={styles.photoCard}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
        ) : (
          <View style={[styles.photo, styles.photoPlaceholder]}>
            <Ionicons name="image-outline" size={40} color={COLORS.muted} />
          </View>
        )}
        <Pressable onPress={pickPhoto} style={styles.photoButton}>
          <Ionicons name="camera-outline" size={18} color={COLORS.accent} />
          <Text style={styles.photoButtonText}>Replace photo</Text>
        </Pressable>
      </Card>

      <Text style={styles.sectionLabel}>IDENTITY</Text>
      <Field label="Brand *" value={state.brand} onChange={(v) => set('brand', v)} />
      <Field label="Line *" value={state.line} onChange={(v) => set('line', v)} />
      <Field label="Name" value={state.name} onChange={(v) => set('name', v)} />
      <Field label="Vitola *" value={state.vitola} onChange={(v) => set('vitola', v)} />
      <Field label="Origin *" value={state.origin} onChange={(v) => set('origin', v)} />

      <Text style={styles.sectionLabel}>CONSTRUCTION</Text>
      <Field label="Wrapper" value={state.wrapper} onChange={(v) => set('wrapper', v)} />
      <Field label="Binder" value={state.binder} onChange={(v) => set('binder', v)} />
      <Field
        label="Filler (comma-separated)"
        value={state.filler}
        onChange={(v) => set('filler', v)}
      />

      <Text style={styles.sectionLabel}>PROFILE</Text>
      <SegmentField label="Strength" value={state.strength} onChange={(v) => set('strength', v)} />
      <SegmentField label="Body" value={state.body} onChange={(v) => set('body', v)} />
      <SegmentField
        label="Popularity"
        value={state.popularityTier}
        onChange={(v) => set('popularityTier', v)}
      />
      <Field
        label="Flavors (comma-separated)"
        value={state.flavors}
        onChange={(v) => set('flavors', v)}
      />

      <Text style={styles.sectionLabel}>DETAILS</Text>
      <Field
        label="Description"
        value={state.description}
        onChange={(v) => set('description', v)}
        multiline
      />
      <Field
        label="Price (USD)"
        value={state.priceUsd}
        onChange={(v) => set('priceUsd', v)}
        keyboardType="decimal-pad"
      />

      <View style={{ height: SPACING.md }} />
      <Button
        title={submitting ? 'Saving…' : 'Save changes'}
        onPress={save}
        disabled={submitting}
        loading={submitting}
      />
      <Button
        title="Cancel"
        onPress={() => router.back()}
        variant="ghost"
        style={{ marginTop: SPACING.sm }}
      />
      <View style={{ height: SPACING.lg }} />
      <Pressable onPress={onDelete} style={styles.deleteRow}>
        <Ionicons name="trash-outline" size={16} color="#CC4444" />
        <Text style={styles.deleteText}>Delete cigar</Text>
      </Pressable>
      <View style={{ height: SPACING.xxl }} />
    </ScrollView>
  );
}

// ---- Shared field helpers (same UX as add-cigar.tsx; duplicated
// intentionally — extracting a shared module would save < 30 lines
// at the cost of one more cross-file dependency). ----

function Field({
  label,
  value,
  onChange,
  keyboardType,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  keyboardType?: 'default' | 'decimal-pad';
  multiline?: boolean;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholderTextColor={COLORS.subtle}
        keyboardType={keyboardType ?? 'default'}
        multiline={multiline}
        style={[styles.fieldInput, multiline && styles.fieldInputMulti]}
        autoCorrect={false}
        autoCapitalize="words"
      />
    </View>
  );
}

function SegmentField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.segmentRow}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            onPress={() => onChange(n)}
            style={[styles.segment, value === n && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, value === n && styles.segmentTextActive]}>
              {n}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bg,
  },
  content: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  photoCard: {
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.md,
  },
  photo: {
    width: 140,
    height: 140,
    borderRadius: RADIUS.md,
  },
  photoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.card2 ?? COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
  },
  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderRadius: RADIUS.full,
  },
  photoButtonText: {
    fontFamily: 'Cormorant',
    color: COLORS.accent,
    fontWeight: '700',
  },
  sectionLabel: {
    fontFamily: 'Cormorant',
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.subtle,
    letterSpacing: 2,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  fieldWrap: { marginBottom: SPACING.sm },
  fieldLabel: {
    fontFamily: 'Cormorant',
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.muted,
    marginBottom: 4,
  },
  fieldInput: {
    fontFamily: 'Cormorant',
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.text,
  },
  fieldInputMulti: { minHeight: 90, textAlignVertical: 'top' },
  segmentRow: { flexDirection: 'row', gap: 6 },
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    alignItems: 'center',
  },
  segmentActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  segmentText: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  segmentTextActive: { color: COLORS.bg },
  deleteRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  deleteText: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    fontWeight: '700',
    color: '#CC4444',
  },
});
