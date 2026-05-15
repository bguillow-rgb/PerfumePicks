import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING, TYPE, RADIUS } from '@/src/constants/theme';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

interface Compliment {
  id: string;
  what_was_said: string | null;
  context: string | null;
  occurred_on: string | null;
  created_at: string;
}

interface Props {
  fragranceId: string;
}

/**
 * Compliments section on fragrance detail — log when someone comments
 * on what you're wearing. Shows count + list.
 */
export function ComplimentsSection({ fragranceId }: Props) {
  const [entries, setEntries] = useState<Compliment[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [whatSaid, setWhatSaid] = useState('');
  const [context, setContext] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('compliments_log')
      .select('*')
      .eq('user_id', user.id)
      .eq('fragrance_id', fragranceId)
      .order('created_at', { ascending: false })
      .limit(10);
    if (data) setEntries(data);
  }, [fragranceId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const { error } = await supabase.from('compliments_log').insert({
      user_id: user.id,
      fragrance_id: fragranceId,
      what_was_said: whatSaid.trim() || null,
      context: context.trim() || null,
      occurred_on: new Date().toLocaleDateString('en-CA'),
    });

    setSaving(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setWhatSaid('');
    setContext('');
    setShowForm(false);
    load();
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.count}>
          {entries.length} compliment{entries.length !== 1 ? 's' : ''}
        </Text>
        <Pressable onPress={() => setShowForm(!showForm)} style={styles.addBtn}>
          <Ionicons name="add-circle-outline" size={14} color={COLORS.accent} />
          <Text style={styles.addBtnText}>Log Compliment</Text>
        </Pressable>
      </View>

      {showForm && (
        <View style={styles.form}>
          <TextInput
            value={whatSaid}
            onChangeText={setWhatSaid}
            placeholder="What did they say?"
            placeholderTextColor={COLORS.subtle}
            style={styles.input}
          />
          <TextInput
            value={context}
            onChangeText={setContext}
            placeholder="Context (office, date, etc.)"
            placeholderTextColor={COLORS.subtle}
            style={styles.input}
          />
          <Pressable
            style={[styles.saveBtn, saving && { opacity: 0.4 }]}
            onPress={handleAdd}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>Save</Text>
          </Pressable>
        </View>
      )}

      {entries.length === 0 && !showForm && (
        <Text style={styles.emptyText}>No compliments logged yet. Someone will notice!</Text>
      )}

      {entries.map((e) => (
        <View key={e.id} style={styles.entryRow}>
          <Ionicons name="chatbubble-ellipses-outline" size={14} color={COLORS.accent} />
          <View style={{ flex: 1 }}>
            {e.what_was_said && <Text style={styles.entryQuote}>"{e.what_was_said}"</Text>}
            <Text style={styles.entryMeta}>
              {e.context ?? ''}{e.context && e.occurred_on ? ' · ' : ''}{e.occurred_on ?? ''}
            </Text>
          </View>
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
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm,
    backgroundColor: COLORS.card, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.sm,
  },
  entryQuote: { ...TYPE.bodySmall, color: COLORS.text, fontStyle: 'italic' },
  entryMeta: { ...TYPE.caption, fontSize: 10, marginTop: 2 },
});
