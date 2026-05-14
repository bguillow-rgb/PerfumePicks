import { useState, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, TextInput, ScrollView, KeyboardAvoidingView, Platform, LayoutAnimation, UIManager,
} from 'react-native';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, FONTS, RADIUS } from '@/src/constants/theme';
import { useRouter } from 'expo-router';
import {
  useWardrobeStore, type WardrobeStatus, type UnitType, type WardrobeItem,
} from '@/src/stores/useWardrobeStore';
import { useProfileStore } from '@/src/stores/useProfileStore';
import { supabase } from '@/lib/supabase';
import { Alert } from '@/src/components/ui/StyledAlert';
import type { Fragrance } from '@/src/stores/useCatalogStore';

interface Props {
  visible: boolean;
  fragrance: Fragrance | null;
  onClose: () => void;
  onSaved?: (id: string) => void;
  /** Pre-select a status when the sheet opens (e.g. 'want' from the heart button). */
  initialStatus?: WardrobeStatus;
  /** When provided, the sheet operates in edit mode — pre-fills fields and calls update(). */
  editItem?: WardrobeItem | null;
}

const STATUS_OPTIONS: { id: WardrobeStatus; label: string; helper: string }[] = [
  { id: 'have',    label: 'In Rotation', helper: 'Bottle on the shelf' },
  { id: 'want',    label: 'Wishlist',    helper: 'Want to try it' },
  { id: 'tested',  label: 'Tested',      helper: 'Sampled, undecided' },
  { id: 'sold_on', label: 'Sold On',     helper: 'Loved + ready to buy' },
];

const UNIT_OPTIONS: { id: UnitType; label: string; defaultMl: number }[] = [
  { id: 'bottle', label: 'Full Bottle', defaultMl: 50 },
  { id: 'decant', label: 'Decant',      defaultMl: 10 },
  { id: 'sample', label: 'Sample',      defaultMl: 1.5 },
];

/**
 * Add-to-wardrobe sheet — slides up from the bottom of the fragrance
 * detail page. Captures status, unit type, size + remaining mL, optional
 * reorder threshold. Writes to the persisted wardrobe store.
 *
 * Uses the system Modal with slide animation rather than a 3rd-party sheet
 * library — keeps deps lean and works fine for our needs.
 */
export function AddToWardrobeSheet({ visible, fragrance, onClose, onSaved, initialStatus, editItem }: Props) {
  const router = useRouter();
  const add = useWardrobeStore((s) => s.add);
  const update = useWardrobeStore((s) => s.update);
  const wardrobeCount = useWardrobeStore((s) => s.items.length);
  const hasSeenSyncUpsell = useProfileStore((s) => s.hasSeenSyncUpsell);
  const markSyncUpsellSeen = useProfileStore((s) => s.markSyncUpsellSeen);
  const [status, setStatus] = useState<WardrobeStatus>(initialStatus ?? 'have');
  const [unit, setUnit] = useState<UnitType>('bottle');
  const [sizeMl, setSizeMl] = useState('50');
  const [remainingMl, setRemainingMl] = useState('50');
  const [reorderMl, setReorderMl] = useState('');

  // Reset all fields each time the sheet opens, pre-populating from editItem if present.
  useEffect(() => {
    if (!visible) return;
    if (editItem) {
      setStatus(editItem.status);
      setUnit(editItem.unit_type);
      setSizeMl(String(editItem.size_ml));
      setRemainingMl(String(editItem.remaining_ml));
      setReorderMl(editItem.reorder_threshold_ml != null ? String(editItem.reorder_threshold_ml) : '');
    } else {
      setStatus(initialStatus ?? 'have');
      setUnit('bottle');
      setSizeMl('50');
      setRemainingMl('50');
      setReorderMl('');
    }
  }, [visible, editItem, initialStatus]);

  // When the user picks a different unit, suggest a sensible default size.
  const handleUnitChange = (u: UnitType) => {
    setUnit(u);
    const def = UNIT_OPTIONS.find((o) => o.id === u)?.defaultMl ?? 50;
    setSizeMl(String(def));
    setRemainingMl(String(def));
  };

  const canSave = useMemo(() => {
    if (!fragrance) return false;
    const size = Number(sizeMl);
    const rem = Number(remainingMl);
    return Number.isFinite(size) && size > 0 && Number.isFinite(rem) && rem >= 0 && rem <= size;
  }, [fragrance, sizeMl, remainingMl]);

  const handleSave = async () => {
    if (!fragrance || !canSave) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const patch = {
      status,
      unit_type: unit,
      size_ml: Number(sizeMl),
      remaining_ml: status === 'have' ? Number(remainingMl) : Number(sizeMl),
      reorder_threshold_ml: reorderMl.trim() ? Number(reorderMl) : null,
    };
    let id: string;
    if (editItem) {
      update(editItem.id, patch);
      id = editItem.id;
    } else {
      id = add({ fragrance_id: fragrance.id, ...patch });
    }
    onSaved?.(id);
    onClose();

    // After the first wardrobe add, nudge guest users to create an account so
    // their collection is backed up. Show once only.
    if (!hasSeenSyncUpsell && wardrobeCount === 0) {
      markSyncUpsellSeen();
      try {
        const { data } = await supabase.auth.getUser();
        if (data.user?.is_anonymous) {
          Alert.alert(
            'Back Up Your Wardrobe',
            'Your collection is only on this device right now. Sign in to save it to the cloud.',
            [
              { text: 'Keep as Guest', style: 'cancel' },
              { text: 'Sign In', onPress: () => router.push('/auth/login') },
            ],
          );
        }
      } catch {
        // Skip silently if Supabase isn't configured.
      }
    }
  };

  if (!fragrance) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrap}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            <Text style={styles.eyebrow}>{editItem ? 'EDIT WARDROBE' : 'ADD TO WARDROBE'}</Text>
            <Text style={styles.cursive}>{editItem ? 'update details' : 'let\'s keep track'}</Text>
            <Text style={styles.fragName}>{fragrance.name}</Text>
            <Text style={styles.fragBrand}>{fragrance.brand}</Text>

            {/* Status pills */}
            <Section label="Status">
              <View style={styles.pillGrid}>
                {STATUS_OPTIONS.map((s) => (
                  <Pressable
                    key={s.id}
                    onPress={() => {
                      Haptics.selectionAsync();
                      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                      setStatus(s.id);
                    }}
                    style={[styles.pillBig, status === s.id && styles.pillBigActive]}
                  >
                    <Text style={[styles.pillBigLabel, status === s.id && styles.pillBigLabelActive]}>
                      {s.label}
                    </Text>
                    <Text style={[styles.pillBigHelper, status === s.id && styles.pillBigHelperActive]}>
                      {s.helper}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Section>

            {/* Unit + sizes (only meaningful for "have") */}
            {(status === 'have' || status === 'tested') && (
              <>
                <Section label="Type">
                  <View style={styles.pillRow}>
                    {UNIT_OPTIONS.map((u) => (
                      <Pressable
                        key={u.id}
                        onPress={() => { Haptics.selectionAsync(); handleUnitChange(u.id); }}
                        style={[styles.pillSm, unit === u.id && styles.pillSmActive]}
                      >
                        <Text style={[styles.pillSmLabel, unit === u.id && styles.pillSmLabelActive]}>
                          {u.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </Section>

                <Section label="Size & Remaining">
                  <View style={styles.mlRow}>
                    <MlInput label="Bottle size" value={sizeMl} onChangeText={setSizeMl} />
                    <Text style={styles.mlSep}>of</Text>
                    <MlInput label="Remaining" value={remainingMl} onChangeText={setRemainingMl} />
                  </View>
                </Section>

                {status === 'have' && (
                  <Section label="Reorder Alert (optional)">
                    <View style={styles.reorderRow}>
                      <Text style={styles.reorderHint}>Notify me when I drop below</Text>
                      <MlInput
                        label=""
                        value={reorderMl}
                        onChangeText={setReorderMl}
                        placeholder="—"
                        compact
                      />
                    </View>
                  </Section>
                )}
              </>
            )}
          </ScrollView>

          {/* Sticky CTA */}
          <View style={styles.ctaWrap}>
            <Pressable onPress={onClose} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={!canSave}
              style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
            >
              <Ionicons name="rose" size={16} color={COLORS.white} style={{ marginRight: 6 }} />
              <Text style={styles.saveText}>{editItem ? 'Save Changes' : 'Add to Wardrobe'}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: SPACING.lg }}>
      <Text style={styles.sectionLabel}>{label.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function MlInput({
  label, value, onChangeText, placeholder, compact,
}: {
  label: string; value: string; onChangeText: (s: string) => void; placeholder?: string; compact?: boolean;
}) {
  return (
    <View style={{ flex: compact ? 0 : 1 }}>
      {label.length > 0 && <Text style={styles.mlLabel}>{label}</Text>}
      <View style={[styles.mlField, compact && { width: 88 }]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={COLORS.subtle}
          keyboardType="decimal-pad"
          style={styles.mlInput}
        />
        <Text style={styles.mlSuffix}>ml</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(42,31,24,0.45)' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: SPACING.lg,
    maxHeight: '92%',
  },
  handle: {
    alignSelf: 'center',
    width: 44, height: 5, borderRadius: 3,
    backgroundColor: COLORS.border,
    marginTop: 8, marginBottom: 4,
  },
  body: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.xl },
  eyebrow: { ...TYPE.eyebrow },
  cursive: { fontFamily: 'PinyonScript_400Regular', fontSize: 28, color: COLORS.accent, lineHeight: 44, marginTop: 2, paddingLeft: 8 },
  fragName: { fontFamily: FONTS.serif, fontSize: 26, fontWeight: '600', color: COLORS.text, marginTop: SPACING.sm, lineHeight: 30 },
  fragBrand: { ...TYPE.bodySmall, marginTop: 2 },

  sectionLabel: { ...TYPE.eyebrow, marginBottom: SPACING.sm },

  pillGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  pillBig: {
    width: '48%',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  pillBigActive: { borderColor: COLORS.accent, backgroundColor: COLORS.blushSoft, borderWidth: 1.5 },
  pillBigLabel: { fontFamily: FONTS.serif, fontSize: 17, fontWeight: '600', color: COLORS.text },
  pillBigLabelActive: { color: COLORS.burgundy },
  pillBigHelper: { ...TYPE.caption, marginTop: 2 },
  pillBigHelperActive: { color: COLORS.burgundy, opacity: 0.75 },

  pillRow: { flexDirection: 'row', gap: SPACING.sm },
  pillSm: {
    flex: 1,
    paddingVertical: 10, paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    alignItems: 'center',
  },
  pillSmActive: { backgroundColor: COLORS.text, borderColor: COLORS.text },
  pillSmLabel: { ...TYPE.label, fontSize: 13, color: COLORS.muted },
  pillSmLabelActive: { color: COLORS.bg },

  mlRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  mlSep: { ...TYPE.bodySmall, fontStyle: 'italic', marginTop: 18 },
  mlLabel: { ...TYPE.eyebrow, fontSize: 10, marginBottom: 4 },
  mlField: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  mlInput: { flex: 1, ...TYPE.body, fontSize: 18, padding: 0, color: COLORS.text },
  mlSuffix: { ...TYPE.bodySmall, marginLeft: 4 },

  reorderRow: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.sm },
  reorderHint: { ...TYPE.bodySmall, flex: 1, fontStyle: 'italic', paddingBottom: 14 },

  ctaWrap: {
    flexDirection: 'row', gap: SPACING.sm,
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border,
  },
  cancelBtn: {
    paddingVertical: 14, paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.full,
  },
  cancelText: { ...TYPE.label, color: COLORS.muted, letterSpacing: 1 },
  saveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.accent,
    paddingVertical: 14,
    borderRadius: RADIUS.full,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveText: { ...TYPE.label, color: COLORS.white, letterSpacing: 1.5 },
});
