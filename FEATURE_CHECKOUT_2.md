# Checkout 2.0 — Technical Doc & Test Matrix

PRD: `plans/PRD-checkout-2.0.md` · Shipped dark behind `app_settings.checkout_2_enabled`.

## How it works

One decision, made in exactly one place (`src/lib/affiliate.ts` →
`handleAffiliateClick`):

```
useCheckout  = isCheckout2Enabled() && !!params.checkout_url
effectiveUrl = useCheckout ? checkout_url : url
```

- `checkout_url` is a CJ click wrapper (`jdoqocy.com/click-101759456-17277211?url=…`)
  whose destination is the Shopify **cart permalink**
  `perfumania.com/cart/{variantId}:1`. Landing: perfumania's checkout with the
  item in the bag (express row: Shop/PayPal/GPay/Venmo, or the standard form).
- `url` is the existing product-page wrapper. It remains on every row and is the
  universal fallback.

### Data flow

| Layer | File | What it does |
|---|---|---|
| DB | `supabase/migrations/202607221200_checkout_2_columns.sql` | `fragrance_retailer_links.checkout_url TEXT`, `checkout_variant_id BIGINT` (nullable, world-readable via existing RLS) + `app_settings.checkout_2_enabled='false'` |
| ETL | `scripts/etl-perfumania-shopify.ts` (`cjCartUrl`) + `scripts/lib/affiliate-etl-base.ts` | The variant the price came from also builds the permalink, so the checkout total always matches the Buy-button price. Explicit `null` on rebuild failure clears stale permalinks. perfumania only; fragranceshop (WooCommerce) stays null. |
| Flag | `src/lib/checkout2Flag.ts` | Fail-closed module cache; resolved at app start + on foreground (rollback takes effect on next foreground, no release). |
| Client | `src/lib/affiliate.ts` | The decision + `landing: 'checkout'|'product'` on `affiliate_outbound_clicked`. |
| Surfaces | `app/fragrance/[id].tsx`, `src/components/dna/TopMatchCard.tsx`, `src/stores/useRetailerLinksStore.ts`, `src/features/dna/score.ts` (`BuyableLink.checkoutUrl`) | Select + pass `checkout_url` through; zero UI change. |

### Invariants

1. **Flag off ⇒ byte-identical behavior to pre-2.0.** Every fallback path opens
   the same `url` as before.
2. **The price shown is the price at checkout** — permalink and price come from
   the same Shopify variant.
3. **Attribution wrapper is identical** to the proven product link (same website
   ID 101759456, same advertiser 17277211); only the destination differs.
4. **Fail closed everywhere**: unresolved flag, missing column, null permalink,
   fragranceshop → product page.

## Rollout / rollback

1. Paste migration (inert). 2. Run `npx tsx scripts/etl-perfumania-shopify.ts`
(populates `checkout_url`). 3. OTA client (dark). 4. **Gate (PRD §8):** confirm a
CJ commission posts for a cart-permalink purchase (test order **P574076**,
2026-07-22). 5. Flip `app_settings.checkout_2_enabled='true'`. Rollback = set it
back to `'false'`; takes effect on next app foreground.

## Test matrix

| # | Layer | Case | Where | Status |
|---|---|---|---|---|
| T1 | unit | Flag on + checkout_url → opens checkout, `landing='checkout'` | `__tests__/lib/checkout2.test.ts` | automated ✅ |
| T2 | unit | Flag off + checkout_url → opens product, `landing='product'` | same | automated ✅ |
| T3 | unit | Flag on + null checkout_url (fragranceshop) → product | same | automated ✅ |
| T4 | unit | Legacy caller omits checkout_url → product | same | automated ✅ |
| T5 | unit | Flag unresolved (first-tap race) → product, never stale checkout | same | automated ✅ |
| T6 | unit | Flag fails closed before resolution | same | automated ✅ |
| T7 | unit | Cart-permalink contract: same CJ wrapper, `/cart/{v}:1` destination, int64 variant ids survive encoding | same | automated ✅ |
| T8 | e2e | Detail → Buy tap → browser sheet opens → Done → app intact (run with flag off AND on; journey identical) | `tests/maestro/generated/checkout-2.0.yaml` | at QA gate |
| T9 | manual | Fresh (no Shop Pay) session lands on checkout with item in bag | live check 2026-07-22 | ✅ verified |
| T10 | manual | Shop Pay session lands on one-tap "Pay now" | founder device 2026-07-22 | ✅ verified |
| T11 | manual | **Attribution: cart-permalink purchase posts a CJ commission** (order P574076) | CJ Transactions report | ⏳ **launch gate** |
| T12 | data | After ETL: every perfumania `link_status='ok'` row has non-null `checkout_url`; every fragranceshop row is null | SQL spot-check at QA gate | at QA gate |

## Known limits

- Maestro cannot read inside SFSafariViewController, so T8 proves the journey,
  not the URL; the URL choice is pinned by T1–T5.
- A Shopify variant deleted between ETL runs makes the permalink land on an
  empty-cart page until the next ETL run clears/rebuilds it (weekly refresh
  cadence; `checkout_variant_id` stored for debugging).
- Shop Pay's `shop.app` fast-path is the attribution risk under test in T11. If
  it fails, the documented fallback plan is landing on plain `/cart` instead
  (express row without the shop.app hop) — PRD §11.
