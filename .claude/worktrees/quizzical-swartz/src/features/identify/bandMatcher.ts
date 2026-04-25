// Fuzzy matcher that maps OCR text strings to cigar rows.
//
// Strategy: each CigarIndexEntry carries a set of lowercased trigrams derived
// from brand + line + vitola + known alt spellings. Each OCR observation
// produces its own trigram set. Score = Jaccard similarity, boosted if the
// brand token appears verbatim. Cheap enough to run on every frame processor
// tick (~0.1 ms per 500 entries).

import type { Cigar } from '@/src/types/cigar';

export interface CigarIndexEntry {
  cigar: Cigar;
  // Space-normalized lowercase blob used for substring quick-check.
  haystack: string;
  // Trigrams over the haystack, for Jaccard similarity.
  trigrams: Set<string>;
  // Lowercased brand token — weighted heavily when present in OCR.
  brandLower: string;
  brandTokens: string[];
}

export interface MatchCandidate {
  cigar: Cigar;
  score: number; // 0..1
}

// Unicode-safe accent stripping via NFD decomposition + combining-mark removal.
// Handles both precomposed (Padrón → Padron) and decomposed (Padro\u0301n) forms —
// MLKit's output can arrive in either, especially on iOS.
function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function normalize(s: string): string {
  return stripAccents(s)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function trigramsOf(s: string): Set<string> {
  const out = new Set<string>();
  // Operate on concatenated tokens — a ' ' bigram between two short words
  // shouldn't dominate the similarity.
  const squashed = s.replace(/\s+/g, '_');
  if (squashed.length < 3) {
    if (squashed) out.add(squashed);
    return out;
  }
  for (let i = 0; i <= squashed.length - 3; i++) out.add(squashed.slice(i, i + 3));
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

export function buildIndex(cigars: Cigar[]): CigarIndexEntry[] {
  return cigars.map((c) => {
    const brand = normalize(c.brand);
    const line = normalize(c.line ?? c.name ?? '');
    const vitola = normalize(c.vitola ?? '');
    const haystack = `${brand} ${line} ${vitola}`.trim();
    return {
      cigar: c,
      haystack,
      trigrams: trigramsOf(haystack),
      brandLower: brand,
      brandTokens: brand.split(' ').filter(Boolean),
    };
  });
}

// Match a list of OCR text observations against the index.
// observations: whatever text MLKit emitted in recent frames. We pool them.
export function match(observations: string[], index: CigarIndexEntry[]): MatchCandidate[] {
  const pooled = normalize(observations.join(' '));
  if (pooled.length < 3) return [];
  const queryTrigrams = trigramsOf(pooled);

  const scored: MatchCandidate[] = [];
  for (const entry of index) {
    let score = jaccard(queryTrigrams, entry.trigrams);

    // Brand match is a strong signal. If the OCR pool contains the brand as a
    // whole token, boost; if multi-word brand fully present, boost more.
    if (entry.brandTokens.length > 0) {
      const pooledTokens = new Set(pooled.split(' '));
      let hit = 0;
      for (const t of entry.brandTokens) if (t.length >= 3 && pooledTokens.has(t)) hit++;
      if (hit > 0) score += 0.25 * (hit / entry.brandTokens.length);
    }

    if (score >= 0.2) scored.push({ cigar: entry.cigar, score: Math.min(score, 1) });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 5);
}

// Aggregate candidates across a sliding window of match() calls. We keep a
// cigar only if it appears repeatedly — single-frame noise gets filtered out.
export function consensus(
  history: MatchCandidate[][],
  minOccurrences = 3
): MatchCandidate | null {
  if (history.length === 0) return null;
  const agg = new Map<string, { cigar: Cigar; total: number; count: number }>();
  for (const frame of history) {
    for (const cand of frame) {
      const cur = agg.get(cand.cigar.id);
      if (cur) {
        cur.total += cand.score;
        cur.count += 1;
      } else {
        agg.set(cand.cigar.id, { cigar: cand.cigar, total: cand.score, count: 1 });
      }
    }
  }
  let best: { cigar: Cigar; total: number; count: number } | null = null;
  for (const v of agg.values()) {
    if (v.count < minOccurrences) continue;
    if (!best || v.total > best.total) best = v;
  }
  if (!best) return null;
  // Normalize score by number of frames so UI can threshold on it.
  return { cigar: best.cigar, score: Math.min(best.total / history.length, 1) };
}
