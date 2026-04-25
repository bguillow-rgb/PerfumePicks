// Admin Review Submissions — pending user-suggested cigars. Each row
// offers Approve (routes to /admin/add-cigar pre-filled with the
// submission data + scan image; on save, the Add Cigar form also
// flips the submission status to merged) or Reject (one-tap status
// update, no cigar row created).
//
// Relies on migration 016's admin RLS policies for:
//   - SELECT all pending submissions (vs non-admin's own-row scope)
//   - UPDATE any submission's status
// Non-admins hitting this screen bounce via AdminOnly.

import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Image,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Alert } from '@/src/components/ui/StyledAlert';
import { Card } from '@/src/components/ui/Card';
import { AdminOnly } from '@/src/features/admin/AdminOnly';
import { captureException } from '@/src/lib/observability';
import { COLORS, RADIUS, SPACING } from '@/src/constants/theme';

interface Submission {
  id: string;
  brand: string;
  line: string;
  vitola: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  scan_image_id: string | null;
  scan_images: { image_url: string | null } | null;
}

export default function SubmissionsScreen() {
  return (
    <AdminOnly>
      <List />
    </AdminOnly>
  );
}

function List() {
  const router = useRouter();
  const [items, setItems] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('cigar_submissions')
        .select(
          'id,brand,line,vitola,notes,status,created_at,scan_image_id,scan_images(image_url)',
        )
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      // Supabase types the embedded relation as an array; flatten to
      // the first row for our single-relationship fetch.
      const rows: Submission[] = (data ?? []).map((r: any) => ({
        ...r,
        scan_images: Array.isArray(r.scan_images) ? r.scan_images[0] ?? null : r.scan_images,
      }));
      setItems(rows);
    } catch (e) {
      captureException(e, { context: 'admin.submissions.load' });
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Refresh when returning from the Add Cigar flow — an approval that
  // merges a submission should make that row disappear from the queue.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const onApprove = (item: Submission) => {
    router.push({
      pathname: '/admin/add-cigar',
      params: {
        submissionId: item.id,
        prefillBrand: item.brand,
        prefillLine: item.line,
        prefillVitola: item.vitola ?? '',
        prefillNotes: item.notes ?? '',
        scanImageUrl: item.scan_images?.image_url ?? '',
      },
    });
  };

  const onReject = (item: Submission) => {
    Alert.alert(
      'Reject submission?',
      `${item.brand} / ${item.line}${item.vitola ? ` / ${item.vitola}` : ''}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('cigar_submissions')
                .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
                .eq('id', item.id);
              if (error) throw error;
              // Optimistic: remove from local list.
              setItems((xs) => xs.filter((x) => x.id !== item.id));
            } catch (e) {
              captureException(e, { context: 'admin.submissions.reject' });
              Alert.alert('Failed', 'Could not reject. Try again.');
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

  if (items.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>No pending submissions.</Text>
        <Text style={styles.emptySub}>
          When a user suggests a cigar that isn't in the catalog, it'll show up here.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(i) => i.id}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={COLORS.accent}
        />
      }
      renderItem={({ item }) => (
        <Card style={styles.row}>
          <View style={styles.rowTop}>
            {item.scan_images?.image_url ? (
              <Image
                source={{ uri: item.scan_images.image_url }}
                style={styles.thumb}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.thumb, styles.thumbPlaceholder]}>
                <Text style={styles.thumbPlaceholderText}>?</Text>
              </View>
            )}
            <View style={styles.rowText}>
              <Text style={styles.title}>
                {item.brand} / {item.line}
              </Text>
              {item.vitola ? <Text style={styles.sub}>{item.vitola}</Text> : null}
              {item.notes ? (
                <Text style={styles.notes} numberOfLines={3}>
                  {item.notes}
                </Text>
              ) : null}
              <Text style={styles.date}>
                {new Date(item.created_at).toLocaleDateString()}
              </Text>
            </View>
          </View>
          <View style={styles.actions}>
            <Pressable style={styles.approveBtn} onPress={() => onApprove(item)}>
              <Text style={styles.approveText}>Approve</Text>
            </Pressable>
            <Pressable style={styles.rejectBtn} onPress={() => onReject(item)}>
              <Text style={styles.rejectText}>Reject</Text>
            </Pressable>
          </View>
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
    backgroundColor: COLORS.bg,
  },
  empty: {
    fontFamily: 'Cormorant',
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  emptySub: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    color: COLORS.muted,
    textAlign: 'center',
    marginTop: SPACING.sm,
    maxWidth: 280,
  },
  list: {
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  row: {
    padding: SPACING.md,
  },
  rowTop: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.card2 ?? COLORS.card,
  },
  thumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  thumbPlaceholderText: {
    fontFamily: 'Cormorant',
    fontSize: 24,
    color: COLORS.muted,
    fontWeight: '700',
  },
  rowText: {
    flex: 1,
  },
  title: {
    fontFamily: 'Cormorant',
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  sub: {
    fontFamily: 'Cormorant',
    fontSize: 13,
    color: COLORS.muted,
    marginTop: 2,
  },
  notes: {
    fontFamily: 'Cormorant',
    fontSize: 12,
    color: COLORS.subtle,
    marginTop: 6,
    fontStyle: 'italic',
  },
  date: {
    fontFamily: 'Cormorant',
    fontSize: 11,
    color: COLORS.subtle,
    marginTop: 6,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  approveBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
  },
  approveText: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.bg,
  },
  rejectBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  rejectText: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.muted,
  },
});
