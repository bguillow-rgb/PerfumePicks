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
