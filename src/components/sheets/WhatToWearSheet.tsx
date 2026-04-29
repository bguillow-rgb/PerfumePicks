import { useState } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, ScrollView, Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, FONTS, RADIUS } from '@/src/constants/theme';
import type { RecContext } from '@/src/features/recommend/score';

interface Props {
  visible: boolean;
  onClose: () => void;
}

type Occasion = NonNullable<RecContext['occasion']>;
type Weather  = NonNullable<RecContext['weather']>;

const OCCASIONS: { id: Occasion; label: string; icon: string }[] = [
  { id: 'casual',   label: 'Casual',   icon: 'happy-outline' },
  { id: 'office',   label: 'Office',   icon: 'briefcase-outline' },
  { id: 'date',     label: 'Date',     icon: 'heart-outline' },
  { id: 'evening',  label: 'Evening',  icon: 'moon-outline' },
  { id: 'formal',   label: 'Formal',   icon: 'ribbon-outline' },
  { id: 'workout',  label: 'Workout',  icon: 'fitness-outline' },
  { id: 'travel',   label: 'Travel',   icon: 'airplane-outline' },
];

const WEATHERS: { id: Weather; label: string; icon: string }[] = [
  { id: 'hot-dry',   label: 'Hot & Dry',   icon: 'sunny-outline' },
  { id: 'hot-humid', label: 'Hot & Humid', icon: 'thermometer-outline' },
  { id: 'warm',      label: 'Warm',        icon: 'partly-sunny-outline' },
  { id: 'cool',      label: 'Cool',        icon: 'cloud-outline' },
  { id: 'cold',      label: 'Cold',        icon: 'snow-outline' },
  { id: 'rainy',     label: 'Rainy',       icon: 'rainy-outline' },
];

// Fixed 3-column chip width: screen minus sheet horizontal padding minus 2 gaps.
const SHEET_INNER_W = Dimensions.get('window').width - 2 * SPACING.lg;
const CHIP_W = (SHEET_INNER_W - 20) / 3; // 20px = 2 × 10px gap

export function WhatToWearSheet({ visible, onClose }: Props) {
  const router = useRouter();
  // Selections persist across re-opens — only reset after a successful navigation.
  const [occasion, setOccasion] = useState<Occasion | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);

  const handleFind = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const params: Record<string, string> = {};
    if (occasion) params.occasion = occasion;
    if (weather)  params.weather  = weather;
    // Reset after submit so next open is fresh.
    setOccasion(null);
    setWeather(null);
    onClose();
    router.push({ pathname: '/rec/results', params } as any);
  };

  const toggleOccasion = (id: Occasion) => {
    Haptics.selectionAsync();
    setOccasion((prev) => (prev === id ? null : id));
  };
  const toggleWeather = (id: Weather) => {
    Haptics.selectionAsync();
    setWeather((prev) => (prev === id ? null : id));
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        {/* Handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>RECOMMENDATION</Text>
            <Text style={styles.title}>
              What should I{' '}
              <Text style={styles.titleCursive}>wear?</Text>
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color={COLORS.muted} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Occasion */}
          <View style={styles.group}>
            <Text style={styles.groupLabel}>OCCASION</Text>
            <Text style={styles.groupHint}>Where are you headed? (optional)</Text>
            <View style={styles.chipGrid}>
              {OCCASIONS.map((o) => {
                const active = occasion === o.id;
                return (
                  <Pressable
                    key={o.id}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => toggleOccasion(o.id)}
                  >
                    <Ionicons
                      name={o.icon as any}
                      size={16}
                      color={active ? COLORS.white : COLORS.muted}
                    />
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {o.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Weather */}
          <View style={styles.group}>
            <Text style={styles.groupLabel}>WEATHER</Text>
            <Text style={styles.groupHint}>How does it feel outside? (optional)</Text>
            <View style={styles.chipGrid}>
              {WEATHERS.map((w) => {
                const active = weather === w.id;
                return (
                  <Pressable
                    key={w.id}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => toggleWeather(w.id)}
                  >
                    <Ionicons
                      name={w.icon as any}
                      size={16}
                      color={active ? COLORS.white : COLORS.muted}
                    />
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {w.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Context summary line — only when something is selected */}
          {(occasion || weather) && (
            <View style={styles.summaryRow}>
              <Ionicons name="sparkles-outline" size={13} color={COLORS.accent} />
              <Text style={styles.summaryText}>
                Finding picks{occasion ? ` for ${OCCASIONS.find((o) => o.id === occasion)?.label.toLowerCase()}` : ''}
                {weather ? ` in ${WEATHERS.find((w) => w.id === weather)?.label.toLowerCase()} weather` : ''}
              </Text>
            </View>
          )}
        </ScrollView>

        {/* CTA — always accent; label signals intent */}
        <View style={styles.ctaWrap}>
          <Pressable style={styles.cta} onPress={handleFind}>
            <Ionicons name="sparkles" size={16} color={COLORS.white} style={{ marginRight: 8 }} />
            <Text style={styles.ctaText}>
              {occasion || weather ? 'Find My Fragrance' : 'Surprise Me'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
  },
  handle: {
    width: 36, height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10, marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  eyebrow: { ...TYPE.eyebrow, marginBottom: 2 },
  title: {
    fontFamily: FONTS.serif,
    fontWeight: '700',
    fontSize: 26,
    color: COLORS.text,
    lineHeight: 32,
  },
  titleCursive: {
    fontFamily: 'PinyonScript_400Regular',
    fontSize: 36,
    color: COLORS.accent,
    lineHeight: 56,
    paddingLeft: 10,
  },
  closeBtn: { marginTop: 4 },
  scroll: { flexShrink: 1 },
  scrollContent: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg },
  group: { marginBottom: SPACING.xl },
  groupLabel: { ...TYPE.eyebrow, marginBottom: 2 },
  groupHint: { ...TYPE.bodySmall, color: COLORS.muted, marginBottom: SPACING.md },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    width: CHIP_W,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  chipActive: {
    backgroundColor: COLORS.text,
    borderColor: COLORS.text,
  },
  chipText: { ...TYPE.label, fontSize: 12, color: COLORS.muted, letterSpacing: 0.3 },
  chipTextActive: { color: COLORS.white },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.accent,
    marginBottom: SPACING.sm,
  },
  summaryText: { ...TYPE.bodySmall, color: COLORS.accent, fontStyle: 'italic', flex: 1 },
  ctaWrap: {
    padding: SPACING.lg,
    paddingTop: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  cta: {
    backgroundColor: COLORS.accent,
    paddingVertical: 16,
    borderRadius: RADIUS.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { ...TYPE.label, color: COLORS.white, letterSpacing: 2 },
});
