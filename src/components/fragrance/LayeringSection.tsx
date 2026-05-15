import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING, TYPE, RADIUS, FONTS } from '@/src/constants/theme';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { EmptyState } from '@/src/components/ui/EmptyState';

interface LayeringEntry {
  id: string;
  fragrance_a_id: string;
  fragrance_b_id: string;
  notes: string | null;
  created_at: string;
}

interface Props {
  fragranceId: string;
}

/**
 * Layering section on fragrance detail — shows pairs worn together.
 * Add entry via a simple inline form (partner fragrance name + notes).
 */
export function LayeringSection({ fragranceId }: Props) {
  const [entries, setEntries] = useState<LayeringEntry[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [partnerName, setPartnerName] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const { data } = await supabase
      .from('layering_entries')
      .select('*')
      .or(`fragrance_a_id.eq.${fragranceId},fragrance_b_id.eq.${fragranceId}`)
      .order('created_at', { ascending: false })
      .limit(10);
    if (data) setEntries(data);
  }, [fragranceId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!partnerName.trim()) return;
    setSaving(true);
    // Search for the partner fragrance
    const { data: matches } = await supabase
      .from('fragrances')
      .select('id')
      .ilike('name', `%${partnerName.trim()}%`)
      .limit(1);

    if (!matches?.length) {
      Alert.alert('Not Found', `Couldn't find "${partnerName}" in the catalog.`);
      setSaving(false);
      return;
    }

    const partnerId = matches[0].id;
    // Ensure a < b for the check constraint
    const [a, b] = fragranceId < partnerId ? [fragranceId, partnerId] : [partnerId, fragranceId];

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const { error } = await supabase.from('layering_entries').insert({
      user_id: user.id,
      fragrance_a_id: a,
      fragrance_b_id: b,
      notes: notes.trim() || null,
    });

    setSaving(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPartnerName('');
    setNotes('');
    setShowForm(false);
    load();
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.count}>{entries.length} combo{entries.length !== 1 ? 's' : ''}</Text>
        <Pressable onPress={() => setShowForm(!showForm)} style={styles.addBtn}>
          <Ionicons name="add-circle-outline" size={14} color={COLORS.accent} />
          <Text style={styles.addBtnText}>Add Combo</Text>
        </Pressable>
      </View>

      {showForm && (
        <View style={styles.form}>
          <TextInput
            value={partnerName}
            onChangeText={setPartnerName}
            placeholder="Paired with... (fragrance name)"
            placeholderTextColor={COLORS.subtle}
            style={styles.input}
          />
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Notes on this combo (optional)"
            placeholderTextColor={COLORS.subtle}
            style={styles.input}
            multiline
          />
          <Pressable
            style={[styles.saveBtn, (!partnerName.trim() || saving) && { opacity: 0.4 }]}
            onPress={handleAdd}
            disabled={!partnerName.trim() || saving}
          >
            <Text style={styles.saveBtnText}>Save</Text>
          </Pressable>
        </View>
      )}

      {entries.length === 0 && !showForm && (
        <Text style={styles.emptyText}>No layering combos yet. Tap "Add Combo" to record one.</Text>
      )}

      {entries.map((e) => (
        <View key={e.id} style={styles.entryRow}>
          <Ionicons name="layers-outline" size={14} color={COLORS.accent} />
          <Text style={styles.entryText} numberOfLines={2}>
            {e.notes ?? 'Layering combo'}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: SPACING.sm },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { ...TYPE.bodySmall, color: COLORS.muted },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addBtnText: { ...TYPE.label, fontSize: 12, color: COLORS.accent },
  form: {
    backgroundColor: COLORS.card, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.md, gap: SPACING.sm,
  },
  input: {
    ...TYPE.body, fontSize: 14, backgroundColor: COLORS.bg, borderRadius: RADIUS.md,
    padding: SPACING.sm,
  },
  saveBtn: { backgroundColor: COLORS.accent, borderRadius: RADIUS.full, paddingVertical: 10, alignItems: 'center' },
  saveBtnText: { ...TYPE.label, color: COLORS.white, letterSpacing: 1 },
  emptyText: { ...TYPE.bodySmall, color: COLORS.muted, fontStyle: 'italic' },
  entryRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.card, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.sm,
  },
  entryText: { ...TYPE.bodySmall, color: COLORS.text, flex: 1 },
});
