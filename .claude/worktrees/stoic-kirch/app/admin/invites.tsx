// Admin Invites — list / add / remove admin emails. Backed by the
// comped_users table's `is_admin` flag from migration 016.
//
// "Remove" flips is_admin=false but keeps the comp row intact, so a
// removed admin still has their free-scan comp. Delete-the-row would
// lose that, and adding it back later would require a fresh insert —
// the flag flip is reversible in one click.
//
// Adding an email that doesn't exist in comped_users inserts a new
// row with is_admin=true + note='admin invite'. Adding an email that
// already exists flips is_admin=true (keeping whatever note was set).

import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { Alert } from '@/src/components/ui/StyledAlert';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { AdminOnly } from '@/src/features/admin/AdminOnly';
import { captureException } from '@/src/lib/observability';
import { COLORS, RADIUS, SPACING } from '@/src/constants/theme';

interface AdminRow {
  email: string;
  note: string | null;
  created_at: string;
  is_admin: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function InvitesScreen() {
  return (
    <AdminOnly>
      <InvitesList />
    </AdminOnly>
  );
}

function InvitesList() {
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [adminsRes, userRes] = await Promise.all([
        supabase
          .from('comped_users')
          .select('email,note,created_at,is_admin')
          .eq('is_admin', true)
          .order('created_at', { ascending: true }),
        supabase.auth.getUser(),
      ]);
      if (adminsRes.error) throw adminsRes.error;
      setAdmins((adminsRes.data as AdminRow[]) ?? []);
      setCurrentUserEmail(userRes.data?.user?.email?.toLowerCase() ?? null);
    } catch (e) {
      captureException(e, { context: 'admin.invites.load' });
      setAdmins([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onAdd = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    if (!EMAIL_RE.test(email)) {
      Alert.alert('Invalid', 'That doesn\u2019t look like an email address.');
      return;
    }

    setSubmitting(true);
    try {
      // Upsert semantics: if the email is already a comped user we
      // just flip is_admin=true; otherwise we insert a new row.
      const { data: existing } = await supabase
        .from('comped_users')
        .select('email,is_admin')
        .eq('email', email)
        .maybeSingle();

      if (existing) {
        if (existing.is_admin) {
          Alert.alert('Already an admin', `${email} already has admin access.`);
          setNewEmail('');
          setSubmitting(false);
          return;
        }
        const { error } = await supabase
          .from('comped_users')
          .update({ is_admin: true })
          .eq('email', email);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('comped_users').insert({
          email,
          note: 'admin invite',
          is_admin: true,
        });
        if (error) throw error;
      }

      Alert.alert(
        'Invited',
        `${email} is now an admin. Their admin access appears on their next sign-in.`,
      );
      setNewEmail('');
      await load();
    } catch (e: any) {
      captureException(e, { context: 'admin.invites.add' });
      Alert.alert('Failed', e?.message ?? 'Could not add admin. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const onRemove = (row: AdminRow) => {
    const isSelf = row.email.toLowerCase() === currentUserEmail;
    Alert.alert(
      isSelf ? 'Remove yourself?' : 'Remove admin?',
      isSelf
        ? `You\u2019re about to remove YOUR OWN admin access (${row.email}). You won\u2019t be able to undo this from within the app. Continue?`
        : `Remove admin access from ${row.email}? Their comp row stays in place — they just lose admin powers.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('comped_users')
                .update({ is_admin: false })
                .eq('email', row.email);
              if (error) throw error;
              setAdmins((xs) => xs.filter((x) => x.email !== row.email));
            } catch (e: any) {
              captureException(e, { context: 'admin.invites.remove' });
              Alert.alert('Failed', e?.message ?? 'Could not remove admin.');
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* Add form */}
      <Card style={styles.addCard}>
        <Text style={styles.label}>Invite a new admin</Text>
        <TextInput
          value={newEmail}
          onChangeText={setNewEmail}
          placeholder="name@example.com"
          placeholderTextColor={COLORS.subtle}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          style={styles.input}
        />
        <Button
          title={submitting ? 'Adding…' : 'Invite'}
          onPress={onAdd}
          disabled={submitting || !newEmail.trim()}
          loading={submitting}
        />
      </Card>

      {/* Existing admins list */}
      <Text style={styles.sectionLabel}>
        CURRENT ADMINS ({admins.length})
      </Text>
      <FlatList
        data={admins}
        keyExtractor={(a) => a.email}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={COLORS.accent}
          />
        }
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>No admins yet (that shouldn\u2019t be possible).</Text>
        }
        renderItem={({ item }) => {
          const isSelf = item.email.toLowerCase() === currentUserEmail;
          return (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.email}>{item.email}</Text>
                <Text style={styles.meta}>
                  {item.note ?? 'admin'} ·{' '}
                  {new Date(item.created_at).toLocaleDateString()}
                  {isSelf && ' · you'}
                </Text>
              </View>
              <Pressable onPress={() => onRemove(item)} style={styles.removeBtn}>
                <Text style={styles.removeText}>Remove</Text>
              </Pressable>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
    padding: SPACING.md,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bg,
  },
  addCard: {
    padding: SPACING.md,
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  label: {
    fontFamily: 'Cormorant',
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.muted,
  },
  input: {
    fontFamily: 'Cormorant',
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.text,
  },
  sectionLabel: {
    fontFamily: 'Cormorant',
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.subtle,
    letterSpacing: 2,
    marginBottom: SPACING.sm,
  },
  list: {
    gap: SPACING.sm,
    paddingBottom: SPACING.xxl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  email: {
    fontFamily: 'Cormorant',
    fontSize: 15,
    color: COLORS.text,
    fontWeight: '600',
  },
  meta: {
    fontFamily: 'Cormorant',
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 2,
  },
  removeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  removeText: {
    fontFamily: 'Cormorant',
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.muted,
  },
  empty: {
    fontFamily: 'Cormorant',
    color: COLORS.muted,
    textAlign: 'center',
    padding: SPACING.lg,
  },
});
