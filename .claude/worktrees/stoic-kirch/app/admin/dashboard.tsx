// Admin Dashboard — read-only catalog + user health snapshot. All
// queries are count-only (head:true) so no large payloads transit,
// and every one is cheap enough to run on demand at pull-to-refresh.
//
// Four stats today:
//   - Total cigars (catalog size)
//   - Total users (profiles count — not auth.users, which would
//     require service-role access)
//   - Pending submissions (queue backlog)
//   - Scans in the last 24 hours (activity pulse)
//
// More stats can join the STATS array below; layout expands naturally.

import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { Card } from '@/src/components/ui/Card';
import { AdminOnly } from '@/src/features/admin/AdminOnly';
import { captureException } from '@/src/lib/observability';
import { COLORS, SPACING } from '@/src/constants/theme';

export default function DashboardScreen() {
  return (
    <AdminOnly>
      <Dashboard />
    </AdminOnly>
  );
}

interface Stats {
  cigars: number | null;
  users: number | null;
  pendingSubmissions: number | null;
  scans24h: number | null;
}

const initialStats: Stats = {
  cigars: null,
  users: null,
  pendingSubmissions: null,
  scans24h: null,
};

function Dashboard() {
  const [stats, setStats] = useState<Stats>(initialStats);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [cigars, users, pending, scans] = await Promise.all([
        supabase.from('cigars').select('id', { count: 'exact', head: true }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase
          .from('cigar_submissions')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
        supabase
          .from('scan_images')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', yesterday),
      ]);
      setStats({
        cigars: cigars.count ?? 0,
        users: users.count ?? 0,
        pendingSubmissions: pending.count ?? 0,
        scans24h: scans.count ?? 0,
      });
    } catch (e) {
      captureException(e, { context: 'admin.dashboard.load' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
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
    >
      <StatCard label="Cigars in catalog" value={stats.cigars} />
      <StatCard label="Registered users" value={stats.users} />
      <StatCard
        label="Pending submissions"
        value={stats.pendingSubmissions}
        highlight={(stats.pendingSubmissions ?? 0) > 0}
      />
      <StatCard label="Scans (last 24h)" value={stats.scans24h} />

      <Text style={styles.hint}>Pull down to refresh.</Text>
    </ScrollView>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number | null;
  highlight?: boolean;
}) {
  return (
    <Card style={highlight ? { ...styles.card, ...styles.cardHighlight } : styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, highlight && styles.valueHighlight]}>
        {value === null ? '—' : value.toLocaleString()}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  content: {
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bg,
  },
  card: {
    padding: SPACING.md,
    gap: 4,
  },
  cardHighlight: {
    borderColor: COLORS.accent,
    borderWidth: 1,
  },
  label: {
    fontFamily: 'Cormorant',
    fontSize: 12,
    color: COLORS.subtle,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  value: {
    fontFamily: 'Cormorant',
    fontSize: 34,
    fontWeight: '800',
    color: COLORS.text,
  },
  valueHighlight: {
    color: COLORS.accent,
  },
  hint: {
    fontFamily: 'Cormorant',
    fontSize: 12,
    color: COLORS.subtle,
    textAlign: 'center',
    marginTop: SPACING.md,
  },
});
