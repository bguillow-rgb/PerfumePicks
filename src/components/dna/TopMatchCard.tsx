import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '@/src/constants/theme';
import type { BuyableMatch } from '@/src/features/dna/score';
import { handleAffiliateClick } from '@/src/lib/affiliate';

/**
 * TopMatchCard — the affiliate-first "TOP MATCH" hero for the DNA reveal +
 * canonical taste-profile page (DNA flow v2 M2). One component, two states:
 *
 *   - BUYABLE (match.buyable set): shows the representative price and a
 *     "Buy from {retailer}" CTA. The price, the retailer, and the opened url all
 *     come from the SAME row (BuyableLink), so the label can never disagree with
 *     where the tap lands. The buy CTA routes through handleAffiliateClick so the
 *     CJ wrapper + outbound-click attribution + dead-link reporting are uniform
 *     with every other buy surface.
 *   - FALLBACK (match.buyable === null): the zero-buyable case. No price, no buy
 *     CTA — just "View details", so we never imply a purchase we can't fulfil.
 *
 * Tapping the card body always opens the bottle's detail page.
 */

interface TopMatchCardProps {
  match: BuyableMatch;
  /** Analytics source for the outbound click (e.g. 'dna_reveal', 'dna_matches'). */
  sourceScreen: string;
  /** Open the bottle's full detail page. */
  onViewDetails: (fragranceId: string) => void;
  /** Eyebrow above the card. Defaults to "YOUR TOP MATCH"; pass null to hide it
   *  (e.g. in a list where the page header already labels the section). */
  label?: string | null;
}

export function TopMatchCard({ match, sourceScreen, onViewDetails, label = 'YOUR TOP MATCH' }: TopMatchCardProps) {
  const frag = match.fragrance;
  const buyable = match.buyable;
  // Show real precision on the buy anchor: whole dollars when even, cents otherwise
  // ($29.99 stays $29.99, not $30) so the label matches what the retailer charges.
  const priceLabel = buyable
    ? `$${(buyable.priceCents / 100).toFixed(buyable.priceCents % 100 === 0 ? 0 : 2)}`
    : null;
  const reason = match.reasons[0];

  const onBuy = () => {
    if (!buyable) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    handleAffiliateClick({
      fragrance_id: frag.id,
      retailer: buyable.retailer,
      url: buyable.url,
      // Checkout 2.0: flag + null handling live in handleAffiliateClick.
      checkout_url: buyable.checkoutUrl ?? null,
      price_cents: buyable.priceCents,
      source_screen: sourceScreen,
    });
  };

  return (
    <View style={styles.wrap} testID="dna-top-match">
      <Text style={styles.eyebrow}>{label}</Text>
      <Pressable
        style={styles.card}
        onPress={() => onViewDetails(frag.id)}
        accessibilityLabel={`${frag.brand ?? ''} ${frag.name ?? ''}`.trim()}
      >
        <Image source={{ uri: frag.image_url }} style={styles.img} contentFit="cover" />
        <View style={styles.info}>
          {!!frag.brand && <Text style={styles.brand} numberOfLines={1}>{frag.brand}</Text>}
          <Text style={styles.name} numberOfLines={2}>{frag.name ?? 'Your match'}</Text>
          {!!reason && <Text style={styles.reason} numberOfLines={2}>{reason}</Text>}
          {priceLabel && (
            <View style={styles.priceRow}>
              <Text style={styles.price}>{priceLabel}</Text>
              {!!buyable?.retailer && (
                <Text style={styles.retailer} numberOfLines={1}>at {buyable.retailer}</Text>
              )}
            </View>
          )}
        </View>
      </Pressable>

      {buyable ? (
        <Pressable style={styles.buyCta} onPress={onBuy} testID="dna-top-match-buy">
          <Ionicons name="bag-handle-outline" size={16} color={COLORS.white} />
          <Text style={styles.buyText}>Buy from {buyable.retailer || 'retailer'}</Text>
        </Pressable>
      ) : (
        <Pressable
          style={styles.detailsCta}
          onPress={() => onViewDetails(frag.id)}
          testID="dna-top-match-details"
        >
          <Text style={styles.detailsText}>View details</Text>
          <Ionicons name="arrow-forward" size={15} color={COLORS.accent} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: SPACING.xl },
  eyebrow: { ...TYPE.eyebrow, color: COLORS.accent, marginBottom: SPACING.sm, textAlign: 'center' },
  card: {
    flexDirection: 'row',
    gap: SPACING.md,
    padding: SPACING.md,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  img: {
    width: 84,
    aspectRatio: 0.82,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.blushSoft,
  },
  info: { flex: 1, justifyContent: 'center' },
  brand: { ...TYPE.caption, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  name: { fontFamily: FONTS.serif, fontSize: 20, fontWeight: '700', color: COLORS.text, marginTop: 2 },
  reason: { ...TYPE.bodySmall, color: COLORS.muted, marginTop: 4, lineHeight: 18 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: SPACING.sm },
  price: { fontFamily: FONTS.serif, fontSize: 22, fontWeight: '700', color: COLORS.accent },
  retailer: { ...TYPE.caption, color: COLORS.muted, flexShrink: 1 },
  buyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: SPACING.md,
    backgroundColor: COLORS.accent,
    paddingVertical: 14,
    borderRadius: RADIUS.full,
  },
  buyText: { ...TYPE.label, color: COLORS.white, fontSize: 14, letterSpacing: 0.5 },
  detailsCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: SPACING.md,
    paddingVertical: 14,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.accent,
    backgroundColor: COLORS.card,
  },
  detailsText: { ...TYPE.label, color: COLORS.accent, fontSize: 14, letterSpacing: 0.5 },
});
