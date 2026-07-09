// dr-ad-spend-render.js — shared rendering of the DR AD SPEND block so the
// CEO and JSON formatters stay in sync.
//   markdownLines(adSpend) — for ceo.js

'use strict';

const SEV_ICON = { critical: '🚨', high: '⚠️', medium: '•', low: '·' };

function staleNote(adSpend, { brief = false } = {}) {
  if (adSpend.mode === 'snapshot') {
    const base = adSpend.capturedAt
      ? `manual snapshot from ${adSpend.capturedAt}`
      : 'manual snapshot';
    if (adSpend.liveError) {
      return brief ? `${base}, live pull failed` : `${base} — live pull failed: ${adSpend.liveError}`;
    }
    return brief ? base : `${base} (wire ASA API creds for live pull)`;
  }
  return adSpend.capturedAt ? `live pull ${adSpend.capturedAt}` : 'live';
}

function markdownLines(adSpend) {
  const lines = [];
  lines.push('## 📋 Apple Search Ads — DR AD SPEND');
  lines.push('');

  if (!adSpend || !adSpend.ok) {
    lines.push(`- _No ASA read: ${adSpend?.reason || 'unavailable'}._`);
    lines.push('- **Apple Search Ads console:** searchads.apple.com');
    lines.push('');
    return lines;
  }

  const t = adSpend.totals || {};
  const cpa = t.cpa != null ? `$${t.cpa.toFixed(2)}` : '—';
  lines.push(
    `**Spend** $${(t.spend || 0).toFixed(2)} · **Installs** ${t.installs || 0} · ` +
      `**CPA** ${cpa} · _${adSpend.dateRange || 'window'}_ · _${staleNote(adSpend)}_`
  );
  lines.push('');
  // Snapshot self-expiry: a stale snapshot confidently rendering old numbers is
  // how this section printed false alarms for weeks. Past 7 days, scream
  // instead of report.
  const SNAPSHOT_MAX_AGE_DAYS = 7;
  if (adSpend.mode === 'snapshot' && adSpend.capturedAt) {
    const ageDays = Math.floor((Date.now() - Date.parse(adSpend.capturedAt)) / 86400000);
    if (ageDays > SNAPSHOT_MAX_AGE_DAYS) {
      lines.push(
        `> 🚨 **SNAPSHOT IS ${ageDays} DAYS OLD — numbers and recommendations below are OUTDATED.** ` +
          `Re-pull from app-ads.apple.com into scripts/kpi/data/asa-snapshot.json, or wire the ASA live API creds. ` +
          `Do not act on this section until refreshed.`
      );
      lines.push('');
    }
  }
  // Change markers — when the account structure was changed, so every future
  // read compares performance against the right baseline window.
  try {
    const path = require('path');
    const fs = require('fs');
    const clPath = path.join(__dirname, '..', 'data', 'asa-changelog.json');
    if (fs.existsSync(clPath)) {
      const changes = JSON.parse(fs.readFileSync(clPath, 'utf8'));
      const last = changes[changes.length - 1];
      if (last) {
        const ageDays = Math.floor((Date.now() - Date.parse(last.date)) / 86400000);
        lines.push(`> ⚑ **Structure changed ${last.date}** (${ageDays}d ago): ${last.summary}`);
        if (last.baseline) {
          lines.push(`> Pre-change baseline (${last.baseline.window}): $${last.baseline.spend} · ${last.baseline.installs} installs · $${last.baseline.cpa} CPA. Compare current numbers against this.`);
        }
        lines.push('');
      }
    }
  } catch {}
  lines.push(`> ${adSpend.verdict}`);
  lines.push('');

  if (adSpend.findings.length > 0) {
    lines.push('| | Action | Finding |');
    lines.push('|---|---|---|');
    for (const f of adSpend.findings) {
      const icon = SEV_ICON[f.severity] || '·';
      lines.push(`| ${icon} | ${f.action} | ${f.title} |`);
    }
    lines.push('');
  }

  if (adSpend.firstMoves.length > 0) {
    lines.push('**What I would do first:**');
    lines.push('');
    adSpend.firstMoves.forEach((m, i) => lines.push(`${i + 1}. ${m}`));
    lines.push('');
  }

  return lines;
}

module.exports = { markdownLines };
