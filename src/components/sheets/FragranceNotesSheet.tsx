import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, TextInput,
  ScrollView, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, FONTS, RADIUS } from '@/src/constants/theme';
import {
  useFragranceNotesStore,
  type OccasionPref,
  type WeatherPref,
  type SkinPerf,
} from '@/src/stores/useFragranceNotesStore';
import { MOCK_CATALOG, type MockFragrance } from '@/src/mock/fragrances';

interface Props {
  visible: boolean;
  fragrance: MockFragrance | null;
  onClose: () => void;
}

const OCCASION_OPTIONS: { id: OccasionPref; label: string }[] = [
  { id: 'office',  label: 'Office' },
  { id: 'date',    label: 'Date' },
  { id: 'casual',  label: 'Casual' },
  { id: 'evening', label: 'Evening' },
  { id: 'formal',  label: 'Formal' },
  { id: 'workout', label: 'Workout' },
  { id: 'travel',  label: 'Travel' },
];

const WEATHER_OPTIONS: { id: WeatherPref; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'hot-humid', label: 'Hot · Humid', icon: 'water-outline' },
  { id: 'hot-dry',   label: 'Hot · Dry',   icon: 'sunny-outline' },
  { id: 'warm',      label: 'Warm',        icon: 'partly-sunny-outline' },
  { id: 'cool',      label: 'Cool',        icon: 'cloudy-outline' },
  { id: 'cold',      label: 'Cold',        icon: 'snow-outline' },
  { id: 'rainy',     label: 'Rainy',       icon: 'rainy-outline' },
];

const SKIN_OPTIONS: { id: SkinPerf; label: string }[] = [
  { id: 'long-lasting',   label: 'Long lasting' },
  { id: 'fades-fast',     label: 'Fades fast' },
  { id: 'skin-close',     label: 'Skin-close' },
  { id: 'projects-well',  label: 'Projects well' },
  { id: 'dries-different',label: 'Dries different' },
];

type Tab = 'notes' | 'layering';

export function FragranceNotesSheet({ visible, fragrance, onClose }: Props) {
  const { save, addLayeringEntry, removeLayeringEntry, get } = useFragranceNotesStore();

  const [tab, setTab] = useState<Tab>('notes');

  // Notes tab state
  const [body, setBody] = useState('');
  const [occasionPrefs, setOccasionPrefs] = useState<OccasionPref[]>([]);
  const [weatherPrefs, setWeatherPrefs] = useState<WeatherPref[]>([]);
  const [skinPerf, setSkinPerf] = useState<SkinPerf[]>([]);
  const [socialNotes, setSocialNotes] = useState('');

  // Layering tab state
  const [layerQuery, setLayerQuery] = useState('');
  const [layerNote, setLayerNote] = useState('');
  const [selectedPair, setSelectedPair] = useState<MockFragrance | null>(null);
  const [showLayerSearch, setShowLayerSearch] = useState(false);

  // Pre-populate from store when sheet opens
  useEffect(() => {
    if (!visible || !fragrance) return;
    const existing = get(fragrance.id);
    setBody(existing?.body ?? '');
    setOccasionPrefs(existing?.occasion_prefs ?? []);
    setWeatherPrefs(existing?.weather_prefs ?? []);
    setSkinPerf(existing?.skin_performance ?? []);
    setSocialNotes(existing?.social_notes ?? '');
    setTab('notes');
    setLayerQuery('');
    setLayerNote('');
    setSelectedPair(null);
    setShowLayerSearch(false);
  }, [visible, fragrance]);

  const handleSave = () => {
    if (!fragrance) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    save(fragrance.id, {
      body,
      occasion_prefs: occasionPrefs,
      weather_prefs: weatherPrefs,
      skin_performance: skinPerf,
      social_notes: socialNotes,
    });
    onClose();
  };

  const handleAddLayering = () => {
    if (!fragrance || !selectedPair) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    addLayeringEntry(fragrance.id, {
      paired_fragrance_id: selectedPair.id,
      paired_fragrance_name: `${selectedPair.brand} ${selectedPair.name}`,
      note: layerNote.trim(),
    });
    setLayerQuery('');
    setLayerNote('');
    setSelectedPair(null);
    setShowLayerSearch(false);
  };

  const toggle = <T,>(arr: T[], val: T): T[] =>
    arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];

  const layerResults = layerQuery.trim().length > 1
    ? MOCK_CATALOG
        .filter((f) => f.id !== fragrance?.id)
        .filter((f) =>
          f.name.toLowerCase().includes(layerQuery.toLowerCase()) ||
          f.brand.toLowerCase().includes(layerQuery.toLowerCase()),
        )
        .slice(0, 6)
    : [];

  const existingNote = fragrance ? get(fragrance.id) : null;
  const layeringLogs = existingNote?.layering_logs ?? [];

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

          {/* Header */}
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>PRIVATE NOTES</Text>
              <Text style={styles.fragName} numberOfLines={1}>{fragrance.name}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={COLORS.muted} />
            </Pressable>
          </View>

          {/* Tab bar */}
          <View style={styles.tabBar}>
            <Pressable
              style={[styles.tabBtn, tab === 'notes' && styles.tabBtnActive]}
              onPress={() => setTab('notes')}
            >
              <Text style={[styles.tabText, tab === 'notes' && styles.tabTextActive]}>My Notes</Text>
            </Pressable>
            <Pressable
              style={[styles.tabBtn, tab === 'layering' && styles.tabBtnActive]}
              onPress={() => setTab('layering')}
            >
              <Text style={[styles.tabText, tab === 'layering' && styles.tabTextActive]}>
                Layering{layeringLogs.length > 0 ? ` (${layeringLogs.length})` : ''}
              </Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {tab === 'notes' ? (
              <>
                {/* Freeform body note */}
                <Section label="Personal observations">
                  <TextInput
                    value={body}
                    onChangeText={setBody}
                    placeholder="How does it wear on your skin? How did you feel? What did you notice?"
                    placeholderTextColor={COLORS.subtle}
                    multiline
                    maxLength={1000}
                    style={styles.textArea}
                  />
                </Section>

                {/* Occasion preferences */}
                <Section label="Best for">
                  <View style={styles.pillRow}>
                    {OCCASION_OPTIONS.map((o) => {
                      const active = occasionPrefs.includes(o.id);
                      return (
                        <Pressable
                          key={o.id}
                          onPress={() => { Haptics.selectionAsync(); setOccasionPrefs(toggle(occasionPrefs, o.id)); }}
                          style={[styles.pill, active && styles.pillActive]}
                        >
                          <Text style={[styles.pillText, active && styles.pillTextActive]}>{o.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </Section>

                {/* Weather preferences */}
                <Section label="Best weather">
                  <View style={styles.pillRow}>
                    {WEATHER_OPTIONS.map((w) => {
                      const active = weatherPrefs.includes(w.id);
                      return (
                        <Pressable
                          key={w.id}
                          onPress={() => { Haptics.selectionAsync(); setWeatherPrefs(toggle(weatherPrefs, w.id)); }}
                          style={[styles.pill, active && styles.pillActive]}
                        >
                          <Ionicons name={w.icon} size={12} color={active ? COLORS.bg : COLORS.muted} style={{ marginRight: 4 }} />
                          <Text style={[styles.pillText, active && styles.pillTextActive]}>{w.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </Section>

                {/* Skin performance */}
                <Section label="On my skin">
                  <View style={styles.pillRow}>
                    {SKIN_OPTIONS.map((s) => {
                      const active = skinPerf.includes(s.id);
                      return (
                        <Pressable
                          key={s.id}
                          onPress={() => { Haptics.selectionAsync(); setSkinPerf(toggle(skinPerf, s.id)); }}
                          style={[styles.pill, active && styles.pillActive]}
                        >
                          <Text style={[styles.pillText, active && styles.pillTextActive]}>{s.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </Section>

                {/* Social notes */}
                <Section label="Compliments & reactions">
                  <TextInput
                    value={socialNotes}
                    onChangeText={setSocialNotes}
                    placeholder="What did people say? When did it land well?"
                    placeholderTextColor={COLORS.subtle}
                    multiline
                    maxLength={500}
                    style={[styles.textArea, { minHeight: 60 }]}
                  />
                </Section>
              </>
            ) : (
              <>
                {/* Add new layering combo */}
                <Section label="Add a combination">
                  <View style={styles.layerSearchWrap}>
                    <View style={styles.layerSearchBar}>
                      <Ionicons name="search-outline" size={16} color={COLORS.muted} />
                      <TextInput
                        value={selectedPair ? `${selectedPair.brand} ${selectedPair.name}` : layerQuery}
                        onChangeText={(t) => {
                          if (selectedPair) { setSelectedPair(null); }
                          setLayerQuery(t);
                          setShowLayerSearch(true);
                        }}
                        onFocus={() => setShowLayerSearch(true)}
                        placeholder="Search fragrance to layer with..."
                        placeholderTextColor={COLORS.subtle}
                        style={styles.layerSearchInput}
                      />
                      {selectedPair && (
                        <Pressable onPress={() => { setSelectedPair(null); setLayerQuery(''); }} hitSlop={6}>
                          <Ionicons name="close-circle" size={16} color={COLORS.muted} />
                        </Pressable>
                      )}
                    </View>

                    {showLayerSearch && layerResults.length > 0 && !selectedPair && (
                      <View style={styles.layerDropdown}>
                        {layerResults.map((f) => (
                          <Pressable
                            key={f.id}
                            style={styles.layerDropdownItem}
                            onPress={() => {
                              setSelectedPair(f);
                              setLayerQuery('');
                              setShowLayerSearch(false);
                              Haptics.selectionAsync();
                            }}
                          >
                            <Text style={styles.layerDropdownName} numberOfLines={1}>
                              {f.name}
                            </Text>
                            <Text style={styles.layerDropdownBrand}>{f.brand}</Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </View>

                  <TextInput
                    value={layerNote}
                    onChangeText={setLayerNote}
                    placeholder="How did the combination smell? What occasion?"
                    placeholderTextColor={COLORS.subtle}
                    multiline
                    maxLength={300}
                    style={[styles.textArea, { marginTop: SPACING.sm, minHeight: 56 }]}
                  />

                  <Pressable
                    onPress={handleAddLayering}
                    disabled={!selectedPair}
                    style={[styles.addLayerBtn, !selectedPair && { opacity: 0.4 }]}
                  >
                    <Ionicons name="add" size={16} color={COLORS.white} style={{ marginRight: 4 }} />
                    <Text style={styles.addLayerBtnText}>Add Combination</Text>
                  </Pressable>
                </Section>

                {/* Existing layering logs */}
                {layeringLogs.length > 0 && (
                  <Section label={`Saved combinations (${layeringLogs.length})`}>
                    <View style={styles.layerList}>
                      {layeringLogs.map((entry) => (
                        <View key={entry.id} style={styles.layerEntry}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.layerEntryPair} numberOfLines={1}>
                              + {entry.paired_fragrance_name}
                            </Text>
                            {entry.note.length > 0 && (
                              <Text style={styles.layerEntryNote}>{entry.note}</Text>
                            )}
                          </View>
                          <Pressable
                            onPress={() =>
                              Alert.alert('Remove combination?', undefined, [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                  text: 'Remove',
                                  style: 'destructive',
                                  onPress: () => removeLayeringEntry(fragrance.id, entry.id),
                                },
                              ])
                            }
                            hitSlop={8}
                          >
                            <Ionicons name="trash-outline" size={16} color={COLORS.muted} />
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  </Section>
                )}
              </>
            )}
          </ScrollView>

          {/* Sticky CTA — only shown on notes tab */}
          {tab === 'notes' && (
            <View style={styles.ctaWrap}>
              <Pressable onPress={onClose} style={styles.cancelBtn}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleSave} style={styles.saveBtn}>
                <Ionicons name="lock-closed" size={14} color={COLORS.white} style={{ marginRight: 6 }} />
                <Text style={styles.saveText}>Save Notes</Text>
              </Pressable>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: SPACING.lg }}>
      <Text style={sectionStyles.label}>{label.toUpperCase()}</Text>
      {children}
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  label: { ...TYPE.eyebrow, marginBottom: SPACING.sm },
});

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(42,31,24,0.45)' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: SPACING.lg,
    maxHeight: '94%',
  },
  handle: {
    alignSelf: 'center',
    width: 44, height: 5, borderRadius: 3,
    backgroundColor: COLORS.border,
    marginTop: 8, marginBottom: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
    gap: SPACING.md,
  },
  eyebrow: { ...TYPE.eyebrow, marginBottom: 2 },
  fragName: {
    fontFamily: FONTS.serif,
    fontSize: 22,
    fontWeight: '600',
    color: COLORS.text,
    lineHeight: 26,
  },

  tabBar: {
    flexDirection: 'row',
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.xs,
    backgroundColor: COLORS.card2,
    borderRadius: RADIUS.md,
    padding: 3,
  },
  tabBtn: {
    flex: 1, paddingVertical: 8, borderRadius: RADIUS.sm - 1,
    alignItems: 'center',
  },
  tabBtnActive: { backgroundColor: COLORS.card },
  tabText: { ...TYPE.label, fontSize: 13, color: COLORS.muted },
  tabTextActive: { color: COLORS.text },

  body: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xl },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: RADIUS.full,
    borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  pillActive: { backgroundColor: COLORS.text, borderColor: COLORS.text },
  pillText: { ...TYPE.label, fontSize: 12, color: COLORS.muted },
  pillTextActive: { color: COLORS.bg },

  textArea: {
    ...TYPE.body,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 12,
    minHeight: 90,
    textAlignVertical: 'top',
  },

  // Layering
  layerSearchWrap: { position: 'relative' },
  layerSearchBar: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: SPACING.md, paddingVertical: 12,
  },
  layerSearchInput: { ...TYPE.body, flex: 1, padding: 0 },
  layerDropdown: {
    position: 'absolute', top: '100%', left: 0, right: 0,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    zIndex: 10,
    shadowColor: COLORS.black,
    shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  layerDropdownItem: {
    paddingHorizontal: SPACING.md, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border,
  },
  layerDropdownName: { ...TYPE.body, fontWeight: '600' },
  layerDropdownBrand: { ...TYPE.caption, marginTop: 2 },
  addLayerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginTop: SPACING.sm,
    backgroundColor: COLORS.accent,
    paddingVertical: 12,
    borderRadius: RADIUS.full,
  },
  addLayerBtnText: { ...TYPE.label, color: COLORS.white, letterSpacing: 1 },
  layerList: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
    overflow: 'hidden',
  },
  layerEntry: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: SPACING.md, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border,
    gap: SPACING.sm,
  },
  layerEntryPair: {
    fontFamily: FONTS.serif, fontSize: 15, fontWeight: '600', color: COLORS.text,
  },
  layerEntryNote: { ...TYPE.bodySmall, marginTop: 2, fontStyle: 'italic' },

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
