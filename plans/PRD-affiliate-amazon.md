# PRD — Affiliate Link Injection & Multi-Retailer Catalog
**Status:** Draft v2 · **Milestone:** M2 · **Date:** 2026-05-22
**Author:** Bob Guillow · **Amazon Store ID:** `perfumepicks-20`
**Scope:** Amazon Associates (primary) + multi-affiliate extensibility architecture. CJ (FragranceX) and Rakuten (Sephora, FragranceNet) are parallel approval tracks; this PRD is written so they are a config add, not a code rewrite.

---

## 1. Problem Statement

The fragrance detail page currently shows a static "Retail · 50ml / $X" price card with a footnote placeholder. There is no actionable purchase path. Users who want to buy a fragrance they discover in the app have no in-app route to do so, and Perfume Picks captures zero revenue from purchase intent.

Amazon Associates has been approved with Store ID `perfumepicks-20`. This is the first affiliate program live. This PRD specifies the full implementation — data model, runtime tag injection, multi-retailer extensibility, catalog strategy (PA API + Sephora scrape + niche-house data), UI, FTC disclosure, and PostHog tracking.

---

## 2. Catalog Strategy (pivoted from Fragella)

**Fragella API is OUT.** The prior plan used Fragella as the primary notes/accords source. That dependency is eliminated. The new catalog strategy uses three sources we own or control:

### 2.1 Source Priority Table

| Field | Primary | Fallback 1 | Fallback 2 |
|---|---|---|---|
| Fragrance name, brand, ASIN | Amazon PA API (Luxury Beauty) | Manual SiteStripe (Phase 0) | Niche-house scrape |
| Price, image URL | Amazon PA API | Sephora PDP scrape | Niche-house scrape |
| Retailer link | PA API product URL | Sephora PDP URL | Brand direct URL |
| Notes pyramid (top/middle/base) | Sephora PDP scrape | Niche-house scrape (`frag-*-raw.json`) | Hide in UI |
| Main accords + families | Our accord classifier (ETL-time JSON map) | Niche-house scrape | Hide in UI |
| Longevity / sillage | Niche-house scrape | Community-aggregated (post-launch) | — |
| Perfumer | Niche-house scrape | — | — |
| Release year | PA API / Sephora PDP | Niche-house scrape | Ingest-date proxy |
| Brand alias normalization | Manual mapping table | — | — |

**ETL guard:** if ALL sources return empty for a fragrance, skip it. Never ship half-data entries.

### 2.2 Amazon Creators API (PA-API v5 is retired)

**PA-API v5 was retired May 15, 2026.** The replacement is the **Amazon Creators API** — same product catalog functionality (search Luxury Beauty, get ASIN/name/brand/price/image), rebuilt on OAuth 2.0 instead of AWS Signature V4.

**Unlock path:** Creators API requires **10 qualifying sales through `perfumepicks-20` in a rolling 30-day window**. Until that threshold is met, manual SiteStripe link sourcing covers the seed catalog (see Phase 0 below).

**Auth change from PA-API:** No AWS Access Key / Secret Key. Credentials are a **Credential ID + Credential Secret** OAuth 2.0 keypair created in Associates Central → Tools → CreatorsAPI → Create Application → Add New Credential. The ETL script must use OAuth 2.0 token exchange, not AWS Signature V4 signing.

**Ongoing maintenance:** If qualifying sales drop below 10 in any 30-day window, Creators API access suspends automatically. Restored within ~2 days once the threshold is met again. Monitor the Associates dashboard monthly.

### 2.3 Sephora as Notes/Accords Source

Sephora product detail pages (PDPs) carry notes pyramids, fragrance descriptions, and accords for the mainstream catalog — exactly the overlap with the Amazon PA API catalog. Sephora is also a Rakuten affiliate; once Rakuten approval lands, the Sephora feed replaces the scraper.

Sephora PDP scrape is **not** a Fragrantica scrape. Fragrantica remains forbidden (active DMCA program).

### 2.4 Our Own Accord Classifier

A JSON mapping file (`scripts/data/accord-classifier.json`, to be built) maps note combinations → accord families:

```json
{
  "bergamot+neroli": "citrus",
  "rose+jasmine": "floral",
  "oud+sandalwood": "woody-oriental",
  ...
}
```

Accord family is derived at ETL time from the notes list. No third-party subscription dependency. The classifier is a first-party asset we can refine over time.

### 2.5 Niche-House Scraped Data

~50+ raw scrapes already collected under `scripts/data/frag-*-raw.json` (Arquiste, Bruno Fazzolari, Tom Ford, Xerjoff, Memo Paris, Carner Barcelona, Imaginary Authors, Jorum Studio, Zoologist, Vilhelm Parfumerie, Ormonde Jayne, and many others). These cover fragrances that Amazon/Sephora don't carry well.

Observed shape from `frag-tom-ford-raw.json`:
```json
{
  "brand": "Tom Ford",
  "name": "Soleil Blanc Parfum",
  "concentration": "parfum",
  "gender": "unisex",
  "retail_msrp_usd_cents": 39000,
  "prices": [{ "retailer": "tom-ford-beauty-direct", "size_ml": 50, "price_usd_cents": 39000, "url": "..." }],
  "image_url": "...",
  "top_notes": [], "heart_notes": [], "base_notes": [],
  "top_accords": [], "accord_intensity": {}
}
```

Notes fields are empty arrays in many niche-house scrapes — the accord classifier will populate family from any available notes; if notes are empty, that field remains null until community or future enrichment fills it.

**End result:** 2,500+ fully enriched fragrances, no subscription dependencies, all data owned by us.

---

## 3. Goals

| Goal | Metric | Target |
|---|---|---|
| Capture Amazon purchase intent | `affiliate_outbound_clicked` events / week | Baseline established within 2 weeks of M2 deploy |
| FTC compliance | Legal disclosure visible on every detail page with a "Buy from" section | 100% — zero exceptions |
| Clean URL storage | No affiliate tags stored in the database | Verified by DB CHECK constraint before deploy |
| Attribution accuracy | Every click event has `fragrance_id`, `retailer`, `price_cents`, `source_screen` | 100% — enforced by TypeScript interface |
| Multi-affiliate extensibility | Adding a new retailer requires zero code changes | Verified: new retailer = add row to `AFFILIATE_CONFIG` + insert DB rows only |
| Low friction for content population | Adding a new retailer link requires only a DB row insert | Yes — no code deploy needed |

---

## 4. Non-Goals

- CJ Affiliate (FragranceX), Rakuten (Sephora, FragranceNet) code — same architecture, just config. Not coded yet.
- Building a price-comparison engine or price history tracker.
- Any server-side redirect or link-shortening service.
- Smart App Banners or deep links from web marketing site (separate work item).
- Amazon product images in catalog — Operating Agreement prohibits using product images for catalog purposes.

---

## 5. Phase 0: Before Creators API (Manual Seed Path)

Creators API is locked until 10 qualifying sales land through `perfumepicks-20` in a rolling 30-day window. This phase covers the interim.

### 5.1 Manual SiteStripe Process

1. Navigate to each target fragrance on Amazon.
2. Use the SiteStripe toolbar (appears at top of page when signed into Associates) to copy the clean product URL.
3. Store the clean URL (no affiliate tag) in `fragrance_retailer_links`. The `appendAffiliateTag()` function injects the tag at click time.
4. Target: 50 seed fragrances (matching `014_seed_catalog.sql` coverage).

### 5.2 Qualifying Sales Strategy

The marketing site at `perfumepicks.app` will have affiliate-linked fragrance articles. These article clicks count toward the 10 qualifying sales requirement even before the app is in the App Store. Content team should publish at minimum 3 articles with Amazon affiliate CTAs and promote them. Fastest path: 3–4 friends/family purchase anything through a `perfumepicks-20` tagged link (any Amazon product counts, not just fragrance).

### 5.3 Phase 0 → Phase 1 Transition

Once Creators API access is confirmed (10 qualifying sales hit, credentials created in Associates Central → Tools → CreatorsAPI):
- Automated ETL replaces manual SiteStripe entries.
- ETL pulls Luxury Beauty category programmatically using OAuth 2.0 Credential ID + Credential Secret.
- Manual seed rows remain valid; ETL updates `last_seen_at` on match.

### 5.4 Phase 0 UI Impact

No difference in the app UI between Phase 0 and Phase 1. The `fragrance_retailer_links` table is populated either way; the detail page renders chips for whatever rows exist. The content team populates rows regardless of PA API status.

---

## 6. User Stories & Acceptance Criteria

### US-1 — Detail page shows "Buy from" retailer chips

**As a** user browsing a fragrance detail page,
**I want to** see retailer chips with the current price,
**so that** I can buy the fragrance without leaving the app.

**Acceptance Criteria:**

| # | Criterion |
|---|---|
| AC-1.1 | If `fragrance_retailer_links` has ≥1 row for this fragrance where `in_stock = true`, the "Buy from" section renders with one chip per row. |
| AC-1.2 | Each chip displays: retailer name (text only, no logo), formatted price if `price_cents` is not null, and size if `size_ml` is not null. |
| AC-1.3 | If no rows exist for the fragrance, the "Buy from" section does **not** render. The section divider is also hidden. Existing price card continues to show. |
| AC-1.4 | The FTC disclosure string "Affiliate links support Perfume Picks." is rendered **above** the chip row, always present when ≥1 chip is visible. |
| AC-1.5 | Chips are horizontally scrollable when count > 3, matching existing horizontal scroll pattern in the app. |

### US-2 — Click opens retailer with affiliate tag injected at runtime

**As a** user who taps a retailer chip,
**I want** the link to open in the device browser with my affiliate tag injected,
**so that** Perfume Picks earns a commission on any qualifying purchase I make.

**Acceptance Criteria:**

| # | Criterion |
|---|---|
| AC-2.1 | Tapping any chip calls `handleAffiliateClick()` — the URL opened in the browser carries the correct affiliate tag per retailer. The tag is appended at click time, never stored in the database. |
| AC-2.2 | `appendAffiliateTag()` uses `new URL(url)` + `searchParams.set()` — handles existing query params, URL fragments, and malformed URLs correctly. No string concatenation. |
| AC-2.3 | `Linking.openURL()` is used (Safari View Controller on iOS). The app does not attempt to open a WebView. |
| AC-2.4 | If `Linking.openURL()` rejects, a toast is shown: "Could not open retailer. Try again." and the error is logged to Sentry. |
| AC-2.5 | The database `fragrance_retailer_links.url` field stores only the clean product URL — no `?tag=` or affiliate params. Enforced by DB-level CHECK constraint: `url not like '%tag=%'`. |

### US-3 — Click is tracked in PostHog

**As a** product owner,
**I want** every affiliate click to fire a typed PostHog event,
**so that** I can measure which fragrances and retailers drive purchase intent.

**Acceptance Criteria:**

| # | Criterion |
|---|---|
| AC-3.1 | `EVENTS.AFFILIATE_OUTBOUND_CLICKED` fires on every chip tap, before `Linking.openURL()` is called. |
| AC-3.2 | Event payload contains: `fragrance_id` (uuid), `retailer` (string), `price_cents` (int or null), `source_screen` ("fragrance_detail"). |
| AC-3.3 | The event name is sourced from `src/lib/observability/events.ts` enum — no raw string literals at the call site. |
| AC-3.4 | PostHog failure does **not** block navigation — fire-and-forget. |

### US-4 — Free and Pro users both see "Buy from" section

**As a** free-tier user,
**I want** to see retailer chips on fragrance detail pages,
**so that** purchase intent is never gated.

**Acceptance Criteria:**

| # | Criterion |
|---|---|
| AC-4.1 | The "Buy from" section renders for all users regardless of `is_pro`. Affiliate revenue is not gated behind the paywall. |
| AC-4.2 | No Pro lock icon or upgrade prompt appears in or near the "Buy from" section. |

### US-5 — Content team can add/update retailer links with no app deploy

**As a** content operator,
**I want** to insert or update rows in `fragrance_retailer_links` via Supabase Studio or migration,
**so that** new retailer links go live without a code deploy.

**Acceptance Criteria:**

| # | Criterion |
|---|---|
| AC-5.1 | Adding a new row to `fragrance_retailer_links` with a valid `fragrance_id` causes the chip to appear on the next cold-start of the detail page. |
| AC-5.2 | No app binary change or App Store review is required to add or update retailer links. |

### US-6 — Adding a new retailer requires zero code changes

**As a** developer,
**I want** to add FragranceX or Sephora as a retailer by editing one config object and inserting DB rows,
**so that** the affiliate architecture scales without PRD-level engineering work per retailer.

**Acceptance Criteria:**

| # | Criterion |
|---|---|
| AC-6.1 | `AFFILIATE_CONFIG` is the single source of truth for affiliate tag parameters. No `if retailer === 'amazon'` branch exists anywhere in application code. |
| AC-6.2 | Adding a new retailer requires: (1) add one key to `AFFILIATE_CONFIG`, (2) insert rows into `fragrance_retailer_links` with that retailer value. Zero other code changes. |
| AC-6.3 | The chip UI renders correctly for any `retailer` value with an entry in `AFFILIATE_CONFIG`. |

---

## 7. Architecture

### 7.1 Data Model

**New table:** `fragrance_retailer_links`

**Migration file:** `supabase/migrations/015_fragrance_retailer_links.sql`

```sql
create table fragrance_retailer_links (
  id             uuid primary key default gen_random_uuid(),
  fragrance_id   uuid not null references fragrances(id) on delete cascade,
  retailer       text not null,                    -- 'amazon', 'fragrancex', 'sephora', etc.
  url            text not null,                    -- clean URL, NO affiliate tag
  our_affiliate_tag text,                          -- e.g. 'perfumepicks-20' — stored for audit, NOT appended here
  price_cents    numeric(6,2),                     -- nullable; null = "check site for price"
  size_ml        numeric,                          -- nullable; null = "varies" or unknown
  in_stock       boolean not null default true,
  last_seen_at   timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  constraint url_no_affiliate_tag check (url not like '%tag=%')
);

create index on fragrance_retailer_links(fragrance_id);
create index on fragrance_retailer_links(retailer);
```

**Notes on `price_cents` type:** Column is `numeric(6,2)` not `int`. Supabase JS returns `numeric` columns as strings — the hook must call `parseFloat()` before use (see §9).

**CHECK constraint:** `url not like '%tag=%'` catches tags from any affiliate program (not just Amazon), making the constraint future-proof as more retailers are added.

**RLS migration file:** `supabase/migrations/016_fragrance_retailer_links_rls.sql`

```sql
alter table fragrance_retailer_links enable row level security;

-- Public: anyone (authed or anon) can read
create policy "public select" on fragrance_retailer_links
  for select using (true);

-- Write: service-role only (ETL, migrations, Studio)
-- No client-side insert/update/delete policy exists — explicit denial by omission
```

**Relation to existing `fragrance_prices`:**
`fragrance_prices` stores headline price tier and top-level estimate per fragrance. `fragrance_retailer_links` is the per-retailer actionable link table. Both coexist. The "Pricing" section uses `fragrance_prices` for tier display; the "Buy from" section reads `fragrance_retailer_links`. Not merged.

### 7.2 Multi-Retailer Config

The `AFFILIATE_CONFIG` object is the single extensibility point. Adding a retailer = adding a key here. No conditionals in application logic.

```typescript
// src/lib/affiliate.ts

const AMAZON_STORE_ID = 'perfumepicks-20';

export const AFFILIATE_CONFIG: Record<string, { tag_param: string; tag_value: string }> = {
  amazon: {
    tag_param: 'tag',
    tag_value: AMAZON_STORE_ID,
  },
  fragrancex: {
    tag_param: 'affid',
    tag_value: 'TBD',           // populate when CJ approval lands
  },
  sephora: {
    tag_param: 'publisherId',
    tag_value: 'TBD',           // populate when Rakuten approval lands
  },
};
```

When a new retailer is approved:
1. Set `tag_value` in `AFFILIATE_CONFIG`.
2. Insert `fragrance_retailer_links` rows with the new `retailer` value.
3. Deploy. Done. No other changes.

### 7.3 Runtime Tag Injection

Tag injection happens in `handleAffiliateClick()` — **never at ETL time, never in the database**.

```
User taps chip
  → handleAffiliateClick({ fragrance_id, retailer, url, price_cents, source_screen })
      → track(EVENTS.AFFILIATE_OUTBOUND_CLICKED, payload)   // PostHog, fire-and-forget
      → appendAffiliateTag(url, retailer)                   // pure function, no side effects
          → looks up AFFILIATE_CONFIG[retailer]
          → uses new URL(url) + searchParams.set(tag_param, tag_value)
          → returns url.toString()
          → if retailer not in AFFILIATE_CONFIG: returns url unchanged (safe default)
      → Linking.openURL(taggedUrl)
          → on reject: Sentry.captureException + showToast("Could not open retailer. Try again.")
```

**`appendAffiliateTag` — pure function contract:**

```typescript
// src/lib/affiliate.ts

export function appendAffiliateTag(url: string, retailer: string): string {
  const config = AFFILIATE_CONFIG[retailer];
  if (!config) return url;            // unknown retailer — return clean URL, never throw

  try {
    const u = new URL(url);
    u.searchParams.set(config.tag_param, config.tag_value);
    return u.toString();
  } catch {
    // malformed URL — return as-is and let Sentry catch it downstream
    return url;
  }
}
```

This function must be pure (no I/O, no side effects) and must be unit-tested. Test cases must include: clean URL, URL with existing query params, URL with fragment, URL already containing the tag param, unknown retailer, malformed URL.

### 7.4 File Map

| File | Change |
|---|---|
| `supabase/migrations/015_fragrance_retailer_links.sql` | New — table + indexes |
| `supabase/migrations/016_fragrance_retailer_links_rls.sql` | New — RLS policies |
| `src/lib/affiliate.ts` | New — `AFFILIATE_CONFIG`, `AMAZON_STORE_ID`, `appendAffiliateTag`, `handleAffiliateClick`, `AffiliateClickParams` |
| `src/lib/observability/events.ts` | Add `AFFILIATE_OUTBOUND_CLICKED = 'affiliate_outbound_clicked'` to enum |
| `app/(tabs)/fragrance/[id].tsx` | Replace placeholder pricing footnote with `BuyFromSection` component |
| `src/hooks/useRetailerLinks.ts` | New — Supabase query hook for `fragrance_retailer_links` by `fragrance_id` |
| `src/components/BuyFromSection.tsx` | New — renders FTC disclosure + chip row; consumes `useRetailerLinks` |

### 7.5 Data Flow Diagram

```
Supabase (fragrance_retailer_links)
  url: "https://amazon.com/dp/B09XYZ"   ← clean, no tag
  retailer: "amazon"
  our_affiliate_tag: "perfumepicks-20"  ← audit only, never read by client
  price_cents: 85.00                    ← numeric(6,2), returned as string by Supabase JS
         │
         ▼
useRetailerLinks(fragranceId)           ← React Query hook, staleTime 5 min, public RLS
         │ parseFloat(price_cents) applied in hook
         ▼
FragranceDetailScreen → BuyFromSection
  ┌─────────────────────────────────┐
  │ Affiliate links support         │   ← FTC disclosure ABOVE chips
  │ Perfume Picks.                  │
  ├─────────────────────────────────┤
  │ Amazon   $85 · 50ml   ›         │   ← chip, text-only retailer name
  └─────────────────────────────────┘
         │
    user taps chip
         ▼
handleAffiliateClick(params)
         │
    appendAffiliateTag("https://amazon.com/dp/B09XYZ", "amazon")
         │   new URL(url) + searchParams.set('tag', 'perfumepicks-20')
         ▼
    "https://amazon.com/dp/B09XYZ?tag=perfumepicks-20"
         │
    Linking.openURL(taggedUrl)          ← Safari View Controller
```

---

## 8. UI Specification

### 8.1 "Buy from" Section — Placement

Replaces the placeholder footnote inside the existing `<Section title="Pricing" cursive="where to buy">` block at `app/(tabs)/fragrance/[id].tsx:217`. The static price card (tier dots + `headlinePrice`) remains above it.

### 8.2 FTC Disclosure — Placement and Style

The FTC disclosure renders **above** the chip row — before the first CTA, not after it.

```
┌──────────────────────────────────────────┐
│ Affiliate links support Perfume Picks.   │  ← 11sp italic COLORS.muted, above chips
├──────────────────────────────────────────┤
│  Amazon   $85 · 50ml  ›                  │  ← chip row
└──────────────────────────────────────────┘
```

Exact text: **"Affiliate links support Perfume Picks."**
Style: `COLORS.muted`, 11sp, italic, left-aligned, 4pt bottom margin before chips.

### 8.3 Chip Anatomy

```
┌─────────────────────────────────────────┐
│  Amazon       $85 · 50ml            ›   │
└─────────────────────────────────────────┘
```

- Background: `COLORS.card` (#FFFFFF or theme card bg)
- Border: `COLORS.border` (#E6DCCB)
- **Radius: 8pt** (deliberately smaller than 16pt card radius to read as a sub-element)
- Left: retailer name text only — `COLORS.text`, 14sp medium. **No retailer logo.** (Logo inclusion creates legal risk re: trademark use + is unreadable at 44pt chip height.)
- Center: price + size if available — `COLORS.muted`, 13sp
- Right: chevron-forward icon — `COLORS.accent`, 14sp
- Height: 44pt (touch target compliance)
- Full-width on single chip; horizontal scroll when multiple
- `accessibilityLabel`: `"Buy from Amazon, $85, 50ml"` (or equivalent per retailer/price)
- `accessibilityRole="link"`

### 8.4 Empty State — No Links

When `fragrance_retailer_links` returns 0 rows for the fragrance:
- The "Buy from" section does **not** render.
- The section divider is also hidden — no empty card zone left behind.
- The existing price card footnote is replaced with nothing at this stage (future: "Check retailers for pricing" static string — out of scope for this PRD).

### 8.5 Loading State

While `useRetailerLinks` is pending:
- **Do not show shimmer immediately.** Delay shimmer onset by 150ms to avoid flicker on fast connections.
- After 150ms: render a single shimmer placeholder chip (same height as a real chip, muted background, no interaction).
- Show exactly 1 shimmer — do not guess how many links will exist.

Implementation:
```typescript
const [showShimmer, setShowShimmer] = React.useState(false);
React.useEffect(() => {
  if (!isLoading) return;
  const t = setTimeout(() => setShowShimmer(true), 150);
  return () => clearTimeout(t);
}, [isLoading]);
```

### 8.6 Error State

If the query fails (network error, RLS rejection): the "Buy from" section does not appear. Silent failure — no error message to the user. Error logged to Sentry. Price tier card continues to show normally.

### 8.7 Multi-Retailer Chip Behavior (when 3+ retailers exist)

When chips for Amazon, FragranceX, and Sephora all exist simultaneously:
- All chips appear in a single horizontally scrollable row.
- Order: alphabetical by `retailer` value (consistent with the DB query `ORDER BY retailer`).
- The FTC disclosure renders once above the row regardless of chip count.
- No "Best price" badge or highlighting — Operating Agreement and FTC risk.
- Each chip has its own `accessibilityLabel` identifying the retailer and price.

---

## 9. Supabase Query Hook

```typescript
// src/hooks/useRetailerLinks.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export interface RetailerLink {
  id: string;
  retailer: string;
  url: string;
  price_cents: number | null;   // NOTE: parseFloat() applied inside queryFn
  size_ml: number | null;
  in_stock: boolean;
}

export function useRetailerLinks(fragranceId: string) {
  return useQuery({
    queryKey: ['retailer-links', fragranceId],
    queryFn: async (): Promise<RetailerLink[]> => {
      const { data, error } = await supabase
        .from('fragrance_retailer_links')
        .select('id, retailer, url, price_cents, size_ml, in_stock')
        .eq('fragrance_id', fragranceId)
        .eq('in_stock', true)
        .order('retailer');
      if (error) throw error;
      return (data ?? []).map((row) => ({
        ...row,
        // Supabase JS returns numeric columns as strings — coerce here, not at render
        price_cents: row.price_cents != null ? parseFloat(row.price_cents as unknown as string) : null,
        size_ml: row.size_ml != null ? parseFloat(row.size_ml as unknown as string) : null,
      }));
    },
    staleTime: 1000 * 60 * 5, // 5 min — price data stays reasonably fresh
  });
}
```

---

## 10. PostHog Event Spec

**Event name:** `affiliate_outbound_clicked`
**Fired:** on chip tap, before navigation

```typescript
interface AffiliateOutboundClickedProps {
  fragrance_id: string;      // uuid
  retailer: string;          // 'amazon', 'fragrancex', 'sephora', etc.
  price_cents: number | null;
  source_screen: string;     // 'fragrance_detail'
  size_ml: number | null;    // for cost-per-wear analysis
}
```

**No PII in this event.** `fragrance_id` is an internal uuid — not linked to user identity in the event payload.

---

## 11. FTC & Legal Requirements

| Requirement | Implementation |
|---|---|
| Disclosure must be "clear and conspicuous" | Rendered inline in the "Buy from" section, not in a modal or footer |
| Disclosure must appear before the first CTA | FTC string is positioned **above** the chip row (§8.2) |
| Amazon Operating Agreement: no product images | No Amazon product images pulled from affiliate feed into catalog |
| Amazon Operating Agreement: no price guarantees | Chip shows "$85 · 50ml" — never "Lowest price" or "Best price" |
| Amazon Operating Agreement: price freshness | `last_seen_at` column on `fragrance_retailer_links`. If `last_seen_at` > 7 days, show chip with no price (retailer name only). ETL updates `last_seen_at` on each run. Implementation of the stale-price suppression deferred to ETL phase. |
| Retailer logo trademark risk | No retailer logos displayed. Text-only retailer name in chips. |

---

## 12. Seed Data for Development / Testing

Seed rows use a subquery by fragrance name — no placeholder UUIDs that will break when IDs differ between environments.

```sql
-- supabase/migrations/017_seed_retailer_links_dev.sql
-- Development/testing only. Not for production until real ASINs confirmed.

insert into fragrance_retailer_links (fragrance_id, retailer, url, our_affiliate_tag, price_cents, size_ml)
select
  f.id,
  'amazon',
  'https://www.amazon.com/dp/B0EXAMPLE1',
  'perfumepicks-20',
  85.00,
  50
from fragrances f
where f.name = 'Black Orchid'
  and f.brand_id = (select id from brands where name = 'Tom Ford')
limit 1;

insert into fragrance_retailer_links (fragrance_id, retailer, url, our_affiliate_tag, price_cents, size_ml)
select
  f.id,
  'amazon',
  'https://www.amazon.com/dp/B0EXAMPLE2',
  'perfumepicks-20',
  120.00,
  100
from fragrances f
where f.name = 'Oud Wood'
  and f.brand_id = (select id from brands where name = 'Tom Ford')
limit 1;
```

Real Amazon product URLs (with no affiliate tag) to be substituted during content population once PA API is active or SiteStripe URLs are collected.

---

## 13. ETL Architecture (Post-Creators API Unlock)

This section covers Phase 1 automated catalog ingestion. Phase 0 (manual SiteStripe) requires no ETL.

### 13.1 Pipeline Script

`scripts/etl/run-catalog-ingest.ts` — orchestrates in order:

1. **Creators API pull** (OAuth 2.0, Credential ID + Secret) → Luxury Beauty category search → `staging_affiliate` table (ASIN, name, brand, price, image URL, product URL)
2. **Sephora PDP scrape** (per matched ASIN/name) → `staging_sephora` (notes pyramid, description, fragrance family hints)
3. **Accord classifier** → derive `fragrance_family` from notes using `scripts/data/accord-classifier.json`
4. **Niche-house merge** → pull from `frag-*-raw.json` files for fragrances not matched in steps 1-2
5. **Brand alias normalization** → `Gianni Versace` → `Versace`, etc.
6. **Upsert** → final rows into `fragrances` + `brands` + `fragrance_retailer_links`
7. **Image mirror** → PA API image URLs → Supabase Storage CDN

### 13.2 ETL Guard

```typescript
if (!staging.name || !staging.brand || !staging.imageUrl) {
  log.warn(`Skipping ${staging.asin} — insufficient data`);
  continue;
}
```

Never ship a fragrance row with null name, null brand, or null image.

### 13.3 `fragrance_retailer_links` Population in ETL

ETL inserts/upserts with clean URLs (no tag). The `our_affiliate_tag` column is set from `AMAZON_STORE_ID` for audit. `last_seen_at` is updated on every ETL run for any matched row.

---

## 14. Task Breakdown (M2 Phase D)

| # | Task | Effort | Risk |
|---|---|---|---|
| T1 | Migration `015_fragrance_retailer_links.sql`: table + indexes | S | low |
| T2 | Migration `016_fragrance_retailer_links_rls.sql`: RLS policies | S | low |
| T3 | `src/lib/observability/events.ts` — add `AFFILIATE_OUTBOUND_CLICKED` | S | low |
| T4 | `src/lib/affiliate.ts` — `AFFILIATE_CONFIG`, `AMAZON_STORE_ID`, `appendAffiliateTag` pure function + unit tests (6 test cases: clean URL, existing params, fragment, tag already present, unknown retailer, malformed URL) | S | low |
| T5 | `src/lib/affiliate.ts` — `handleAffiliateClick` orchestrator | S | low |
| T6 | `src/hooks/useRetailerLinks.ts` — Supabase query hook with `parseFloat` coercion | S | low |
| T7 | `src/components/BuyFromSection.tsx` — FTC disclosure above chips, chip row, accessibility labels, 150ms shimmer delay | M | low |
| T8 | `app/(tabs)/fragrance/[id].tsx` — mount `BuyFromSection`, remove footnote placeholder | S | low |
| T9 | Migration `017_seed_retailer_links_dev.sql` — seed rows via subquery by name | S | low |
| T10 | Manual QA: tap chip on device, verify URL in browser has correct tag, verify PostHog event fires, verify disclosure position, verify empty state hides divider | S | low |

**Total estimated effort:** ~5–7 hours engineering.

**Deploy dependency:** None — `fragrance_retailer_links` starts empty in prod; section renders nothing until rows are inserted. Safe to merge to main and deploy before any link data exists.

---

## 15. Out of Scope / Future Work

- CJ (FragranceX) and Rakuten (Sephora, FragranceNet) — requires only setting `tag_value` in `AFFILIATE_CONFIG` and inserting DB rows once approvals land.
- Price freshness staleness UI (suppress price if `last_seen_at` > 7 days) — deferred to ETL phase.
- "Best price" cross-retailer comparison — never (FTC risk + Operating Agreement violation).
- Amazon product images in catalog — never (Operating Agreement violation).
- Web marketing site affiliate links — separate work item under the web SEO track.
- Server-side redirect proxy — unnecessary. Runtime injection is clean, auditable, and compliant.
- Accord classifier JSON build-out (`scripts/data/accord-classifier.json`) — Content Population workstream.
- Sephora PDP scraper script — Content Population workstream, post-Creators API unlock.
