import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, TextInput, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, FONTS, RADIUS } from '@/src/constants/theme';
import {
  useWearLogStore, type Occasion, type Weather, type WearLog,
} from '@/src/stores/useWearLogStore';
import type { Fragrance } from '@/src/stores/useCatalogStore';
import { useProStore } from '@/src/stores/useProStore';
import { useRouter } from 'expo-router';

interface Props {
  visible: boolean;
  fragrance: Fragrance | null;
  /** When provided, the sheet opens in edit mode pre-populated with this entry. */
  editLog?: WearLog | null;
  onClose: () => void;
  onSaved?: (id: string) => void;
}

const OCCASIONS: { id: Occasion; label: string }[] = [
  { id: 'office',  label: 'Office' },
  { id: 'date',    label: 'Date' },
  { id: 'casual',  label: 'Casual' },
  { id: 'evening', label: 'Evening' },
  { id: 'formal',  label: 'Formal' },
  { id: 'workout', label: 'Workout' },
  { id: 'travel',  label: 'Travel' },
];

const WEATHERS: { id: Weather; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'hot-humid', label: 'Hot · Humid', icon: 'water-outline' },
  { id: 'hot-dry',   label: 'Hot · Dry',   icon: 'sunny-outline' },
  { id: 'warm',      label: 'Warm',        icon: 'partly-sunny-outline' },
  { id: 'cool',      label: 'Cool',        icon: 'cloudy-outline' },
  { id: 'cold',      label: 'Cold',        icon: 'snow-outline' },
  { id: 'rainy',     label: 'Rainy',       icon: 'rainy-outline' },
];

/**
 * LogWearSheet — slides up from the fragrance detail page. Captures a wear
 * event for the recommendation engine + the wardrobe analytics. Date
 * defaults to today; everything else is optional.
 */
export function LogWearSheet({ visible, fragrance, editLog, onClose, onSaved }: Props) {
  const add = useWearLogStore((s) => s.add);
  const update = useWearLogStore((s) => s.update);
  const isEditing = !!editLog;

  const [occasion, setOccasion] = useState<Occasion | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [rating, setRating] = useState<number>(0);
  const [wearAgain, setWearAgain] = useState<boolean | null>(null);
  const [note, setNote] = useState('');
  const [wornOn, setWornOn] = useState(new Date().toLocaleDateString('en-CA'));
  const [isPublic, setIsPublic] = useState(false);
  const [mood, setMood] = useState<string | null>(null);

  // Reset or pre-populate when sheet opens.
  useEffect(() => {
    if (!visible) return;
    if (editLog) {
      setOccasion(editLog.occasion ?? null);
      setWeather(editLog.weather ?? null);
      setRating(editLog.rating ?? 0);
      setWearAgain(editLog.would_wear_again ?? null);
      setNote(editLog.note ?? '');
      setWornOn(editLog.worn_on);
      setIsPublic(editLog.is_public ?? false);
      setMood((editLog as any).mood ?? null);
    } else {
      setOccasion(null);
      setWeather(null);
      setRating(0);
      setWearAgain(null);
      setNote('');
      setWornOn(new Date().toLocaleDateString('en-CA'));
      setIsPublic(false);
      setMood(null);
    }
  }, [visible, editLog]);

  // Validate the date field — only accept YYYY-MM-DD strings.
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(wornOn);

  const handleSave = () => {
    if (!fragrance) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const patch = {
      worn_on: wornOn,
      occasion,
      weather,
      rating: rating > 0 ? rating : null,
      would_wear_again: wearAgain,
      note: note.trim().length > 0 ? note.trim() : null,
      is_public: isPublic,
      mood,
    } as any;
    if (isEditing && editLog) {
      update(editLog.id, patch);
      onSaved?.(editLog.id);
    } else {
      const id = add({ fragrance_id: fragrance.id, ...patch });
      onSaved?.(id);
    }
    onClose();
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
            <Text style={styles.eyebrow}>{isEditing ? 'EDIT WEAR' : 'LOG A WEAR'}</Text>
            <Text style={styles.cursive}>{isEditing ? 'update entry' : "today's scent"}</Text>
            <Text style={styles.fragName}>{fragrance.name}</Text>
            <Text style={styles.fragBrand}>{fragrance.brand}</Text>

            {/* Date */}
            <Section label="Date worn">
              <View style={styles.dateRow}>
                <TextInput
                  value={wornOn}
                  onChangeText={setWornOn}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={COLORS.subtle}
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                  style={[styles.dateInput, !dateValid && styles.dateInputError]}
                />
                <Pressable onPress={() => setWornOn(new Date().toLocaleDateString('en-CA'))} style={styles.dateTodayBtn}>
                  <Text style={styles.dateTodayText}>Today</Text>
                </Pressable>
              </View>
              {!dateValid && (
                <Text style={styles.dateError}>Use YYYY-MM-DD format (e.g. 2025-04-27)</Text>
              )}
            </Section>

            {/* Rating */}
            <Section label="How did it wear? (optional)">
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Pressable
                    key={n}
                    onPress={() => { Haptics.selectionAsync(); setRating(n === rating ? 0 : n); }}
                    hitSlop={6}
                  >
                    <Ionicons
                      name={n <= rating ? 'star' : 'star-outline'}
                      size={36}
                      color={n <= rating ? COLORS.accent : COLORS.muted}
                    />
                  </Pressable>
                ))}
              </View>
              {rating === 0 && (
                <Text style={{ ...TYPE.caption, textAlign: 'center', marginTop: 6, fontStyle: 'italic' }}>
                  Tap a star to rate
                </Text>
              )}
            </Section>

            {/* Occasion */}
            <Section label="Occasion">
              <View style={styles.pillRow}>
                {OCCASIONS.map((o) => (
                  <Pressable
                    key={o.id}
                    onPress={() => { Haptics.selectionAsync(); setOccasion(occasion === o.id ? null : o.id); }}
                    style={[styles.pill, occasion === o.id && styles.pillActive]}
                  >
                    <Text style={[styles.pillText, occasion === o.id && styles.pillTextActive]}>
                      {o.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Section>

            {/* Weather */}
            <Section label="Weather">
              <View style={styles.weatherGrid}>
                {WEATHERS.map((w) => (
                  <Pressable
                    key={w.id}
                    onPress={() => { Haptics.selectionAsync(); setWeather(weather === w.id ? null : w.id); }}
                    style={[styles.weatherTile, weather === w.id && styles.weatherTileActive]}
                  >
                    <Ionicons
                      name={w.icon}
                      size={20}
                      color={weather === w.id ? COLORS.accent : COLORS.muted}
                    />
                    <Text style={[styles.weatherLabel, weather === w.id && styles.weatherLabelActive]}>
                      {w.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Section>

            {/* Would wear again — single binary toggle */}
            <Section label="Would you wear it again?">
              <View style={styles.binaryRow}>
                <Pressable
                  onPress={() => { Haptics.selectionAsync(); setWearAgain(wearAgain === true ? null : true); }}
                  style={[styles.binaryBtn, wearAgain === true && styles.binaryBtnYes]}
                >
                  <Ionicons name="heart" size={16} color={wearAgain === true ? COLORS.white : COLORS.muted} />
                  <Text style={[styles.binaryText, wearAgain === true && { color: COLORS.white }]}>Yes</Text>
                </Pressable>
                <Pressable
                  onPress={() => { Haptics.selectionAsync(); setWearAgain(wearAgain === false ? null : false); }}
                  style={[styles.binaryBtn, wearAgain === false && styles.binaryBtnNo]}
                >
                  <Ionicons name="close" size={18} color={wearAgain === false ? COLORS.white : COLORS.muted} />
                  <Text style={[styles.binaryText, wearAgain === false && { color: COLORS.white }]}>No</Text>
                </Pressable>
              </View>
            </Section>

            {/* Mood */}
            <Section label="How are you feeling? (optional)">
              <View style={styles.pillRow}>
                {(['happy', 'relaxed', 'confident', 'romantic', 'focused'] as const).map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => { Haptics.selectionAsync(); setMood(mood === m ? null : m); }}
                    style={[styles.pill, mood === m && styles.pillActive]}
                  >
                    <Text style={[styles.pillText, mood === m && styles.pillTextActive]}>
                      {m[0].toUpperCase() + m.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Section>

            {/* Share to feed — Pro only */}
            <Section label="Share to feed">
              {useProStore.getState().isPro ? (
                <Pressable
                  onPress={() => { Haptics.selectionAsync(); setIsPublic(!isPublic); }}
                  style={styles.shareRow}
                >
                  <Ionicons
                    name={isPublic ? 'globe' : 'globe-outline'}
                    size={20}
                    color={isPublic ? COLORS.accent : COLORS.muted}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.shareLabel}>Post as Scent of the Day</Text>
                    <Text style={styles.shareHint}>Visible to other users in the SOTD feed</Text>
                  </View>
                  <View style={[styles.shareToggle, isPublic && styles.shareToggleOn]}>
                    <View style={[styles.shareKnob, isPublic && styles.shareKnobOn]} />
                  </View>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => useRouter().push('/paywall')}
                  style={styles.shareRow}
                >
                  <Ionicons name="lock-closed" size={16} color={COLORS.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.shareLabel}>Post as Scent of the Day</Text>
                    <Text style={styles.shareHint}>Unlock feed posting with Pro</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={COLORS.accent} />
                </Pressable>
              )}
            </Section>

            {/* Note */}
            <Section label="Notes (optional)">
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="A few words on how it felt today..."
                placeholderTextColor={COLORS.subtle}
                multiline
                maxLength={500}
                style={styles.noteInput}
              />
            </Section>
          </ScrollView>

          {/* Sticky CTA */}
          <View style={styles.ctaWrap}>
            <Pressable onPress={onClose} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={handleSave} disabled={!dateValid} style={[styles.saveBtn, !dateValid && { opacity: 0.4 }]}>
              <Ionicons name={isEditing ? 'checkmark' : 'bookmark'} size={16} color={COLORS.white} style={{ marginRight: 6 }} />
              <Text style={styles.saveText}>{isEditing ? 'Update Wear' : 'Save Wear'}</Text>
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

  starsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, marginTop: SPACING.xs },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: RADIUS.full,
    borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  pillActive: { backgroundColor: COLORS.text, borderColor: COLORS.text },
  pillText: { ...TYPE.label, fontSize: 13, color: COLORS.muted },
  pillTextActive: { color: COLORS.bg },

  weatherGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  weatherTile: {
    width: '31.5%',
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    alignItems: 'center', gap: 4,
  },
  weatherTileActive: { borderColor: COLORS.accent, backgroundColor: COLORS.blushSoft, borderWidth: 1.5 },
  weatherLabel: { ...TYPE.caption, fontSize: 11 },
  weatherLabelActive: { color: COLORS.burgundy, fontWeight: '600' },

  binaryRow: { flexDirection: 'row', gap: SPACING.sm },
  binaryBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  binaryBtnYes: { backgroundColor: COLORS.success, borderColor: COLORS.success },
  binaryBtnNo:  { backgroundColor: COLORS.danger,  borderColor: COLORS.danger },
  binaryText: { ...TYPE.label, color: COLORS.muted },

  dateRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  dateInput: {
    flex: 1, ...TYPE.body,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  dateInputError: { borderColor: COLORS.danger },
  dateTodayBtn: {
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.accent,
  },
  dateTodayText: { ...TYPE.label, color: COLORS.accent, fontSize: 12 },
  dateError: { ...TYPE.caption, color: COLORS.danger, marginTop: 4, fontStyle: 'italic' },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  shareLabel: { ...TYPE.body, fontSize: 14 },
  shareHint: { ...TYPE.caption, fontSize: 11, marginTop: 1 },
  shareToggle: {
    width: 44, height: 26, borderRadius: 13,
    backgroundColor: COLORS.card2,
    justifyContent: 'center', paddingHorizontal: 2,
  },
  shareToggleOn: { backgroundColor: COLORS.accent },
  shareKnob: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: COLORS.white,
  },
  shareKnobOn: { alignSelf: 'flex-end' },
  noteInput: {
    ...TYPE.body,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 12,
    minHeight: 80,
    textAlignVertical: 'top',
  },

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
  saveText: { ...TYPE.label, color: COLORS.white, letterSpacing: 1.5 },
});
