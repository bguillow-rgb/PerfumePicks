// Admin Add Cigar — direct INSERT into the cigars table. Admins bypass
// the submission/moderation queue that non-admin "Suggest a Cigar"
// goes through — their inserts are the approval.
//
// Photo handling:
// - Optional. A cigar row without an image_url falls back to the brand
//   logo or initials at render time, so this form doesn't require one.
// - When provided: pick from camera or library -> upload to
//   `cigar-images` Storage bucket -> use returned public URL as
//   cigars.image_url.
//
// Validation is strict-enough-to-be-safe but lenient enough to allow
// the admin to skip optional fields without friction. RLS enforces
// admin-only writes even if a non-admin somehow reaches this screen
// (AdminOnly wrapper also blocks rendering).

import { useState, useEffect } from 'react';
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

type FormState = {
  brand: string;
  line: string;
  name: string; // auto-derived if blank
  vitola: string;
  origin: string;
  wrapper: string;
  binder: string;
  filler: string; // comma-separated
  strength: number; // 1-5
  body: number; // 1-5
  flavors: string; // comma-separated
  description: string;
  priceUsd: string; // dollars as string, stored cents on submit
  popularityTier: number; // 1-5, default 3
};

const initial: FormState = {
  brand: '',
  line: '',
  name: '',
  vitola: '',
  origin: '',
  wrapper: '',
  binder: '',
  filler: '',
  strength: 3,
  body: 3,
  flavors: '',
  description: '',
  priceUsd: '',
  popularityTier: 3,
};

export default function AddCigarScreen() {
  return (
    <AdminOnly>
      <Form />
    </AdminOnly>
  );
}

function Form() {
  const router = useRouter();
  // Optional params — used when this form is invoked from "Approve
  // Submission" on /admin/submissions. When present, brand/line/vitola/
  // notes/scanImageUrl seed the initial state, and submissionId triggers
  // a follow-up status update on successful insert so the submission is
  // marked merged.
  const params = useLocalSearchParams<{
    submissionId?: string;
    prefillBrand?: string;
    prefillLine?: string;
    prefillVitola?: string;
    prefillNotes?: string;
    scanImageUrl?: string;
  }>();
  const [state, setState] = useState<FormState>(() => ({
    ...initial,
    brand: params.prefillBrand ?? '',
    line: params.prefillLine ?? '',
    vitola: params.prefillVitola ?? '',
    description: params.prefillNotes ?? '',
  }));
  const [photoUri, setPhotoUri] = useState<string | null>(
    params.scanImageUrl ?? null,
  );
  const [submitting, setSubmitting] = useState(false);
  const submissionId = params.submissionId ?? null;
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setState((s) => ({ ...s, [k]: v }));

  const pickPhoto = async () => {
    Alert.alert('Add a photo', 'Take a new photo or choose one?', [
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
          if (!perm.granted) {
            Alert.alert('Photo library access needed', 'Enable in Settings.');
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.85,
            selectionLimit: 1,
          });
          if (!result.canceled && result.assets[0]?.uri) setPhotoUri(result.assets[0].uri);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // Resize -> upload -> return public URL. Throws on failure so the
  // outer submit() flow can surface the error and keep form data intact.
  // If photoUri is already a Supabase public URL (e.g. from an
  // approve-submission prefill), we reuse it as-is rather than
  // re-uploading.
  const uploadPhoto = async (): Promise<string | null> => {
    if (!photoUri) return null;
    // Already a hosted URL — reuse directly.
    if (photoUri.startsWith('http://') || photoUri.startsWith('https://')) {
      return photoUri;
    }
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
      .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (error) throw error;
    const { data } = supabase.storage.from('cigar-images').getPublicUrl(path);
    return data.publicUrl;
  };

  const parseList = (s: string): string[] =>
    s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);

  const submit = async () => {
    // Validation — match the regression plan's N2 spec.
    if (!state.brand.trim()) return Alert.alert('Missing', 'Brand is required.');
    if (!state.line.trim()) return Alert.alert('Missing', 'Line is required.');
    if (!state.vitola.trim()) return Alert.alert('Missing', 'Vitola is required.');
    if (!state.origin.trim()) return Alert.alert('Missing', 'Origin is required.');
    if (state.strength < 1 || state.strength > 5)
      return Alert.alert('Invalid', 'Strength must be 1–5.');
    if (state.body < 1 || state.body > 5) return Alert.alert('Invalid', 'Body must be 1–5.');

    const priceDollars = state.priceUsd.trim() === '' ? null : Number(state.priceUsd);
    if (priceDollars !== null && (Number.isNaN(priceDollars) || priceDollars < 0))
      return Alert.alert('Invalid', 'Price must be a non-negative number.');

    setSubmitting(true);
    try {
      let imageUrl: string | null = null;
      try {
        imageUrl = await uploadPhoto();
      } catch (e) {
        // Photo upload failed — warn and continue without photo rather
        // than losing all the text the admin just typed.
        captureException(e, { context: 'admin.addCigar.photoUpload' });
        const proceed = await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Photo upload failed',
            'Save the cigar without a photo?',
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Save without photo', onPress: () => resolve(true) },
            ],
          );
        });
        if (!proceed) {
          setSubmitting(false);
          return;
        }
      }

      const row = {
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
        price_usd_cents: priceDollars === null ? null : Math.round(priceDollars * 100),
        popularity_tier: state.popularityTier,
        image_url: imageUrl,
      };

      const { error } = await supabase.from('cigars').insert(row);
      if (error) throw error;

      // If this insert came from an "Approve Submission" flow, flip
      // that submission's status to merged now that the cigar is live.
      if (submissionId) {
        const { error: updErr } = await supabase
          .from('cigar_submissions')
          .update({ status: 'merged', reviewed_at: new Date().toISOString() })
          .eq('id', submissionId);
        if (updErr) {
          // Cigar landed but submission didn't flip. Not fatal — admin
          // can re-mark later. Warn but don't roll back the cigar insert.
          captureException(updErr, { context: 'admin.approveSubmission.status' });
          Alert.alert(
            'Added, but…',
            `${row.name} was added, but we couldn't mark the submission as merged. You can fix it on the submissions screen.`,
          );
          router.back();
          return;
        }
      }

      Alert.alert(
        'Added',
        submissionId
          ? `${row.name} added and submission merged.`
          : `${row.name} added to the catalog.`,
      );
      setState(initial);
      setPhotoUri(null);
      router.back();
    } catch (e: any) {
      captureException(e, { context: 'admin.addCigar.insert' });
      Alert.alert('Save failed', e?.message ?? 'Could not save cigar. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Photo section */}
      <Card style={styles.photoCard}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
        ) : (
          <View style={[styles.photo, styles.photoPlaceholder]}>
            <Ionicons name="image-outline" size={40} color={COLORS.muted} />
            <Text style={styles.photoPlaceholderText}>No photo yet</Text>
          </View>
        )}
        <Pressable onPress={pickPhoto} style={styles.photoButton}>
          <Ionicons name="camera-outline" size={18} color={COLORS.accent} />
          <Text style={styles.photoButtonText}>
            {photoUri ? 'Replace photo' : 'Add photo'}
          </Text>
        </Pressable>
        {photoUri && (
          <Pressable onPress={() => setPhotoUri(null)}>
            <Text style={styles.removePhoto}>Remove</Text>
          </Pressable>
        )}
      </Card>

      {/* Required identity block */}
      <Text style={styles.sectionLabel}>IDENTITY</Text>
      <Field label="Brand *" value={state.brand} onChange={(v) => set('brand', v)} />
      <Field label="Line *" value={state.line} onChange={(v) => set('line', v)} />
      <Field
        label="Display name"
        value={state.name}
        onChange={(v) => set('name', v)}
        placeholder={
          state.brand && state.line
            ? `${state.brand} ${state.line}`
            : 'Auto-derived from brand + line'
        }
      />
      <Field label="Vitola *" value={state.vitola} onChange={(v) => set('vitola', v)} />
      <Field
        label="Origin *"
        value={state.origin}
        onChange={(v) => set('origin', v)}
        placeholder="Nicaragua, Honduras, Dominican Republic…"
      />

      {/* Construction */}
      <Text style={styles.sectionLabel}>CONSTRUCTION</Text>
      <Field
        label="Wrapper"
        value={state.wrapper}
        onChange={(v) => set('wrapper', v)}
        placeholder="Ecuadorian Habano"
      />
      <Field label="Binder" value={state.binder} onChange={(v) => set('binder', v)} />
      <Field
        label="Filler (comma-separated)"
        value={state.filler}
        onChange={(v) => set('filler', v)}
        placeholder="Nicaraguan, Dominican"
      />

      {/* Profile */}
      <Text style={styles.sectionLabel}>PROFILE</Text>
      <SegmentField
        label="Strength"
        value={state.strength}
        onChange={(v) => set('strength', v)}
      />
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
        placeholder="cedar, leather, pepper"
      />

      {/* Copy */}
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
        placeholder="9.50"
      />

      <View style={{ height: SPACING.md }} />
      <Button
        title={submitting ? 'Saving…' : 'Add to catalog'}
        onPress={submit}
        disabled={submitting}
        loading={submitting}
      />
      <Button
        title="Cancel"
        onPress={() => router.back()}
        variant="ghost"
        style={{ marginTop: SPACING.sm }}
      />
      {submitting && (
        <View style={{ alignItems: 'center', marginTop: SPACING.md }}>
          <ActivityIndicator color={COLORS.accent} />
        </View>
      )}
    </ScrollView>
  );
}

// ---- Field helpers ----

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'decimal-pad' | 'numeric' | 'email-address';
  multiline?: boolean;
}

function Field({ label, value, onChange, placeholder, keyboardType, multiline }: FieldProps) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
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

interface SegmentFieldProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
}

function SegmentField({ label, value, onChange }: SegmentFieldProps) {
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
            <Text
              style={[styles.segmentText, value === n && styles.segmentTextActive]}
            >
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
  photoPlaceholderText: {
    fontFamily: 'Cormorant',
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 4,
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
  removePhoto: {
    fontFamily: 'Cormorant',
    color: COLORS.muted,
    textDecorationLine: 'underline',
    fontSize: 13,
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
  fieldWrap: {
    marginBottom: SPACING.sm,
  },
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
  fieldInputMulti: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 6,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  segmentText: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  segmentTextActive: {
    color: COLORS.bg,
  },
});
