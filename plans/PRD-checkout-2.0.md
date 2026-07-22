# PRD — Checkout 2.0 (Streamlined Buy)

Status: Draft for build · Owner: Founder · Author: Eng · Date: 2026-07-22

## 1. Summary

Today, tapping "Buy from perfumania" opens the retailer's **product page** in an
in-app browser. The user then fights cookie banners and newsletter popups, picks
a size, finds "Add to cart," goes to the cart, and finally checks out. Every step
is an exit.

Checkout 2.0 replaces that handoff with a **Shopify cart permalink**
(`perfumania.com/cart/{variantId}:1`) wrapped in the same CJ tracking link. The
user lands **directly on checkout with the fragrance already in the bag** — for
Shop Pay / PayPal / Google Pay / Venmo users this is a one or two tap purchase;
for everyone else it is a pre-filled checkout instead of a product page to hunt
through.

This is a monetization + conversion change. It does not touch discovery, DNA, or
the catalog. It affects one thing: what URL the Buy button opens.

## 2. Problem & evidence

- Perfume Picks affiliate revenue is **$0** with **12 lifetime buy taps / 0
  conversions** (KPI, 2026-07-22). The plumbing is healthy: links use the correct
  CJ website ID (101759456), dead links are filtered (`link_status='ok'` +
  `in_stock`), and perfumania links resolve. So the loss is at the **handoff**,
  not the link.
- Validated live 2026-07-22: the cart-permalink flow lands a fresh (no Shop Pay)
  session **directly on perfumania's checkout** with the item in the cart, and a
  Shop Pay session on a one-tap "Pay now." A real test purchase completed through
  the wrapped cart link (order **P574076**).
- Reference: Percolate ships this pattern (Two-Tap Buy, `docs/14-TWO-TAP-BUY-PRD`);
  its affiliate handler was itself ported from Perfume, so the base is shared.

## 3. Goals / non-goals

**Goals**
- G1. Land buyers on a checkout with the item in the bag, not the product page.
- G2. Preserve CJ commission attribution end to end (the launch gate, §8).
- G3. Zero regression for retailers/links that can't do it — automatic fallback
  to today's product-page handoff.
- G4. Ship the code + data dark, flip live via a flag with no new app release.

**Non-goals**
- Multi-item cart / bag (fragrance is a single considered purchase, not a basket).
- fragranceshop (WooCommerce) streamlined checkout — no Shopify cart permalink;
  it keeps the product-page handoff.
- Any change to which fragrance is recommended, ranked, or surfaced.

## 4. UX

- The Buy button label and placement are unchanged ("Buy from perfumania · $X").
- On tap:
  - If a `checkout_url` exists for the chosen link → open it (`landing=checkout`).
  - Else → open the product `url` exactly as today (`landing=product`).
- The user sees perfumania's own checkout (Shop/PayPal/GPay/Venmo express row, or
  the standard email→address→payment form) with the fragrance and price already
  loaded. One cookie banner, versus a product page's popups.
- No in-app checkout, no stored payment, no PII touched by us. We only choose the
  URL to hand to the retailer.

## 5. Technical design

**Data (fragrance_retailer_links, migration §013 below)**
- `checkout_url text null` — CJ-wrapped Shopify cart permalink.
- `checkout_variant_id bigint null` — the Shopify variant id it was built from
  (debug / rebuild; Shopify ids exceed int32, hence bigint).
- Null on any row we can't build one for (fragranceshop, or a perfumania product
  with no valid variant). Null = fall back.

**ETL (`scripts/etl-perfumania-shopify.ts`)**
- Already fetches `products.json` and picks the cheapest valid-price variant
  (`best`). Capture `best.id`, build `cjCartUrl(best.id)`, write `checkout_url` +
  `checkout_variant_id` alongside the existing product-page `affiliate_url`.
- `cjCartUrl(v) = https://www.jdoqocy.com/click-{WEBSITE}-{ADV}?url={enc(perfumania.com/cart/{v}:1)}`.
  Same wrapper as `cjUrl`, destination swapped — so attribution routing is
  identical to the proven product-page link.

**Client (`src/lib/affiliate.ts` + call sites)**
- `handleAffiliateClick` gains `checkout_url?: string | null`. It computes
  `effectiveUrl = flagOn && checkout_url ? checkout_url : url`, opens that, and
  tags the event `landing: 'checkout' | 'product'`. Single source of truth for
  the fallback; call sites just pass both.
- Call sites (`app/fragrance/[id].tsx`, `TopMatchCard`, retailer-links store) add
  `checkout_url` to their select/shape and pass it through.
- Flag: `checkout_2_enabled` (app_settings, default **off**). Off → behaves
  exactly like today. This is the launch gate switch.

## 6. Rollout

1. Ship migration (adds nullable columns; inert until populated).
2. Run the extended ETL → perfumania rows get `checkout_url`.
3. OTA the client dark (`checkout_2_enabled=off`). No user-visible change.
4. Confirm attribution (§8). When confirmed, flip `checkout_2_enabled=on`. No new
   release needed.

## 7. Success metrics

- Primary: **buy-tap → confirmed CJ sale** conversion rate, checkout vs product
  (`landing` dimension on `affiliate_outbound_clicked`).
- Guardrail: CJ commission $ per 100 buy taps must be **≥** the product-page
  baseline. If Checkout 2.0 converts better but earns less (attribution leak), it
  fails and we roll back the flag.
- Secondary: buy taps per active user (does a less-painful checkout lift intent).

## 8. Launch gate — attribution (BLOCKING)

Checkout 2.0 must not go live to users until we confirm CJ still pays through the
streamlined flow. The slick Shop Pay path routes via `shop.app`, which may bypass
where perfumania fires its CJ conversion tag.

- Test purchase **P574076** ($4.99, Cuba Red) completed 2026-07-22 through the
  wrapped cart link. As of build time it had **not yet posted** to CJ (normal
  posting lag; searched Order ID → no record yet).
- **Gate:** flip `checkout_2_enabled=on` only after a transaction for P574076 (or
  a later deliberate test) appears in CJ **Transactions** with a commission.
- If it never posts within ~48h → the flow leaks attribution; keep the flag off,
  fall back stays, and we evaluate landing on the plain `/cart` page (which shows
  the express row but not the shop.app fast-path) instead.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Shop Pay flow bypasses CJ tag → no commission | §8 launch gate; flag stays off until proven |
| Shopify variant id goes stale (product edited) | ETL re-runs on refresh and rewrites; null-safe fallback if a build fails |
| Cart permalink bounces on some products/regions | Fallback to product page on null; monitor `affiliate_link_failed` |
| perfumania blocks the ETL's products.json | Already open + in use by the existing ETL; unchanged access pattern |

## 10. Test plan

See `docs/CHECKOUT-2.0.md` (technical doc + test-case matrix) and:
- Unit: cart-URL builder + checkout/product fallback selection.
- E2E: `tests/maestro/generated/checkout-2.0.yaml` (app opens the correct URL on
  Buy; Maestro cannot drive external Safari, so it asserts to the handoff).
- Manual: the §8 attribution purchase.

## 11. Open questions

- Does CJ attribute a Shop-Pay/shop.app order? (Resolved by §8.)
- Do we want the plain `/cart` landing (express row, no shop.app fast-path) as a
  safer default if attribution is marginal? (Decide after §8.)
