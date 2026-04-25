import { useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, Image, Dimensions } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, FONTS, RADIUS } from '@/src/constants/theme';
import { NotePyramid } from '@/src/components/fragrance/NotePyramid';
import { AccordChip } from '@/src/components/fragrance/AccordChip';
import { PerfBar } from '@/src/components/fragrance/PerfBar';
import { FragranceCard } from '@/src/components/fragrance/FragranceCard';
import { AddToWardrobeSheet } from '@/src/components/sheets/AddToWardrobeSheet';
import { LogWearSheet } from '@/src/components/sheets/LogWearSheet';
import { getFragrance, getFragrances } from '@/src/mock/fragrances';
import { useWardrobeStore } from '@/src/stores/useWardrobeStore';
import { useWearLogStore } from '@/src/stores/useWearLogStore';

const { width: SCREEN_W } = Dimensions.get('window');
const HERO_HEIGHT = SCREEN_W * 1.05;

/**
 * Fragrance detail page — the canonical view of a single fragrance.
 *
 * Pulls from the mock catalog. Real version reads from Supabase + the
 * recommendation engine for "similar" + "dupes" sections.
 */
export default function FragranceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const fragrance = getFragrance(id ?? '');
  const [wardrobeSheetOpen, setWardrobeSheetOpen] = useState(false);
  const [wearSheetOpen, setWearSheetOpen] = useState(false);

  // Live state from the persisted stores so the CTAs reflect reality.
  const inWardrobe = useWardrobeStore((s) => fragrance ? s.getByFragrance(fragrance.id) : undefined);
  const wearLogs = useWearLogStore((s) => fragrance ? s.forFragrance(fragrance.id) : []);

  if (!fragrance) {
    return (
      <View style={styles.notFound}>
        <Text style={styles.notFoundText}>Fragrance not found.</Text>
        <Pressable onPress={() => router.back()} style={styles.notFoundBtn}>
          <Text style={styles.notFoundBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const similar = getFragrances(fragrance.similar_ids);
  const headlinePrice = (fragrance.retail_msrp_usd_cents / 100).toFixed(0);

  return (
    <View style={styles.safe}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Image source={{ uri: fragrance.image_url }} style={styles.heroImage} />
          <View style={styles.heroOverlay} />

          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={26} color={COLORS.white} />
          </Pressable>
          <Pressable style={styles.heartBtn}>
            <Ionicons name="heart-outline" size={22} color={COLORS.white} />
          </Pressable>

          <View style={styles.heroContent}>
            <Text style={styles.heroBrand}>{fragrance.brand.toUpperCase()}</Text>
            <Text style={styles.heroName}>{fragrance.name}</Text>
            <View style={styles.heroMeta}>
              <Text style={styles.heroMetaText}>{prettyConcentration(fragrance.concentration)}</Text>
              <Text style={styles.heroMetaDot}>·</Text>
              <Text style={styles.heroMetaText}>{fragrance.fragrance_family}</Text>
              <Text style={styles.heroMetaDot}>·</Text>
              <Text style={styles.heroMetaText}>{fragrance.release_year}</Text>
            </View>
          </View>
        </View>

        <Section title="Notes" cursive="composition">
          <NotePyramid
            top_notes={fragrance.top_notes}
            heart_notes={fragrance.heart_notes}
            base_notes={fragrance.base_notes}
          />
        </Section>

        <Section title="Accords" cursive="character">
          <View style={styles.accordWrap}>
            {fragrance.top_accords.map((a) => (
              <AccordChip key={a} label={a} intensity={fragrance.accord_intensity[a] ?? 3} />
            ))}
          </View>
        </Section>

        <Section title="Performance" cursive="how it wears">
          <View style={styles.perfCard}>
            <PerfBar label="Longevity" value={fragrance.community_longevity} />
            <PerfBar label="Sillage" value={fragrance.community_sillage} />
            <PerfBar label="Projection" value={fragrance.community_projection} />
            <View style={styles.scoreRow}>
              <ScoreTile label="Compliments" value={fragrance.compliment_score} />
              <ScoreTile label="Versatility" value={fragrance.versatility_score} />
              <ScoreTile label="Office Safe" value={fragrance.office_safe_score} />
            </View>
          </View>
        </Section>

        <Section title="Smells Like" cursive="discover similar">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
            {similar.map((f) => <FragranceCard key={f.id} fragrance={f} />)}
          </ScrollView>
        </Section>

        <Section title="Pricing" cursive="where to buy">
          <View style={styles.priceCard}>
            <View style={styles.priceRow}>
              <View>
                <Text style={styles.priceLabel}>Retail · 50ml</Text>
                <Text style={styles.priceValue}>${headlinePrice}</Text>
              </View>
              <View style={styles.priceTier}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <View key={i} style={[styles.priceDot, i < fragrance.price_tier && styles.priceDotActive]} />
                ))}
                <Text style={styles.priceTierLabel}>Tier {fragrance.price_tier}</Text>
              </View>
            </View>
            <View style={styles.priceDivider} />
            <Text style={styles.priceFootnote}>
              Decant pricing across Sephora, Nordstrom, Luckyscent and FragranceX
              appears once the data pipeline is wired up.
            </Text>
          </View>
        </Section>

        {/* Wear log preview — shows up only if the user has logged this
            fragrance before. Encourages re-engagement and shows the data
            captured by the LogWearSheet is being put to use. */}
        {wearLogs.length > 0 && (
          <Section title="Your Wears" cursive={`${wearLogs.length} logged`}>
            <View style={styles.wearList}>
              {wearLogs.slice(0, 3).map((w) => (
                <View key={w.id} style={styles.wearRow}>
                  <Ionicons name="bookmark" size={14} color={COLORS.accent} />
                  <Text style={styles.wearDate}>{prettyWearDate(w.worn_on)}</Text>
                  {w.occasion && <Text style={styles.wearMeta}>· {w.occasion}</Text>}
                  {w.rating != null && (
                    <View style={styles.wearStars}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Ionicons
                          key={i}
                          name={i < w.rating! ? 'star' : 'star-outline'}
                          size={11}
                          color={COLORS.accent}
                        />
                      ))}
                    </View>
                  )}
                </View>
              ))}
            </View>
          </Section>
        )}

        <View style={styles.ctaWrap}>
          {inWardrobe ? (
            <Pressable style={[styles.cta, styles.ctaInWardrobe]} onPress={() => setWardrobeSheetOpen(true)}>
              <Ionicons name="checkmark-circle" size={18} color={COLORS.white} style={{ marginRight: 8 }} />
              <Text style={styles.ctaText}>In Your Wardrobe</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.cta} onPress={() => setWardrobeSheetOpen(true)}>
              <Ionicons name="rose" size={16} color={COLORS.white} style={{ marginRight: 8 }} />
              <Text style={styles.ctaText}>Add to Wardrobe</Text>
            </Pressable>
          )}
          <Pressable style={styles.secondaryCta} onPress={() => setWearSheetOpen(true)}>
            <Ionicons name="bookmark-outline" size={16} color={COLORS.text} style={{ marginRight: 8 }} />
            <Text style={styles.secondaryCtaText}>Log a Wear</Text>
          </Pressable>
        </View>
      </ScrollView>

      <AddToWardrobeSheet
        visible={wardrobeSheetOpen}
        fragrance={fragrance}
        onClose={() => setWardrobeSheetOpen(false)}
      />
      <LogWearSheet
        visible={wearSheetOpen}
        fragrance={fragrance}
        onClose={() => setWearSheetOpen(false)}
      />
    </View>
  );
}

function prettyWearDate(iso: string): string {
  // "2026-04-25" → "Apr 25" / "today" / "yesterday"
  const today = new Date().toISOString().slice(0, 10);
  if (iso === today) return 'today';
  const d = new Date(iso + 'T00:00:00');
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (iso === yesterday.toISOString().slice(0, 10)) return 'yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function Section({ title, cursive, children }: { title: string; cursive?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {cursive && <Text style={styles.sectionCursive}>{cursive}</Text>}
      </View>
      {children}
    </View>
  );
}

function ScoreTile({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.scoreTile}>
      <Text style={styles.scoreValue}>{Math.round(value * 100)}</Text>
      <Text style={styles.scoreLabel}>{label}</Text>
    </View>
  );
}

function prettyConcentration(c: string): string {
  return ({ parfum: 'Parfum', edp: 'Eau de Parfum', edt: 'Eau de Toilette', cologne: 'Cologne', extrait: 'Extrait' } as any)[c] ?? c;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  container: { paddingBottom: SPACING.xxl * 1.5 },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg, gap: SPACING.lg },
  notFoundText: { ...TYPE.body },
  notFoundBtn: { backgroundColor: COLORS.accent, paddingHorizontal: SPACING.xl, paddingVertical: 12, borderRadius: RADIUS.full },
  notFoundBtnText: { color: COLORS.white, fontWeight: '600' },

  hero: {
    width: SCREEN_W, height: HERO_HEIGHT,
    backgroundColor: COLORS.card2,
    overflow: 'hidden',
  },
  heroImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(42,31,24,0.42)' },
  backBtn: {
    position: 'absolute', top: 56, left: SPACING.lg,
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.32)',
    alignItems: 'center', justifyContent: 'center',
  },
  heartBtn: {
    position: 'absolute', top: 56, right: SPACING.lg,
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.32)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroContent: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: SPACING.lg },
  heroBrand: { ...TYPE.eyebrow, color: COLORS.accentSoft, marginBottom: 6 },
  heroName: { fontFamily: FONTS.serif, fontWeight: '700', fontSize: 38, color: COLORS.white, lineHeight: 44, marginBottom: SPACING.sm },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroMetaText: { ...TYPE.caption, color: COLORS.white, opacity: 0.9 },
  heroMetaDot: { color: COLORS.white, opacity: 0.6 },

  section: { paddingHorizontal: SPACING.lg, marginTop: SPACING.xl },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: SPACING.md },
  sectionTitle: { ...TYPE.heading },
  sectionCursive: { fontFamily: 'PinyonScript_400Regular', fontSize: 22, color: COLORS.accent, lineHeight: 26 },
  hScroll: { paddingRight: SPACING.lg },

  accordWrap: {
    flexDirection: 'row', flexWrap: 'wrap',
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.lg,
  },

  perfCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.lg,
  },
  scoreRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  scoreTile: {
    flex: 1, alignItems: 'center', padding: SPACING.md,
    backgroundColor: COLORS.card2,
    borderRadius: RADIUS.md,
  },
  scoreValue: { fontFamily: FONTS.serif, fontSize: 28, fontWeight: '700', color: COLORS.accent, lineHeight: 34 },
  scoreLabel: { ...TYPE.eyebrow, fontSize: 9, marginTop: 2, textAlign: 'center' },

  priceCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.lg,
  },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  priceLabel: { ...TYPE.eyebrow, marginBottom: 4 },
  priceValue: { fontFamily: FONTS.serif, fontSize: 32, fontWeight: '700', color: COLORS.text, lineHeight: 36 },
  priceTier: { alignItems: 'flex-end', gap: 6 },
  priceDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.border, marginLeft: 4 },
  priceDotActive: { backgroundColor: COLORS.accent },
  priceTierLabel: { ...TYPE.caption, marginTop: 4 },
  priceDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.md },
  priceFootnote: { ...TYPE.bodySmall, color: COLORS.muted, fontStyle: 'italic' },

  ctaWrap: { paddingHorizontal: SPACING.lg, marginTop: SPACING.xl, gap: SPACING.sm },
  cta: {
    backgroundColor: COLORS.accent,
    paddingVertical: 16,
    borderRadius: RADIUS.full,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  ctaInWardrobe: { backgroundColor: COLORS.success },
  ctaText: { ...TYPE.label, color: COLORS.white, letterSpacing: 2 },
  wearList: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
    paddingVertical: 6,
  },
  wearRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: SPACING.md, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  wearDate: { ...TYPE.body, fontWeight: '600' },
  wearMeta: { ...TYPE.bodySmall },
  wearStars: { flexDirection: 'row', marginLeft: 'auto', gap: 1 },
  secondaryCta: {
    backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.border,
    paddingVertical: 16, borderRadius: RADIUS.full,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  secondaryCtaText: { ...TYPE.label, letterSpacing: 1.5 },
});
