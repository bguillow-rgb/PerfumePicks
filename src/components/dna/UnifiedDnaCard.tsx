import { View, Text, StyleSheet, Pressable, ScrollView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, RADIUS, FONTS } from '@/src/constants/theme';
import { ARCHETYPE_COPY, journeyLine } from '@/src/features/dna/revealCopy';
import { LivingArchetypeReadout } from '@/src/components/dna/LivingArchetypeReadout';
import type { FragranceDNA } from '@/src/features/dna/types';
import type { RankedDnaRec } from '@/src/features/dna/score';
import type { Fragrance } from '@/src/stores/useCatalogStore';

/**
 * Unified DNA card (Chief UX redesign) — the Today screen's hero identity object.
 *
 * Replaces the old two-surface system (a lonely journey chip + a generic
 * "YOUR FRAGRANCE DNA" Section rail) with ONE authored card that reads as the
 * user's taste made visible:
 *   1. Archetype header — emblem (tinted ring) + name + identity, Retake inline.
 *   2. Picks rail — the matched bottles, each tied back to the archetype via a
 *      hairline tint bar so they read as "from YOUR DNA," not loose recs.
 *   3. Journey footer — the forward line ("You're at elegant florals…") + a
 *      "Learn more →" tap into the Journey home. Hidden when no journey exists.
 *
 * The golden accent border echoes MyDnaCard on the You tab — same DNA object,
 * two surfaces. Tint comes from ARCHETYPE_COPY (per-archetype signature hue).
 */

interface UnifiedDnaCardProps {
  dna: FragranceDNA;
  recs: RankedDnaRec[];
  onRetake: () => void;
  onLearnMore: () => void;
  onPickPress: (id: string) => void;
}

export function UnifiedDnaCard({ dna, recs, onRetake, onLearnMore, onPickPress }: UnifiedDnaCardProps) {
  const copy = ARCHETYPE_COPY[dna.archetype.primary];
  const tint = copy.visual.tint;
  const journey = journeyLine(dna.journey ?? null);

  return (
    <View style={styles.card} testID="today-unified-dna">
      {/* ── Zone 1: Archetype header ── */}
      <View style={styles.header}>
        {/* Eyebrow row carries the "Retake" action so the archetype name below
            keeps the FULL card width — at large Dynamic Type an inline Retake
            squeezed the name into "The Cro…". */}
        <View style={styles.eyebrowRow}>
          <Text style={styles.eyebrow} numberOfLines={1}>YOUR FRAGRANCE DNA</Text>
          <Pressable onPress={onRetake} hitSlop={8} testID="today-dna-retake">
            <Text style={styles.retake}>Retake →</Text>
          </Pressable>
        </View>
        <View style={styles.headerRow}>
          <View style={[styles.emblem, { backgroundColor: tint }]}>
            <Ionicons
              name={copy.visual.icon as keyof typeof Ionicons.glyphMap}
              size={20}
              color={COLORS.white}
            />
          </View>
          <Text style={styles.archetype} numberOfLines={2} testID="today-dna-archetype">
            {copy.name}
          </Text>
        </View>
        <Text style={styles.identity} numberOfLines={3}>{copy.identity}</Text>
        <LivingArchetypeReadout dna={dna} variant="compact" />
      </View>

      <View style={styles.divider} />

      {/* ── Zone 2: Picks rail ── */}
      {recs.length === 0 ? (
        <View style={styles.emptyRail}>
          <Text style={styles.emptyText}>
            Lining up bottles that match your taste. Pull to refresh in a moment.
          </Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rail}
        >
          {recs.map((r) => {
            const f = r.fragrance as unknown as Fragrance;
            return (
              <DnaPickCard
                key={f.id}
                fragrance={f}
                reason={r.reasons[0]}
                tint={tint}
                onPress={() => onPickPress(f.id)}
              />
            );
          })}
        </ScrollView>
      )}

      {/* ── Zone 3: Journey footer ── */}
      {journey && (
        <>
          <View style={styles.divider} />
          <View style={styles.footer}>
            <View style={styles.footerRow}>
              <Ionicons name="trail-sign-outline" size={16} color={COLORS.accent} />
              <Text style={styles.journeyText} numberOfLines={3}>{journey}</Text>
            </View>
            <Pressable onPress={onLearnMore} hitSlop={8} style={styles.learnMoreWrap} testID="today-dna-learn-more">
              <Text style={styles.learnMore}>Learn more →</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

function DnaPickCard({ fragrance, reason, tint, onPress }: {
  fragrance: Fragrance;
  reason?: string;
  tint: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [pick.wrap, pressed && { opacity: 0.85 }]} onPress={onPress}>
      <View style={[pick.tintBar, { backgroundColor: tint }]} />
      <View style={pick.imgWrap}>
        {fragrance.image_url ? (
          <Image source={{ uri: fragrance.image_url }} style={pick.img} resizeMode="cover" />
        ) : (
          <View style={[pick.img, pick.imgPlaceholder]}>
            <Ionicons name="flask-outline" size={22} color={COLORS.accent} />
          </View>
        )}
      </View>
      <View style={pick.info}>
        <Text style={pick.brand} numberOfLines={1}>{fragrance.brand.toUpperCase()}</Text>
        <Text style={pick.name} numberOfLines={1}>{fragrance.name}</Text>
        {reason ? (
          <View style={pick.reasonRow}>
            <Ionicons name="sparkles" size={11} color={COLORS.accent} style={{ marginTop: 2 }} />
            <Text style={pick.reason} numberOfLines={2}>{reason}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    marginBottom: SPACING.lg,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.accent,
    overflow: 'hidden',
    shadowColor: COLORS.accent,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },

  // Zone 1 — header
  header: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  eyebrow: { ...TYPE.eyebrow, color: COLORS.accent, flexShrink: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  emblem: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  archetype: {
    flex: 1,
    fontFamily: FONTS.serif,
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
  },
  retake: { ...TYPE.label, color: COLORS.accent, fontSize: 14 },
  identity: { ...TYPE.bodySmall, color: COLORS.muted, marginTop: SPACING.sm, lineHeight: 20 },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.md,
    marginHorizontal: SPACING.lg,
  },

  // Zone 2 — picks rail
  rail: { paddingLeft: SPACING.lg, paddingRight: SPACING.lg - SPACING.md },
  emptyRail: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md },
  emptyText: { ...TYPE.bodySmall, color: COLORS.muted, lineHeight: 20 },

  // Zone 3 — journey footer
  footer: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md },
  footerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
  journeyText: { ...TYPE.bodySmall, color: COLORS.text, flex: 1, lineHeight: 20 },
  learnMoreWrap: { alignSelf: 'flex-start', marginTop: SPACING.sm, marginLeft: 24 },
  learnMore: { ...TYPE.label, color: COLORS.accent, fontSize: 14 },
});

const pick = StyleSheet.create({
  wrap: {
    width: 150,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    marginRight: SPACING.md,
  },
  tintBar: { height: 3, width: '100%' },
  imgWrap: { width: '100%', height: 150 },
  img: { width: '100%', height: '100%' },
  imgPlaceholder: {
    backgroundColor: COLORS.card2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { padding: SPACING.sm, gap: 2 },
  brand: { ...TYPE.eyebrow, fontSize: 9, color: COLORS.accent },
  name: { fontFamily: FONTS.serif, fontSize: 14, fontWeight: '600', color: COLORS.text },
  reasonRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 3 },
  reason: { ...TYPE.bodySmall, fontSize: 13, color: COLORS.muted, fontStyle: 'italic', lineHeight: 18, flex: 1 },
});
