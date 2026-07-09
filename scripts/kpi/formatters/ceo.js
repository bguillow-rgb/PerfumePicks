// ceo.js — CEO-shaped dashboard for Perfume Picks. Founder-facing format.
//
// Structure:
//   1. Status banner (PRE-LAUNCH: App in review)
//   2. Executive summary
//   3. Scorecard
//   4. Growth (signups, activity)
//   5. Acquisition channels
//   6. Funnel waterfall
//   7. Fragrance DNA funnel
//   8. Monetization & unit economics
//   9. App Store (reviews, status, installs)
//  10. Stability & quality
//  11. Engagement pulse
//  12. Catalog health
//  13. Moderation queues
//  14. Recent signups
//  15. Gaps & data integrity legend

'use strict';

const { APP_STORE_STATUS, ASC_APP_ID, LAUNCH_DATE } = require('../schema');
const adSpendRender = require('./dr-ad-spend-render');

function n(x, fallback = '—') {
  return x == null ? fallback : x;
}

function fmtUSD(v) {
  if (v == null || Number.isNaN(v)) return '—';
  return `$${v.toFixed(2)}`;
}

function fmtPct(v) {
  if (v == null || Number.isNaN(v)) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

function ago(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const diffH = (Date.now() - d.getTime()) / (1000 * 60 * 60);
  if (diffH < 1) return `${Math.round(diffH * 60)}m ago`;
  if (diffH < 24) return `${Math.round(diffH)}h ago`;
  return `${Math.round(diffH / 24)}d ago`;
}

function deltaPct(today, yest) {
  if (yest == null || yest === 0) return today > 0 ? '+∞' : '—';
  const d = (today - yest) / yest;
  const sign = d >= 0 ? '+' : '';
  return `${sign}${Math.round(d * 100)}%`;
}

function render({ supa, posthog, activeUsers, rc, sentry, asc, adSpend, cj, healthAlerts = [], sources, now = new Date() }) {
  const lines = [];
  const { PRE_LAUNCH } = require('../schema');

  const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getUTCDay()];
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toISOString().slice(11, 16) + ' UTC';

  lines.push(`# 🌸 Perfume Picks — CEO Dashboard`);
  lines.push(`**${dayName}, ${dateStr} · ${timeStr}**`);
  lines.push('');

  // ── PRE-LAUNCH: show holding screen only, no data ─────────────────
  if (PRE_LAUNCH) {
    lines.push('## 🔴 PRE-LAUNCH — WAITING FOR REVIEW');
    lines.push('');
    lines.push('```');
    lines.push(`  APP STORE STATUS : ${APP_STORE_STATUS}`);
    lines.push(`  APP ID           : ${ASC_APP_ID}`);
    lines.push(`  LAUNCH DATE      : Not set — awaiting Apple approval`);
    lines.push('```');
    lines.push('');
    lines.push('> No launch-day data to report yet.');
    lines.push('> Once Apple approves the app, update LAUNCH_DATE + PRE_LAUNCH in schema.js');
    lines.push('> and the full dashboard will start tracking from that moment.');
    lines.push('');
    lines.push('## 🚧 PRE-LAUNCH READINESS');
    lines.push('');
    lines.push('| Item | Status |');
    lines.push('|---|---|');
    lines.push(`| App Store submission | ✅ Submitted — ${APP_STORE_STATUS} |`);
    lines.push(`| Catalog size | ${supa?.catalogSize ? `✅ ${supa.catalogSize.active.toLocaleString()} active fragrances` : '— (DB query failed)'} |`);
    lines.push(`| Moderation queues | ${supa?.submissions?.pending === 0 && supa?.contentReports?.open === 0 ? '✅ Clear' : `⚠ ${supa?.submissions?.pending ?? '?'} submissions · ${supa?.contentReports?.open ?? '?'} reports`} |`);
    lines.push(`| PostHog analytics | ${posthog?.configured ? '✅ Configured' : '⚠ Not configured (add POSTHOG_PERSONAL_API_KEY + POSTHOG_PROJECT_ID)'} |`);
    lines.push(`| RevenueCat | ${rc?.configured ? '✅ Configured' : '⚠ Not configured (add REVENUECAT_PROJECT_ID + REVENUECAT_SECRET_KEY)'} |`);
    lines.push(`| Sentry | ${sentry?.configured ? '✅ Configured' : '⚠ Not configured (add SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT_ID)'} |`);
    lines.push(`| Apple Search Ads | ⚠ Not started — create campaigns after approval |`);
    lines.push('');
    lines.push('_No user data will appear in this dashboard until launch day._');
    lines.push('');
    lines.push(`_Sources: ${(sources || []).join(', ')}_`);
    return lines.join('\n');
  }

  // ── (PRE_LAUNCH = false beyond this point) ────────────────────────

  // ── 1. HEALTH ALERTS ─────────────────────────────────────────────
  if (healthAlerts.length > 0) {
    lines.push('## 🚨 HEALTH ALERTS');
    lines.push('');
    for (const alert of healthAlerts) {
      const icon = alert.level === 'error' ? '🔴' : '🟡';
      lines.push(`${icon} **${alert.code}** — ${alert.message}`);
    }
    lines.push('');
  }

  // ── 2. EXECUTIVE SUMMARY ──────────────────────────────────────────
  lines.push('## ╔═ EXECUTIVE SUMMARY ════════════════════════════════════════╗');
  lines.push('');

  const signupsToday = supa?.signups?.today ?? 0;
  const signupsYest = supa?.signups?.yesterday ?? 0;
  const signupsSinceLaunch = supa?.signups?.sinceLaunch ?? 0;
  const crashes24h = sentry?.uniqueIssues24h ?? null;
  // Honest active users (signed-in humans + guest visits). NO person_id
  // fallback — if this errors we say "unavailable" rather than print a number
  // known to be ~2-3x inflated.
  const au = activeUsers && !activeUsers.error ? activeUsers : null;
  const auToday = au ? au.today.total : '—';
  const auYest = au ? au.yesterday.total : '—';
  const auTodayNote = au ? ` (${au.today.signedIn} signed-in + ${au.today.guestVisits} guest)` : ' (unavailable)';
  const auYestNote = au ? ` (${au.yesterday.signedIn} signed-in + ${au.yesterday.guestVisits} guest)` : ' (unavailable)';

  lines.push(`> **Yesterday:** ${auYest} active users${auYestNote} · ${signupsYest} new profiles · ${crashes24h === 0 ? '0 crashes ✓' : crashes24h != null ? crashes24h + ' crashes ⚠' : 'Sentry not configured'}`);
  lines.push(`> **Today (in progress):** ${auToday} active users${auTodayNote} · ${signupsToday} new profiles`);
  lines.push('>');
  lines.push(`> **Since launch (${LAUNCH_DATE}):** ${signupsSinceLaunch} new profiles`);
  lines.push('>');

  // One-thing headline
  let oneThing = 'Live on the App Store — focus on installs, activation, and first reviews.';
  if (crashes24h != null && crashes24h > 5) {
    oneThing = `⚠ ${crashes24h} Sentry crashes in 24h — fix before it tanks early reviews.`;
  } else if (signupsSinceLaunch === 0) {
    oneThing = 'No post-launch profiles yet — watch ASC installs and acquisition channels.';
  }
  lines.push(`> **One thing:** ${oneThing}`);
  lines.push('');

  // ── 3. SCORECARD ──────────────────────────────────────────────────
  lines.push('## 🎯 SCORECARD');
  lines.push('');
  lines.push('| Metric | Today | Yesterday | Δ% | Since Launch |');
  lines.push('|---|---|---|---|---|');
  lines.push(`| Active users | **${auToday}**${auTodayNote} | ${auYest}${auYestNote} | ${au ? deltaPct(auToday, auYest) : '—'} | — |`);
  lines.push(`| New profiles | **${signupsToday}** | ${signupsYest} | ${deltaPct(signupsToday, signupsYest)} | **${signupsSinceLaunch}** |`);
  if (supa?.wardrobe) {
    lines.push(`| Collection adds (have) | ${supa.wardrobe.today.have} | — | — | ${supa.wardrobe.sinceLaunch.have} |`);
    lines.push(`| Wishlist adds (want) | ${supa.wardrobe.today.want} | — | — | ${supa.wardrobe.sinceLaunch.want} |`);
  }
  if (supa?.wearLogs) {
    lines.push(`| Wear logs (journal) | ${supa.wearLogs.today} | ${supa.wearLogs.yesterday} | ${deltaPct(supa.wearLogs.today, supa.wearLogs.yesterday)} | ${supa.wearLogs.sinceLaunch} |`);
  }
  // Buy-link taps: prefer the durable Supabase ledger (source of truth since
  // 2026-07-04); fall back to PostHog only if the ledger has no data yet.
  if (supa?.affiliateClicks && !supa.affiliateClicks.error && supa.affiliateClicks.sinceLaunch > 0) {
    const a = supa.affiliateClicks;
    const split = (a.byRetailer || []).map((r) => `${r.retailer} ${r.clicks}`).join(' · ');
    lines.push(`| Buy-link taps (ledger) | ${a.today} | — | — | **${a.sinceLaunch}** |`);
    if (split) lines.push(`| ↳ by retailer | ${split} | | | ${a.people} ppl |`);
  } else if (posthog?.affiliate) {
    const a = posthog.affiliate;
    lines.push(`| Buy-link taps | ${a.today} | ${a.yesterday} | ${deltaPct(a.today, a.yesterday)} | **${a.sinceLaunch}** |`);
  }
  if (supa?.proMirror) {
    lines.push(`| Pro subscribers | — | — | — | **${supa.proMirror.total}** |`);
  }
  if (crashes24h != null) {
    lines.push(`| Sentry crashes (24h) | ${crashes24h} | — | — | — |`);
  }
  lines.push('');

  // ── 4. GROWTH ─────────────────────────────────────────────────────
  lines.push('## 📈 GROWTH');
  lines.push('');
  if (asc?.lifetimeInstalls != null) {
    lines.push(`- **Lifetime installs (ASC, source of truth):** ${asc.lifetimeInstalls}`);
  }
  if (au?.windows) {
    const w = au.windows;
    lines.push(`- **WAU (7d):** ${w.wauSignedIn} signed-in + ${w.guestVisits7d} guest visits`);
    lines.push(`- **MAU (28d):** ${w.mauSignedIn} signed-in + ${w.guestVisits28d} guest visits`);
  } else if (activeUsers?.error) {
    lines.push(`- **WAU/MAU:** unavailable (${activeUsers.error.slice(0, 60)})`);
  }
  if (supa?.signups) {
    const s = supa.signups;
    lines.push(`- **New profiles:** today ${s.today} · yest ${s.yesterday} · 7d ${s.last7d ?? '—'} · 28d ${s.last28d ?? '—'} · since launch ${s.sinceLaunch}`);
  }
  lines.push('');

  // ── 5. ACQUISITION CHANNELS ───────────────────────────────────────
  lines.push('## 📡 ACQUISITION CHANNELS');
  lines.push('');
  lines.push('| Source | Status | Notes |');
  lines.push('|---|---|---|');
  if (asc?.lifetimeInstalls != null) {
    lines.push(`| App Store | ${asc.lifetimeInstalls} total installs | ASC source of truth; 24-48h lag |`);
  }
  if (adSpend?.ok) {
    const t = adSpend.totals || {};
    const cpaStr = t.cpa != null ? `$${t.cpa.toFixed(2)} CPA` : '— CPA';
    lines.push(`| Apple Search Ads | $${(t.spend || 0).toFixed(2)} spend · ${t.installs || 0} installs | ${cpaStr} (${adSpend.dateRange || 'window'}) — see DR AD SPEND below |`);
  } else {
    lines.push(`| Apple Search Ads | manual check | searchads.apple.com — ${adSpend?.reason || 'live pull unavailable'} |`);
  }
  lines.push('');

  const aq = asc?.acquisitionSources;
  if (aq?.sources?.length > 0) {
    const noteStr = aq.note ? ` _(${aq.note})_` : '';
    lines.push(`**Installs by source (App Store Analytics)**${noteStr}`);
    lines.push('');
    lines.push('| Source | Installs |');
    lines.push('|---|---|');
    for (const s of aq.sources) {
      lines.push(`| ${s.source} | **${s.installs}** |`);
    }
    lines.push('');
  } else if (aq?.pending) {
    lines.push(`> _ASC acquisition sources: ${aq.note || 'report pending Apple preparation.'}_`);
    lines.push('');
  }

  // ── 5b. DR AD SPEND read on Apple Search Ads ──────────────────────
  for (const l of adSpendRender.markdownLines(adSpend)) lines.push(l);

  // ── 6. FUNNEL WATERFALL ───────────────────────────────────────────
  if (posthog?.configured && !posthog?.error) {
    lines.push('## 🪜 FUNNEL (since launch)');
    lines.push('');
    lines.push('```');
    // Activation path is now the Fragrance DNA flow (the quiz is retired).
    // Profiles → DNA picker committed → collection → wear → paywall → pro.
    const sl = supa?.signups?.sinceLaunch ?? 0;
    const dp = supa?.dnaPickerEvents?.committedUsers ?? 0;
    const wa = posthog.wardrobe?.added?.users ?? 0;
    const wl = supa?.wearLogs?.sinceLaunch ?? 0;
    const pv = posthog.monetization?.viewed?.users ?? 0;
    const pp = posthog.monetization?.completed?.users ?? 0;

    const bar = (v, total) => {
      if (!total) return '';
      const pct = v / total;
      const filled = Math.round(pct * 40);
      return '━'.repeat(Math.max(0, filled));
    };

    lines.push(`Profiles (since launch): ${sl.toString().padStart(4)}  ${bar(sl, sl)} 100%`);
    lines.push(`DNA picker committed: ${dp.toString().padStart(4)}  ${bar(dp, sl)} ${sl ? ((dp/sl)*100).toFixed(0) : 0}%`);
    lines.push(`Collection add      : ${wa.toString().padStart(4)}  ${bar(wa, sl)} ${sl ? ((wa/sl)*100).toFixed(0) : 0}%`);
    lines.push(`Wear logged (SOTD)  : ${wl.toString().padStart(4)}  ${bar(wl, sl)} ${sl ? ((wl/sl)*100).toFixed(0) : 0}%`);
    lines.push(`Paywall viewed      : ${pv.toString().padStart(4)}  ${bar(pv, sl)} ${sl ? ((pv/sl)*100).toFixed(0) : 0}%`);
    lines.push(`Pro purchased       : ${pp.toString().padStart(4)}  ${bar(pp, sl)} ${sl ? ((pp/sl)*100).toFixed(0) : 0}%`);
    lines.push('```');
    lines.push('');

    lines.push(`- **DNA activation:** ${dp} of ${sl} new profiles committed a DNA picker session (**${sl ? ((dp/sl)*100).toFixed(0) : 0}%**). See the DNA funnel below for reveal → rec → CTA detail.`);
    if (posthog.wardrobe) {
      const wFunnel = posthog.wardrobe;
      lines.push(`- **Collection:** ${wFunnel.added.users} users added fragrances · ${wFunnel.removed.events} removed`);
    }
    if (posthog.monetization) {
      const m = posthog.monetization;
      lines.push(`- **Paywall:** ${m.viewed.users} viewed → ${m.completed.users} paid (**${fmtPct(m.startToCompletePct)}** start → pay)`);
    }
    lines.push('');
  }

  // ── 7. FRAGRANCE DNA FUNNEL ───────────────────────────────────────
  if (posthog?.dna) {
    const d = posthog.dna;
    lines.push('## 🧬 FRAGRANCE DNA FUNNEL (all-time)');
    lines.push('');
    lines.push('```');
    lines.push(`DNA reveal viewed  : ${d.revealed.users.toString().padStart(4)}`);
    lines.push(`  DNA shared       : ${d.shared.users.toString().padStart(4)}  (share rate: ${d.revealed.users > 0 ? ((d.shared.users/d.revealed.users)*100).toFixed(0) : 0}%)`);
    lines.push(`  First rec viewed : ${d.firstRec.users.toString().padStart(4)}`);
    lines.push(`  First rec reroll : ${d.rerolled.events.toString().padStart(4)}`);
    lines.push(`  Skip to app      : ${d.skippedToApp.events.toString().padStart(4)}`);
    lines.push(`  CTA tapped       : ${d.ctaTapped.events.toString().padStart(4)}`);
    if (d.failed.events > 0) {
      lines.push(`  Compute failed   : ${d.failed.events.toString().padStart(4)}  ⚠`);
    }
    lines.push('```');
    lines.push('');
    lines.push(`- **Share rate:** ${fmtPct(d.shareRate)}`);
    if (d.failed.events > 0) {
      lines.push(`- ⚠ **DNA compute failures:** ${d.failed.events} — investigate root cause`);
    }
    lines.push('');
  }

  // ── 8. MONETIZATION ───────────────────────────────────────────────
  lines.push('## 💰 MONETIZATION');
  lines.push('');
  lines.push('| Metric | Value | Note |');
  lines.push('|---|---|---|');
  if (rc?.configured && !rc.error) {
    lines.push(`| Active subscriptions | **${n(rc.activeSubscriptions)}** | RC (incl sandbox) |`);
    lines.push(`| Active trials | ${n(rc.activeTrials)} | |`);
    lines.push(`| MRR | **${fmtUSD(rc.mrr)}** | incl sandbox |`);
    lines.push(`| Revenue (28d gross) | ${fmtUSD(rc.revenue28d)} | incl sandbox |`);
  } else {
    lines.push(`| RevenueCat | not configured | Add REVENUECAT_PROJECT_ID + REVENUECAT_SECRET_KEY to .env.local |`);
  }
  if (supa?.proMirror) {
    lines.push(`| Pro subscribers (DB) | **${supa.proMirror.total}** | profiles.is_pro=true (RC webhook) |`);
  }
  if (asc?.lifetimeProceeds != null) {
    lines.push(`| Lifetime Apple proceeds | **${fmtUSD(asc.lifetimeProceeds)}** | production-only ground truth |`);
  }
  // Affiliate revenue (CJ) — this app only, isolated by CJ website id. Clicks
  // come from PostHog (buy-link taps above); CJ is the money side.
  if (cj?.configured && !cj.error) {
    lines.push(`| Affiliate sales (${cj.windowDays}d) | **${n(cj.actions)}** | CJ · this app (site ${cj.websiteId}) |`);
    lines.push(`| Affiliate commission (${cj.windowDays}d) | **${fmtUSD(cj.commissionUsd)}** | CJ pending+locked |`);
    const advs = Object.entries(cj.byAdvertiser || {});
    if (advs.length) {
      const split = advs
        .sort((a, b) => b[1].commissionUsd - a[1].commissionUsd)
        .map(([name, a]) => `${name} ${fmtUSD(a.commissionUsd)}`)
        .join(' · ');
      lines.push(`| ↳ by retailer | ${split} | |`);
    } else if (cj.note) {
      lines.push(`| Affiliate | $0 so far | ${cj.note} |`);
    }
  } else if (cj && !cj.configured) {
    lines.push(`| CJ affiliate | not configured | Add CJ_PERSONAL_ACCESS_TOKEN to .env.local to track affiliate revenue |`);
  }
  lines.push('');

  // ── 9. APP STORE STATUS & REVIEWS ────────────────────────────────
  lines.push('## 🍎 APP STORE');
  lines.push('');
  lines.push(`- **Status:** ${APP_STORE_STATUS}`);
  lines.push(`- **App ID:** ${ASC_APP_ID}`);
  if (asc?.configured && !asc?.error) {
    lines.push(`- **Lifetime installs:** ${asc.lifetimeInstalls ?? 0}`);
    if (asc.mostRecentReportDate) {
      lines.push(`- **Most recent report:** ${asc.mostRecentReportDate} (24-48h lag from Apple)`);
    }
  } else if (asc?.error) {
    lines.push(`- **ASC error:** ${asc.error}`);
  }
  lines.push('');

  if (asc?.reviews && !asc.reviews.error) {
    const r = asc.reviews;
    if (r.totalReviews === 0) {
      lines.push('> No customer reviews yet.');
    } else {
      lines.push(`**Reviews (most recent ${r.totalReviews}):** avg ${r.avgRating ? r.avgRating.toFixed(1) + '★' : '—'} · ${r.fiveStarCount}× 5-star · ${r.oneStarCount}× 1-star`);
      if (r.recent7d?.length > 0) {
        lines.push('');
        lines.push('**Recent reviews:**');
        for (const rev of r.recent7d) {
          const stars = '★'.repeat(rev.rating) + '☆'.repeat(5 - (rev.rating || 0));
          lines.push(`- ${stars} **${rev.title || '(no title)'}** — ${rev.reviewerNickname || 'anon'} · ${rev.createdDate.slice(0, 10)}`);
          if (rev.body) {
            const body = rev.body.length > 200 ? rev.body.slice(0, 200) + '…' : rev.body;
            lines.push(`  > ${body.replace(/\n+/g, ' ')}`);
          }
        }
      }
    }
    lines.push('');
  } else if (asc?.reviews?.error) {
    lines.push(`> Reviews endpoint: ${asc.reviews.error}`);
    lines.push('');
  }

  // ── 10. STABILITY ────────────────────────────────────────────────
  if (sentry?.configured && !sentry.error) {
    lines.push('## 🛡 STABILITY (24h)');
    lines.push('');
    lines.push(`- **Unique Sentry issues:** ${crashes24h === 0 ? '**0** ✓' : '**' + crashes24h + '** ⚠'}`);
    if (sentry.crashFreeSessionsPct != null) {
      lines.push(`- **Crash-free sessions:** ${fmtPct(sentry.crashFreeSessionsPct)}`);
    }
    if (sentry.crashFreeUsersPct != null) {
      lines.push(`- **Crash-free users:** ${fmtPct(sentry.crashFreeUsersPct)}`);
    }
    if (sentry.crashFreeSessionsPct == null && sentry.crashFreeUsersPct == null) {
      lines.push(`- _Crash-free %: endpoint wired but returned null (Release Health may not be enabled)_`);
    }
    lines.push('');
  } else if (!sentry?.configured) {
    lines.push('## 🛡 STABILITY');
    lines.push('');
    lines.push('> Sentry not configured — add SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT_ID to .env.local');
    lines.push('');
  }

  // ── 11. ENGAGEMENT PULSE ──────────────────────────────────────────
  if (posthog?.topEvents?.length > 0) {
    lines.push("## 🎯 ENGAGEMENT (today's pulse)");
    lines.push('');
    lines.push('| Event | Count |');
    lines.push('|---|---|');
    posthog.topEvents.slice(0, 10).forEach((e) => {
      lines.push(`| ${e.name} | ${e.count} |`);
    });
    lines.push('');
  }

  // ── 11.5 BUY-LINK CLICKS (purchase intent) ────────────────────────
  // Source of truth is the durable Supabase ledger (affiliate_clicks) since
  // 2026-07-04. PostHog is a secondary signal and was wiped 2026-07-03, so it's
  // only a fallback until the ledger accrues data on installs taking the OTA.
  const ledger = supa?.affiliateClicks && !supa.affiliateClicks.error && supa.affiliateClicks.sinceLaunch > 0
    ? supa.affiliateClicks
    : null;
  if (ledger) {
    lines.push('## 🛒 BUY-LINK CLICKS (since launch)');
    lines.push('');
    lines.push(`- **Buy taps:** today ${ledger.today} · last 7d ${ledger.last7d} · **since launch ${ledger.sinceLaunch}** (${ledger.people} distinct people)`);
    if (ledger.byRetailer.length > 0) {
      lines.push(`- **By retailer:** ${ledger.byRetailer.map((r) => `${r.retailer} ${r.clicks}`).join(' · ')}`);
    }
    lines.push('');
    lines.push('> _Source of truth: Supabase `affiliate_clicks` ledger (app-owned, wipe-proof). Commission lands only if the retailer confirms the sale via CJ._');
    lines.push('');
  } else if (posthog?.affiliate) {
    const a = posthog.affiliate;
    lines.push('## 🛒 BUY-LINK CLICKS (since launch)');
    lines.push('');
    lines.push(`- **Buy taps (PostHog fallback):** today ${a.today} · yest ${a.yesterday} · **since launch ${a.sinceLaunch}** (${a.people} distinct people)`);
    if (a.byRetailer.length > 0) {
      lines.push(`- **By retailer:** ${a.byRetailer.map((r) => `${r.retailer} ${r.taps}`).join(' · ')}`);
    }
    lines.push(`- **Failed opens:** ${a.failedSinceLaunch}${a.failedSinceLaunch > 0 ? ' ⚠' : ''}`);
    lines.push('');
    lines.push('> _Supabase ledger has no rows yet (waiting on installs to take the 2026-07-04 OTA). Falling back to PostHog, which was wiped 2026-07-03 — treat as incomplete._');
    lines.push('');
  }

  // ── 12. CATALOG HEALTH ────────────────────────────────────────────
  if (supa?.catalogSize) {
    lines.push('## 📦 CATALOG HEALTH');
    lines.push('');
    lines.push(`- **Active fragrances:** ${supa.catalogSize.active.toLocaleString()}`);
    lines.push(`- **Total catalog rows:** ${supa.catalogSize.total.toLocaleString()}`);
    if (supa.dnaPickerEvents) {
      lines.push(`- **DNA picker committed sessions:** ${supa.dnaPickerEvents.commits}`);
    }
    if (supa?.swipes) {
      lines.push(`- **Swipe signals (since launch):** ${supa.swipes.sinceLaunch} (${supa.swipes.likeSinceLaunch} likes · ${supa.swipes.dislikeSinceLaunch} dislikes)`);
    }
    if (supa?.reviews) {
      lines.push(`- **Community reviews:** ${supa.reviews.sinceLaunch}`);
    }
    lines.push('');
  }

  // ── 13. MODERATION QUEUES ─────────────────────────────────────────
  lines.push('## 🚧 MODERATION QUEUES');
  lines.push('');
  lines.push(`- **Fragrance submissions (pending):** ${n(supa?.submissions?.pending)}`);
  lines.push(`- **Content reports (open):** ${n(supa?.contentReports?.open)}`);
  lines.push('');

  // ── 14. RECENT SIGNUPS ────────────────────────────────────────────
  if (supa?.recentSignups?.length > 0) {
    lines.push('## 👥 RECENT PROFILES (since launch)');
    lines.push('');
    lines.push('| When | User | Auth |');
    lines.push('|---|---|---|');
    for (const u of supa.recentSignups) {
      const icon = u.provider === 'apple' ? '🍎' : u.provider === 'google' ? 'G' : '·';
      const email = u.email || `(anon ${u.id.slice(0, 8)})`;
      const name = u.name ? `${u.name} — ` : '';
      lines.push(`| ${ago(u.createdAt)} | ${name}${email} | ${icon} ${u.provider} |`);
    }
    lines.push('');
  }

  // ── 15. ACTIVE USERS BY DAY (real: signed-in + guest visits) ───────
  if (au?.daily?.length > 0) {
    lines.push('## 📅 ACTIVE USERS BY DAY');
    lines.push('');
    if (au.denominatorNote) {
      lines.push(`> _${au.denominatorNote}_`);
      lines.push('');
    }
    lines.push('| Date | Active users | Signed-in | Guest visits |');
    lines.push('|---|---|---|---|');
    for (const d of au.daily) {
      lines.push(`| ${d.date} | **${d.total}** | ${d.signedIn} | ${d.guestVisits} |`);
    }
    lines.push('');
  } else {
    // NO person_id fallback table — an inflated number is worse than no number.
    lines.push('## 📅 ACTIVE USERS BY DAY');
    lines.push('');
    lines.push(`> Unavailable${activeUsers?.error ? `: ${activeUsers.error.slice(0, 100)}` : ''}`);
    lines.push('');
  }

  // ── 16. GAPS ──────────────────────────────────────────────────────
  const gaps = [];
  if (asc?.error) {
    gaps.push(`App Store Connect API error — ${(asc.error || '').slice(0, 80)}`);
  }
  if (!posthog?.configured) {
    gaps.push('PostHog not configured — add POSTHOG_PERSONAL_API_KEY + POSTHOG_PROJECT_ID to .env.local');
  } else if (posthog?.error) {
    gaps.push(`PostHog error: ${posthog.error.slice(0, 80)}`);
  }
  if (!rc?.configured) {
    gaps.push('RevenueCat not configured — add REVENUECAT_PROJECT_ID + REVENUECAT_SECRET_KEY to .env.local');
  }
  if (!sentry?.configured) {
    gaps.push('Sentry not configured — add SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT_ID to .env.local');
  }
  gaps.push('Apple Search Ads not started — create campaigns to drive post-launch installs.');

  if (gaps.length > 0) {
    lines.push('## 🚨 GAPS');
    lines.push('');
    for (const g of gaps) lines.push(`- ${g}`);
    lines.push('');
  }

  // ── 17. DATA INTEGRITY LEGEND ────────────────────────────────────
  lines.push('---');
  lines.push('## 📐 DATA INTEGRITY LEGEND');
  lines.push('');
  lines.push('| Source | Trust | Note |');
  lines.push('|---|---|---|');
  lines.push('| App Store Connect (installs, proceeds, reviews) | ✅ Truth | Apple-reported; 24-48h lag; production-only |');
  lines.push(`| Supabase profiles, wardrobe, wear_logs, swipes | ✅ Truth | Direct DB rows; since launch (${LAUNCH_DATE}) |`);
  lines.push('| Supabase profiles.is_pro | ✅ Truth | Written by RC webhook |');
  lines.push('| Sentry unique issues 24h | ✅ Truth | Direct from Sentry API |');
  lines.push('| Active users / WAU / MAU | ✅ Deduplicated | Signed-in = exact distinct Supabase users; guests = visits (30-min sessions). person_id metrics removed from this report (~2-3x inflated) |');
  lines.push('| RevenueCat (subs, MRR) | ⚠ Incl sandbox | Cannot filter sandbox via API |');
  lines.push('| App Store reviews | ⚠ USA only | Most-recent 20 only |');
  lines.push('| Fragrance DNA funnel | ✅ Truth | PostHog events; all-time |');
  lines.push('');
  lines.push(`_Sources: ${(sources || []).join(', ')}_`);

  return lines.join('\n');
}

module.exports = { render };
