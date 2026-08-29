/**
 * Checkout 2.0 attribution monitor (FEATURE_CHECKOUT_2.md "attribution watch").
 *
 * The one open question after the 2026-07-22 flag flip: does a purchase through
 * the cart-permalink flow (which can route via Shop Pay / shop.app) still post
 * a CJ commission? This watches both sides:
 *   - CJ Commission Detail API (GraphQL, CJ_PERSONAL_ACCESS_TOKEN)
 *   - the app's durable click ledger (affiliate_clicks, landing='checkout')
 *
 * iMessages the founder ONCE per state change (state file dedupes):
 *   ✅ SUCCESS  — a Perfumania commission posted (P574076 or any later order):
 *                 attribution survives the streamlined flow.
 *   ⚠️ CANARY   — the known test purchase P574076 still absent 48h+ after
 *                 2026-07-22: the shop.app path may be eating attribution.
 *   🚨 LEAK     — checkout-landing clicks are accumulating (≥5) with zero
 *                 Perfumania commissions 5+ days after the flip: recommend
 *                 rolling back the flag / switching ETL to plain /cart.
 *
 * Run manually:  node scripts/monitor-checkout-attribution.mjs
 * Scheduled:     ~/Library/LaunchAgents/com.perfumepicks.cj-attribution.plist
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PHONE = '+17165109313';
const FLIP_DATE = new Date('2026-07-22T13:00:00Z'); // flag went live
const TEST_ORDER = 'P574076';
const STATE_FILE = path.join(os.homedir(), 'Library/Logs/perfume-checkout2-attribution.state.json');

const CJ_TOKEN = process.env.CJ_PERSONAL_ACCESS_TOKEN;
const SB_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!CJ_TOKEN || !SB_URL || !SB_KEY) {
  console.error('missing CJ_PERSONAL_ACCESS_TOKEN / SUPABASE env');
  process.exit(1);
}

const state = (() => {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
})();
const saveState = () => fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

function imessage(text) {
  try {
    execFileSync('osascript', ['-'], {
      input: `on run\ntell application "Messages"\nset s to 1st service whose service type = iMessage\nsend ${JSON.stringify(text)} to buddy ${JSON.stringify(PHONE)} of s\nend tell\nend run`,
    });
  } catch (e) {
    console.error('[imessage] send failed:', e.message);
  }
}

async function cjCommissions() {
  const since = new Date(Date.now() - 21 * 864e5).toISOString();
  const q = `{ publisherCommissions(forPublishers: ["7966973"], sincePostingDate:"${since}", beforePostingDate:"${new Date(Date.now() + 864e5).toISOString()}") {
    count records { orderId postingDate advertiserName pubCommissionAmountUsd saleAmountUsd shopperId } } }`;
  const r = await fetch('https://commissions.api.cj.com/query', {
    method: 'POST',
    headers: { Authorization: `Bearer ${CJ_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  });
  const j = await r.json();
  return j.data?.publisherCommissions?.records ?? [];
}

async function clicksByLanding(landing) {
  const r = await fetch(
    `${SB_URL}/rest/v1/affiliate_clicks?select=click_id,created_at,retailer,price_cents&landing=eq.${landing}&created_at=gte.${FLIP_DATE.toISOString()}`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } },
  );
  const rows = await r.json();
  return Array.isArray(rows) ? rows : [];
}

const commissions = await cjCommissions();
const perfumania = commissions.filter((c) => /perfumania/i.test(c.advertiserName || ''));
const testOrder = commissions.find((c) => String(c.orderId).includes(TEST_ORDER));
const clicks = await clicksByLanding('checkout');
const controlClicks = await clicksByLanding('product'); // the rollback target
const daysSinceFlip = (Date.now() - FLIP_DATE.getTime()) / 864e5;

console.log(`[checkout2-monitor] ${new Date().toISOString()}`);
console.log(`  perfumania commissions (21d): ${perfumania.length} | test order ${TEST_ORDER}: ${testOrder ? 'POSTED' : 'not yet'}`);
console.log(`  checkout-landing clicks since flip: ${clicks.length} | control (product) clicks: ${controlClicks.length} | days since flip: ${daysSinceFlip.toFixed(1)}`);

// ✅ SUCCESS — any perfumania commission proves the wrapper pays.
if (perfumania.length > 0 && !state.successAlerted) {
  const c = testOrder ?? perfumania[0];
  imessage(
    `✅ Checkout 2.0 attribution CONFIRMED. Perfumania commission posted: order ${c.orderId}, sale $${c.saleAmountUsd}, commission $${c.pubCommissionAmountUsd}. The cart-permalink flow pays. Leave the flag on.`,
  );
  state.successAlerted = true;
  saveState();
}

// ⚠️ CANARY — the known $4.99 test buy hasn't posted after 48h.
if (!testOrder && daysSinceFlip >= 2 && !state.canaryAlerted && !state.successAlerted) {
  imessage(
    `⚠️ Checkout 2.0 canary: test order ${TEST_ORDER} ($4.99 Cuba Red, bought 7/22 through the cart link) still has no CJ commission after 48h. Not proof of a leak yet (CJ can lag), but watch it. Monitor keeps checking every 6h.`,
  );
  state.canaryAlerted = true;
  saveState();
}

// 🚨 LEAK — checkout-specific failure.
//
// GUARD (added 2026-08-28 after a false positive): a leak claim requires the
// CONTROL path to be paying. On 8/28 this fired on 5 checkout clicks with zero
// commissions and recommended rolling back to the product landing — but the
// product landing had the SAME zero record, and the real bug was a FragranceShop
// ad id that was never valid. Rolling back would have changed a variable with no
// mechanism behind it. Zero-vs-zero is not evidence; it is a missing baseline.
//
// Sample-size note: at a 1-3% affiliate conversion rate, 5 clicks are expected to
// yield ~0.1 sales, so zero is the MODAL outcome even with perfect tracking. The
// bar is now 25 clicks AND a converting control.
// The control is measured via SubID: every click now stamps its ledger
// click_id into CJ's sid, returned on the commission as `shopperId`. So a
// commission can be attributed to the landing that produced it. A leak is
// "product-landing clicks ARE paying while checkout-landing clicks are not" —
// which requires at least one control commission to exist at all.
const paidClickIds = new Set(
  commissions.map((c) => String(c.shopperId || '').trim()).filter(Boolean),
);
const controlPays = controlClicks.some((c) =>
  paidClickIds.has(String(c.click_id).replace(/-/g, '')),
);
const checkoutPays = clicks.some((c) =>
  paidClickIds.has(String(c.click_id).replace(/-/g, '')),
);
if (!checkoutPays && controlPays && clicks.length >= 25 && daysSinceFlip >= 5 && !state.leakAlerted) {
  imessage(
    `🚨 Checkout 2.0 likely attribution LEAK: ${clicks.length} checkout-landing buy taps since the flip, zero Perfumania commissions in CJ after ${Math.floor(daysSinceFlip)} days. Recommend: flip checkout_2_enabled back to 'false' and switch the ETL to the plain /cart landing (PRD §11).`,
  );
  state.leakAlerted = true;
  saveState();
}
