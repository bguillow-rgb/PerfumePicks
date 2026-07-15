# redeem-promo — influencer promo codes ("enter code XYZ, get N months free")

Grants the calling user **N months of free Pro** for a valid code. All validation
and the entitlement grant happen here with the **service role** — the only writer
allowed past the `prevent_client_pro_writes` trigger on `profiles`.

## How it fits together

| Layer | File | Role |
|---|---|---|
| Tables | `migrations/202607141200_promo_codes.sql` | `promo_codes` (campaigns) + `promo_redemptions` (idempotency/audit), both RLS-locked to service role |
| Grant | `functions/redeem-promo/index.ts` | verify JWT → validate code → set `profiles.is_pro=true, pro_expires_at=now()+N months` |
| Client call | `src/lib/promo.ts` → `redeemPromoCode()` | invokes the function, maps errors, flips `useProStore.serverPro` on success |
| UI | `src/components/pro/PromoCodeSheet.tsx` | shared sheet, opened from the paywall ("Have a promo code?") and Profile › Account |
| Unlock | `useProStore` (union `rcPro \|\| serverPro`) + `useAppSync` `hydrateProStatus()` → `my_pro_status()` | makes the server flag actually light up the UI |

The whole client side is **JS-only → OTA-friendly**. No native module, so it ships
to any compatible build via `eas update`. The SQL + Edge Function deploy
independently and benefit every build at once (older builds simply lack the UI to
trigger it).

## Product rules (as built)

- **Many per-influencer codes**, added over time (see below). Each is a *broadcast*
  code: one code, many redemptions, optionally capped by `max_redemptions` and/or
  `expires_at`.
- **Sign-in required** — guests (anonymous sessions) are rejected (`sign_in_required`),
  so a code always attaches to a real, recoverable account. Enforced both in the
  Edge Function (`user.is_anonymous`) and client-side before the round-trip.
- A user may redeem a **given code once** (`promo_redemptions` PK).
- **Rejected if the user already has active Pro** (`already_pro`).
- Grant duration is per-code (`duration_months`, default **3**).

## Deploy (one time)

1. **Run the migration** in the Supabase SQL editor (project `jdkwlwyysgofljkobpmr`):
   paste `supabase/migrations/202607141200_promo_codes.sql`.
2. **Deploy the function** (it uses the same `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`
   secrets the other functions already have):
   ```
   supabase functions deploy redeem-promo
   ```
   `verify_jwt` can stay at its default — the function verifies the JWT itself and
   also serves anonymous guests (who carry a valid session token).
3. **OTA the app**: `eas update --branch <channel>` for each build train you want to
   reach.

## Add a code when an influencer goes live

Run in the SQL editor. **Always uppercase the code** — the function normalizes
user input to upper + trimmed + no internal spaces before lookup.

```sql
-- Capped campaign with an end date:
insert into promo_codes (code, label, duration_months, max_redemptions, expires_at)
values ('SCENTQUEEN', 'IG @scentqueen · Jul 2026', 3, 500, '2026-09-01T00:00:00Z');

-- Unlimited, no expiry:
insert into promo_codes (code, label) values ('LAUNCH3', 'Generic launch code');

-- Kill switch (stops redemptions without deleting history):
update promo_codes set active = false where code = 'SCENTQUEEN';

-- Check how a campaign is doing:
select code, label, duration_months, redeemed_count, max_redemptions, active, expires_at
from promo_codes order by created_at desc;
```

## Error codes returned to the client

`invalid_code` · `expired` · `code_exhausted` · `already_redeemed` · `already_pro`
· `sign_in_required` · `empty_code` · `server_error`. `src/lib/promo.ts` maps each
to user-facing copy.

## Notes / edge cases

- **Guests are blocked**: the sheet shows a "Sign in to redeem" state for anonymous
  users, the client short-circuits, and the Edge Function rejects `is_anonymous`
  tokens — so a grant always lands on a real account (no orphaned anon profiles).
- **RC webhook interaction**: `revenuecat-webhook` now refuses to downgrade
  `is_pro` while `pro_expires_at` is still in the future, so a late/duplicate RC
  `EXPIRATION` can't cut a promo grant short.
- **Server is the real gate**: `is_pro_user()` honors `pro_expires_at`, so a promo
  auto-expires with zero extra logic. The client `useProStore` is advisory UX only.
