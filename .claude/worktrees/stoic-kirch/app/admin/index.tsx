// Admin home — five tiles linking out to each admin surface. The
// submissions tile shows a live count of pending submissions so the
// queue is visible at a glance without a visit.
//
// All tiles share the same visual treatment (card + icon + title +
// description + chevron). If we add more admin surfaces later, drop
// another entry in the TILES array below — no layout changes needed.

import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { AdminOnly } from '@/src/features/admin/AdminOnly';
import { Card } from '@/src/components/ui/Card';
import { COLORS, RADIUS, SPACING } from '@/src/constants/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface Tile {
  route: string;
  icon: IoniconName;
  title: string;
  description: string;
  badge?: string;
}

export default function AdminHomeScreen() {
  return (
    <AdminOnly>
      <Home />
    </AdminOnly>
  );
}

function Home() {
  const router = useRouter();
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    // Live count for the submissions tile — gives admins signal without
    // opening the queue. Cheap head+count query, not a full read.
    (async () => {
      try {
        const { count } = await supabase
          .from('cigar_submissions')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending');
        setPendingCount(count ?? 0);
      } catch {
        // Surfaced via the tile badge; silent if unavailable.
      }
    })();
  }, []);

  const tiles: Tile[] = [
    {
      route: '/admin/add-cigar',
      icon: 'add-circle-outline',
      title: 'Add Cigar',
      description: 'Insert a new cigar directly into the catalog.',
    },
    {
      route: '/admin/submissions',
      icon: 'mail-unread-outline',
      title: 'Review Submissions',
      description: 'Approve or reject user-submitted cigars.',
      badge: pendingCount && pendingCount > 0 ? `${pendingCount}` : undefined,
    },
    {
      route: '/admin/edit-cigar',
      icon: 'create-outline',
      title: 'Edit Cigars',
      description: 'Fix typos or update existing catalog entries.',
    },
    {
      route: '/admin/dashboard',
      icon: 'stats-chart-outline',
      title: 'Dashboard',
      description: 'Quick stats on catalog, users, scans.',
    },
    {
      route: '/admin/invites',
      icon: 'person-add-outline',
      title: 'Admin Invites',
      description: 'Add or remove other admin emails.',
    },
  ];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.intro}>
        Catalog management tools. Changes made here go live immediately — no
        approval queue for admin actions.
      </Text>

      {tiles.map((tile) => (
        <Pressable
          key={tile.route}
          onPress={() => router.push(tile.route as never)}
          style={({ pressed }) => [pressed && { opacity: 0.85 }]}
        >
          <Card style={styles.tile}>
            <View style={styles.iconWrap}>
              <Ionicons name={tile.icon} size={24} color={COLORS.accent} />
            </View>
            <View style={styles.tileBody}>
              <View style={styles.titleRow}>
                <Text style={styles.tileTitle}>{tile.title}</Text>
                {tile.badge && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{tile.badge}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.tileDesc}>{tile.description}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
          </Card>
        </Pressable>
      ))}
    </ScrollView>
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
  intro: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: SPACING.sm,
    lineHeight: 20,
  },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.card2 ?? COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileBody: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  tileTitle: {
    fontFamily: 'Cormorant',
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  tileDesc: {
    fontFamily: 'Cormorant',
    fontSize: 13,
    color: COLORS.muted,
    marginTop: 2,
  },
  badge: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  badgeText: {
    fontFamily: 'Cormorant',
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.bg,
  },
});
