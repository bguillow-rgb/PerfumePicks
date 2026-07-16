import { View, Text, StyleSheet, Pressable, Image, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, RADIUS, FONTS } from '@/src/constants/theme';
import type { DupeResult } from '@/src/stores/useCatalogStore';

interface Props {
  dupes: DupeResult[];
  loading?: boolean;
  /** Cap the number of rows rendered (e.g. 3 for the Home preview). */
  max?: number;
  /** Shown when there are zero dupes. Caller decides the copy/CTA. */
  emptyState?: React.ReactNode;
  /**
   * Freemium teaser: how many dupes are withheld behind Pro (total - revealed).
   * When > 0 a locked footer row renders below the revealed dupes. The withheld
   * rows are never sent to the client — this is just the count for the CTA.
   */
  lockedCount?: number;
  /** Tapped the locked footer — caller routes to the paywall. */
  onUnlock?: () => void;
}

/**
 * Ranked dupe list — the hero surface (PRD §7.1). Rows are ordered
 * closest-match-first by the get_dupes RPC (editorial > seed > algo, then
 * match_pct desc, then savings desc), so render order IS the ranking.
 *
 * Each row is honest about confidence: a high-confidence pair shows a gold
 * "92% match" pill; a loose pair (match_pct < 70, flagged server-side via
 * is_loose) shows a muted "Loose match" label instead of a misleading number —
 * this directly addresses the "shared notes ≠ you'll like it" skepticism the
 * PRD quotes.
 *
 * Reused by: fragrance detail, Discover dupe hero, Home "Don't Pay a Fortune".
 */
export function DupeList({ dupes, loading, max, emptyState, lockedCount = 0, onUnlock }: Props) {
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }
  // No dupes revealed AND none withheld => this bottle genuinely has no dupe.
  // With the free gate at 0 (migration 202607161200) a non-Pro user always lands
  // here with dupes.length === 0 while lockedCount > 0, so bailing on the empty
  // list alone would swallow the locked teaser and they'd never learn a dupe
  // exists. Only show the empty state when there is truly nothing to tease.
  if (dupes.length === 0 && lockedCount === 0) {
    return <>{emptyState ?? null}</>;
  }
  const rows = max ? dupes.slice(0, max) : dupes;
  // Free users see none of the list, so "N MORE dupes" would be wrong: there is
  // no "more" without a first.
  const noneRevealed = rows.length === 0;
  return (
    <View style={styles.list}>
      {rows.map((d, i) => (
        <DupeRow key={d.id} dupe={d} rank={i + 1} />
      ))}
      {lockedCount > 0 && (
        <Pressable
          style={styles.lockedRow}
          onPress={onUnlock}
          accessibilityLabel={
            noneRevealed
              ? `${lockedCount} ${lockedCount === 1 ? 'dupe' : 'dupes'} found for this bottle. Get Pro to see ${lockedCount === 1 ? 'it' : 'them'}.`
              : `${lockedCount} more ${lockedCount === 1 ? 'dupe' : 'dupes'} with Pro`
          }
        >
          <View style={styles.lockedIcon}>
            <Ionicons name="lock-closed" size={16} color={COLORS.accent} />
          </View>
          <View style={styles.lockedContent}>
            <Text style={styles.lockedTitle}>
              {noneRevealed
                ? `${lockedCount} ${lockedCount === 1 ? 'dupe' : 'dupes'} found for this bottle`
                : `${lockedCount} more ${lockedCount === 1 ? 'dupe' : 'dupes'} ranked & ready`}
            </Text>
            <Text style={styles.lockedSub}>
              {noneRevealed
                ? `Pro shows you which ${lockedCount === 1 ? 'bottle it is' : 'bottles they are'} and what you'd save`
                : 'See every match % and how much you save'}
            </Text>
          </View>
          <Text style={styles.lockedCta}>Unlock →</Text>
        </Pressable>
      )}
    </View>
  );
}

function DupeRow({ dupe, rank }: { dupe: DupeResult; rank: number }) {
  const router = useRouter();
  const savings = Math.round(dupe.price_delta_cents / 100);
  const showSavings = savings > 0;

  return (
    <Pressable
      onPress={() => router.push(`/fragrance/${dupe.id}`)}
      style={styles.row}
      accessibilityLabel={`${dupe.brand} ${dupe.name}, ${dupe.is_loose ? 'loose match' : `${dupe.match_pct} percent match`}${showSavings ? `, save ${savings} dollars` : ''}`}
    >
      <Text style={styles.rank}>{rank}</Text>
      <View style={styles.imageWrap}>
        <Image source={{ uri: dupe.image_url }} style={styles.image} />
      </View>
      <View style={styles.content}>
        <Text style={styles.brand} numberOfLines={1}>{dupe.brand.toUpperCase()}</Text>
        <Text style={styles.name} numberOfLines={2}>{dupe.name}</Text>
        {dupe.dupe_source === 'editorial' && dupe.is_loose === false && (
          <View style={styles.editorialRow}>
            <Ionicons name="ribbon-outline" size={10} color={COLORS.accent} />
            <Text style={styles.editorialText}>Editor pick</Text>
          </View>
        )}
      </View>
      <View style={styles.metrics}>
        {dupe.is_loose ? (
          <View style={styles.loosePill}>
            <Text style={styles.looseText}>Loose match</Text>
          </View>
        ) : (
          <View style={styles.matchPill}>
            <Text style={styles.matchText}>{dupe.match_pct}% match</Text>
          </View>
        )}
        {showSavings && <Text style={styles.savings}>Save ~${savings}</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: SPACING.lg, alignItems: 'center' },
  list: { gap: SPACING.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.sm,
    gap: SPACING.sm,
  },
  rank: {
    width: 18,
    textAlign: 'center',
    fontFamily: FONTS.serif,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.subtle,
  },
  imageWrap: {
    width: 64,
    height: 64,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    backgroundColor: COLORS.card2,
  },
  image: { width: '100%', height: '100%' },
  content: { flex: 1, justifyContent: 'center' },
  brand: { ...TYPE.eyebrow, fontSize: 10, marginBottom: 2 },
  name: {
    fontFamily: FONTS.serif,
    fontWeight: '600',
    fontSize: 15,
    color: COLORS.text,
    lineHeight: 19,
  },
  editorialRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  editorialText: { fontSize: 10, color: COLORS.accent, fontWeight: '600', letterSpacing: 0.3 },
  metrics: { alignItems: 'flex-end', justifyContent: 'center', gap: 4, minWidth: 78 },
  matchPill: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  matchText: { fontSize: 11, fontWeight: '700', color: COLORS.white, letterSpacing: 0.2 },
  loosePill: {
    backgroundColor: COLORS.card2,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  looseText: { fontSize: 11, fontWeight: '600', color: COLORS.muted, letterSpacing: 0.2 },
  savings: { fontSize: 12, fontWeight: '700', color: COLORS.success, letterSpacing: 0.2 },
  lockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.card2,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderStyle: 'dashed',
    padding: SPACING.sm,
  },
  lockedIcon: {
    width: 64,
    height: 64,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.card,
  },
  lockedContent: { flex: 1, justifyContent: 'center' },
  lockedTitle: { fontFamily: FONTS.serif, fontWeight: '600', fontSize: 15, color: COLORS.text },
  lockedSub: { ...TYPE.bodySmall, color: COLORS.muted, marginTop: 2 },
  lockedCta: { ...TYPE.label, color: COLORS.accent, fontSize: 12, paddingRight: SPACING.xs },
});
