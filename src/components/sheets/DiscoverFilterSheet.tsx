import { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, FONTS, RADIUS } from '@/src/constants/theme';

export interface DiscoverFilters {
  genders: string[];
  accords: string[];
  priceTiers: number[];
  yearMin: number | null;
  yearMax: number | null;
}

export const EMPTY_FILTERS: DiscoverFilters = {
  genders: [],
  accords: [],
  priceTiers: [],
  yearMin: null,
  yearMax: null,
};

export function filtersActive(f: DiscoverFilters): boolean {
  return f.genders.length > 0 || f.accords.length > 0 || f.priceTiers.length > 0
    || f.yearMin != null || f.yearMax != null;
}

interface Props {
  visible: boolean;
  filters: DiscoverFilters;
  onApply: (f: DiscoverFilters) => void;
  onClose: () => void;
}

const GENDERS = ['feminine', 'masculine', 'unisex'] as const;
const ACCORDS = ['amber', 'rose', 'oud', 'vanilla', 'iris', 'leather', 'fruity', 'gourmand', 'woody', 'citrus', 'fresh', 'floral', 'spicy', 'aquatic', 'green', 'powdery', 'sweet', 'musk'] as const;
const PRICE_TIERS = [1, 2, 3, 4, 5] as const;
const DECADES = [2020, 2010, 2000, 1990, 1980] as const;

export function DiscoverFilterSheet({ visible, filters, onApply, onClose }: Props) {
  const [draft, setDraft] = useState<DiscoverFilters>(filters);

  // Reset draft when sheet opens
  useState(() => { setDraft(filters); });

  const toggleGender = (g: string) => {
    Haptics.selectionAsync();
    setDraft((d) => ({
      ...d,
      genders: d.genders.includes(g) ? d.genders.filter((x) => x !== g) : [...d.genders, g],
    }));
  };

  const toggleAccord = (a: string) => {
    Haptics.selectionAsync();
    setDraft((d) => ({
      ...d,
      accords: d.accords.includes(a) ? d.accords.filter((x) => x !== a) : [...d.accords, a],
    }));
  };

  const togglePrice = (p: number) => {
    Haptics.selectionAsync();
    setDraft((d) => ({
      ...d,
      priceTiers: d.priceTiers.includes(p) ? d.priceTiers.filter((x) => x !== p) : [...d.priceTiers, p],
    }));
  };

  const setDecade = (year: number) => {
    Haptics.selectionAsync();
    if (draft.yearMin === year) {
      setDraft((d) => ({ ...d, yearMin: null, yearMax: null }));
    } else {
      setDraft((d) => ({ ...d, yearMin: year, yearMax: year + 9 }));
    }
  };

  const clearAll = () => {
    Haptics.selectionAsync();
    setDraft(EMPTY_FILTERS);
  };

  const activeCount = (draft.genders.length + draft.accords.length + draft.priceTiers.length
    + (draft.yearMin != null ? 1 : 0));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrap}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>Filter</Text>
            {activeCount > 0 && (
              <Pressable onPress={clearAll}>
                <Text style={styles.clearBtn}>Clear All</Text>
              </Pressable>
            )}
          </View>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {/* Gender */}
            <FilterSection label="GENDER">
              <View style={styles.pillRow}>
                {GENDERS.map((g) => (
                  <Chip
                    key={g}
                    label={g === 'feminine' ? 'For Her' : g === 'masculine' ? 'For Him' : 'Unisex'}
                    active={draft.genders.includes(g)}
                    onPress={() => toggleGender(g)}
                  />
                ))}
              </View>
            </FilterSection>

            {/* Accords */}
            <FilterSection label="ACCORDS">
              <View style={styles.pillRow}>
                {ACCORDS.map((a) => (
                  <Chip key={a} label={a} active={draft.accords.includes(a)} onPress={() => toggleAccord(a)} />
                ))}
              </View>
            </FilterSection>

            {/* Price Tier */}
            <FilterSection label="PRICE TIER">
              <View style={styles.pillRow}>
                {PRICE_TIERS.map((p) => (
                  <Chip key={p} label={'$'.repeat(p)} active={draft.priceTiers.includes(p)} onPress={() => togglePrice(p)} />
                ))}
              </View>
            </FilterSection>

            {/* Decade */}
            <FilterSection label="RELEASE DECADE">
              <View style={styles.pillRow}>
                {DECADES.map((d) => (
                  <Chip key={d} label={`${d}s`} active={draft.yearMin === d} onPress={() => setDecade(d)} />
                ))}
              </View>
            </FilterSection>
          </ScrollView>

          {/* Apply CTA */}
          <View style={styles.ctaWrap}>
            <Pressable onPress={onClose} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => { onApply(draft); onClose(); }}
              style={styles.applyBtn}
            >
              <Ionicons name="funnel" size={14} color={COLORS.white} style={{ marginRight: 6 }} />
              <Text style={styles.applyText}>
                Apply{activeCount > 0 ? ` (${activeCount})` : ''}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function FilterSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: SPACING.lg }}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(42,31,24,0.45)' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingBottom: SPACING.lg,
    maxHeight: '85%',
  },
  handle: {
    alignSelf: 'center',
    width: 44, height: 5, borderRadius: 3,
    backgroundColor: COLORS.border,
    marginTop: 8, marginBottom: 4,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
  },
  headerTitle: { ...TYPE.heading },
  clearBtn: { ...TYPE.label, fontSize: 13, color: COLORS.accent },

  body: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: SPACING.xl },
  sectionLabel: { ...TYPE.eyebrow, marginBottom: SPACING.sm },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: RADIUS.full,
    borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  chipActive: { backgroundColor: COLORS.text, borderColor: COLORS.text },
  chipText: { ...TYPE.label, fontSize: 13, color: COLORS.muted },
  chipTextActive: { color: COLORS.bg },

  ctaWrap: {
    flexDirection: 'row', gap: SPACING.sm,
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border,
  },
  cancelBtn: { paddingVertical: 14, paddingHorizontal: SPACING.lg, borderRadius: RADIUS.full },
  cancelText: { ...TYPE.label, color: COLORS.muted, letterSpacing: 1 },
  applyBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.accent, paddingVertical: 14, borderRadius: RADIUS.full,
  },
  applyText: { ...TYPE.label, color: COLORS.white, letterSpacing: 1.5 },
});
