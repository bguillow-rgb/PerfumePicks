import { File } from 'expo-file-system/next';
import { supabase } from '@/lib/supabase';
import { getDeviceId } from '@/lib/deviceId';
import { track } from '@/src/lib/observability/analytics';
import { EVENTS } from '@/src/lib/observability/events';
import { useProStore } from '@/src/stores/useProStore';
import type { Cigar } from '@/src/types/cigar';

// ---- Response contract ----

// One ranked interpretation of the image, as the model returned it, plus the
// DB row it mapped to (or null if no row cleared the scored-match threshold).
// The result screen renders these as the winner card + alternatives strip,
// so the field set matches what that UI needs.
export interface CigarCandidate {
  cigar: Cigar | null;
  rawBrand: string | null;
  rawLine: string | null;
  rawVitola: string | null;
  confidence: number;
  reasoning: string;
  vitolaConfident: boolean;
  matchScore: number; // 0..1 from scoreCandidateAgainstRow — 0 when no match
  displayName: string;
  displayVitola: string | null;
}

interface IdentifyResult {
  cigar: Cigar | null;
  scanId: string | null; // scan_images row ID for corrections
  displayName: string; // name with vitola stripped if vitola is uncertain
  displayVitola: string | null; // separate vitola to show, or null if uncertain
  vitolaConfident: boolean;
  confidence: number;
  reasoning: string;
  rawResponse: Record<string, unknown>;
  // Top-3 ranked candidates (winner + up to 2 alternatives), already deduped
  // on (brand, line) and matched against the DB. Result screen renders them
  // as the alternatives strip. Always at least one entry when `cigar` is
  // non-null.
  candidates: CigarCandidate[];
  // Which index in the model's original ranked list actually won the DB
  // match (0/1/2), or -1 if all three failed. Emitted as telemetry.
  chosenCandidateIndex: number;
}

// Known vitola words we strip from DB names when vitola is not confident
const VITOLA_WORDS = [
  'Robusto', 'Toro', 'Torpedo', 'Churchill', 'Corona', 'Lonsdale', 'Lancero',
  'Panetela', 'Perfecto', 'Belicoso', 'Figurado', 'Gigante', 'Double Corona',
  'Gordo', 'Petit Corona', 'Presidente', 'Pyramid', 'Rothschild', 'Salomon',
];

function stripVitolaFromName(name: string, vitola?: string | null): string {
  let result = name;
  // Strip the specific vitola first if present
  if (vitola) {
    const re = new RegExp(`\\s*\\b${vitola}\\b\\s*$`, 'i');
    result = result.replace(re, '');
  }
  // Strip any trailing generic vitola word
  for (const word of VITOLA_WORDS) {
    const re = new RegExp(`\\s+${word}$`, 'i');
    result = result.replace(re, '');
  }
  return result.trim();
}

function isConfidentVitola(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const t = v.trim().toLowerCase();
  if (!t) return false;
  if (t === 'null' || t === 'unknown') return false;
  if (t.startsWith('cannot') || t.startsWith('unable') || t.startsWith('not ')) return false;
  if (t.includes(' or ')) return false; // "Robusto or Toro" = uncertain
  if (t.includes('?')) return false;
  return true;
}

// NFD decompose + strip combining marks. "Padrón" → "Padron", "Café" → "Cafe".
// Catches the dominant matcher failure mode where the model returns accented
// Spanish brand names but the DB stores plain ASCII.
function foldAccents(s: string): string {
  return s.normalize('NFD').replace(/\p{M}+/gu, '');
}

function tokenize(s: string): string[] {
  return foldAccents(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t.length > 1);
}

// Score a DB row against a model candidate's (line, vitola). Brand match is
// enforced *before* calling this (hard gate), so we only reason about the
// within-brand discrimination here.
//
// Scoring:
//   - line token overlap as a fraction of the larger token set (0..1)
//   - +0.15 when vitola is confident and exact
//   - floor at 0 so the caller can threshold cleanly
function scoreRowAgainstCandidate(
  row: Cigar,
  candidateLine: string,
  candidateVitola: string | null,
): number {
  const rowTokens = new Set(tokenize(row.line ?? row.name ?? ''));
  const candTokens = new Set(tokenize(candidateLine));
  if (rowTokens.size === 0 || candTokens.size === 0) return 0;
  let shared = 0;
  for (const t of candTokens) if (rowTokens.has(t)) shared++;
  const maxSize = Math.max(rowTokens.size, candTokens.size);
  let score = shared / maxSize;
  if (
    candidateVitola &&
    row.vitola &&
    foldAccents(row.vitola).toLowerCase() === foldAccents(candidateVitola).toLowerCase()
  ) {
    score += 0.15;
  }
  return Math.min(score, 1);
}

// Minimum accepted line-token-overlap score. Below this we drop the DB row
// entirely and fall through to the next ranked candidate. 0.5 = half of the
// larger token set shared, which still rejects "1964" vs "1964 Anniversary
// Edition Padron 35 Years" (1/8 = 0.125) as a stretch match.
const MIN_MATCH_SCORE = 0.5;

async function readFileAsBase64(uri: string): Promise<string> {
  try {
    const file = new File(uri);
    const base64 = await file.base64();
    return base64;
  } catch {
    // Fallback: fetch as blob and convert
    const response = await fetch(uri);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        resolve(dataUrl.split(',')[1] || '');
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}

function mediaTypeFor(uri: string): string {
  const ext = uri.split('.').pop()?.toLowerCase();
  return ext === 'png' ? 'image/png' : 'image/jpeg';
}

// ---- Candidate extraction from Sonnet's response ----

// Shape returned per candidate by the model after the prompt rewrite. Kept
// optional everywhere so a legacy single-object response still parses cleanly
// for clients still on the old build.
interface RawCandidate {
  brand?: string | null;
  line?: string | null;
  name?: string | null; // pre-prompt-rewrite legacy name field
  vitola?: string | null;
  confidence?: number;
  reasoning?: string;
}

// Normalize either the new `{ candidates: [...] }` shape or the legacy
// `{ brand, line, vitola, confidence, reasoning }` single-object shape into
// an ordered array. Legacy clients keep working; new clients get top-3.
function extractRawCandidates(parsed: any): RawCandidate[] {
  if (Array.isArray(parsed?.candidates) && parsed.candidates.length > 0) {
    return parsed.candidates.slice(0, 3);
  }
  // Legacy shape — treat as a single-candidate list.
  if (parsed?.brand || parsed?.line || parsed?.name) {
    return [
      {
        brand: parsed.brand ?? null,
        line: parsed.line ?? parsed.name ?? null,
        vitola: parsed.vitola ?? null,
        confidence: parsed.confidence ?? 0,
        reasoning: parsed.reasoning ?? '',
      },
    ];
  }
  return [];
}

// Try to match one model candidate to a DB row. Enforces a HARD brand gate
// (accent-folded exact match, no substring) then scores the returned rows
// for line-token overlap. Returns null if no row clears MIN_MATCH_SCORE —
// the caller cascades to the next candidate.
async function matchCandidateToDb(
  brandRaw: string,
  lineRaw: string,
  vitolaRaw: string | null,
): Promise<{ cigar: Cigar | null; matchScore: number }> {
  const brandFolded = foldAccents(brandRaw).trim();
  if (!brandFolded) return { cigar: null, matchScore: 0 };

  // Brand-exact query. ilike is case-insensitive; we pass no wildcards so
  // Postgres treats it as straight equality modulo case. Accent-folding on
  // the DB side is not available without `unaccent` so we rely on the DB
  // storing ASCII brand names (and flag in telemetry when Sonnet's output
  // differed). If the DB ever stores "Padrón" we miss — tracked as data
  // debt to clean up later.
  const { data, error } = await supabase
    .from('cigars')
    .select('*')
    .ilike('brand', brandFolded)
    .limit(50);
  if (error || !data || data.length === 0) return { cigar: null, matchScore: 0 };

  // Strip trailing vitola words off the model's line field before scoring —
  // Sonnet sometimes ignores the prompt and puts the vitola there.
  const cleanedLine = stripVitolaFromName(lineRaw, vitolaRaw ?? undefined);
  const confidentVitola = isConfidentVitola(vitolaRaw) ? (vitolaRaw as string) : null;

  let bestRow: Cigar | null = null;
  let bestScore = 0;
  for (const row of data as Cigar[]) {
    const s = scoreRowAgainstCandidate(row, cleanedLine, confidentVitola);
    if (s > bestScore) {
      bestRow = row;
      bestScore = s;
    }
  }

  if (bestScore >= MIN_MATCH_SCORE && bestRow) {
    return { cigar: bestRow, matchScore: bestScore };
  }
  return { cigar: null, matchScore: 0 };
}

function computeDisplayName(
  cigar: Cigar | null,
  rawLine: string | null,
  vitolaConfident: boolean,
  rawVitola: string | null,
): { displayName: string; displayVitola: string | null } {
  if (cigar) {
    const displayName = cigar.line ?? stripVitolaFromName(cigar.name, cigar.vitola);
    const displayVitola = vitolaConfident ? (cigar.vitola ?? rawVitola ?? null) : null;
    return { displayName, displayVitola };
  }
  return {
    displayName: rawLine ?? 'Unknown',
    displayVitola: null,
  };
}

export async function identifyCigar(
  imageUriOrUris: string | string[],
  opts?: { enhance?: boolean },
): Promise<IdentifyResult> {
  // Normalize to array — supports both single-photo (legacy) and multi-frame burst
  const uris = Array.isArray(imageUriOrUris) ? imageUriOrUris : [imageUriOrUris];
  if (uris.length === 0) throw new Error('No image provided');
  const primaryUri = uris[0];

  // Read each image as base64
  const images = await Promise.all(
    uris.map(async (u) => ({
      base64: await readFileAsBase64(u),
      mediaType: mediaTypeFor(u),
    })),
  );

  const deviceId = await getDeviceId();
  const invokeStart = Date.now();

  // Call our Supabase Edge Function — keeps Anthropic key server-side.
  // supabase.functions.invoke automatically attaches the user's JWT.
  const { data: apiResult, error: invokeError } = await supabase.functions.invoke(
    'identify-cigar',
    { body: { images, device_id: deviceId, enhance: opts?.enhance === true } },
  );

  if (invokeError) {
    // Map function errors to user-friendly copy. Never leak raw transport details.
    const status = (invokeError as any).context?.status;
    if (status === 401) {
      throw new Error('Please sign in again and try scanning.');
    }
    if (status === 429) {
      // Two server 429 paths share a status code:
      //  - quota exceeded (free tier only) -> "hit the free-scan limit"
      //  - hourly/daily rate limit (applies to everyone) -> "too many scans"
      // Previously we hardcoded the free-tier "upgrade to Pro" copy for
      // every 429, which meant Pro/comped users saw an "Upgrade to Pro"
      // nudge when they were rate-limited. If the user is already Pro,
      // never suggest upgrading — give them the rate-limit copy instead.
      const isPro = useProStore.getState().isPro;
      if (isPro) {
        throw new Error(
          'Too many scans in a short time — please wait a minute and try again.',
        );
      }
      throw new Error('You\'ve hit the scan limit. Upgrade to Pro for unlimited scans.');
    }
    throw new Error('Cigar scanning is temporarily unavailable. Please try again later.');
  }

  if (!apiResult || (apiResult as any).error) {
    throw new Error((apiResult as any)?.error ?? 'Cigar scanning is temporarily unavailable.');
  }

  const latency_ms = Date.now() - invokeStart;

  // Parse model output — try to find the JSON blob in the text content,
  // then either the new candidates array or the legacy flat object.
  const textContent = (apiResult as any).content?.find((c: any) => c.type === 'text')?.text ?? '{}';
  let parsed: any;
  try {
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : textContent);
  } catch {
    parsed = { candidates: [] };
  }

  const rawCandidates = extractRawCandidates(parsed);
  const overallReasoning: string =
    parsed.overall_reasoning ?? parsed.reasoning ?? rawCandidates[0]?.reasoning ?? '';

  // Score + DB-match each candidate in rank order. Cascade: stop trying
  // once one matches. Track which original-rank index won for telemetry.
  const matched: CigarCandidate[] = [];
  let chosenCandidateIndex = -1;
  let anyAccentFolded = false;
  let anyVitolaStripped = false;

  for (let i = 0; i < rawCandidates.length; i++) {
    const c = rawCandidates[i];
    const rawBrand = c.brand ?? null;
    const rawLine = c.line ?? c.name ?? null;
    const rawVitola = c.vitola ?? null;
    const confidence = typeof c.confidence === 'number' ? c.confidence : 0;
    const reasoning = c.reasoning ?? '';
    const vitolaConfident = isConfidentVitola(rawVitola);

    // Accent-fold + vitola-strip telemetry (flag when the model's output
    // needed cleanup — drives DB / prompt improvements).
    if (rawBrand && foldAccents(rawBrand) !== rawBrand) anyAccentFolded = true;
    if (rawLine && rawVitola && rawLine.toLowerCase().includes(rawVitola.toLowerCase())) {
      anyVitolaStripped = true;
    }

    let dbCigar: Cigar | null = null;
    let matchScore = 0;
    if (rawBrand && rawLine) {
      const matchResult = await matchCandidateToDb(rawBrand, rawLine, rawVitola);
      dbCigar = matchResult.cigar;
      matchScore = matchResult.matchScore;
    }

    const { displayName, displayVitola } = computeDisplayName(
      dbCigar,
      rawLine,
      vitolaConfident,
      rawVitola,
    );

    matched.push({
      cigar: dbCigar,
      rawBrand,
      rawLine,
      rawVitola,
      confidence,
      reasoning,
      vitolaConfident,
      matchScore,
      displayName,
      displayVitola,
    });

    if (dbCigar && chosenCandidateIndex === -1) {
      chosenCandidateIndex = i;
    }
  }

  // Dedup on (brand, line) — Sonnet sometimes returns near-duplicates as
  // alternatives. Keep the first, drop subsequent same-key entries. The
  // winner (captured by reference before dedup) is preserved even if it
  // was a duplicate of an earlier entry — dedup only drops *later* copies.
  // Finally, remap chosenCandidateIndex to its new position in the deduped
  // list so UI consumers don't index out of bounds.
  const winnerBeforeDedup =
    chosenCandidateIndex >= 0 ? matched[chosenCandidateIndex] : null;

  const seen = new Set<string>();
  const dedupedCandidates: CigarCandidate[] = [];
  const indexRemap = new Map<number, number>();
  for (let i = 0; i < matched.length; i++) {
    const c = matched[i];
    const key = `${foldAccents(c.rawBrand ?? '').toLowerCase()}|${foldAccents(
      c.rawLine ?? '',
    ).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    indexRemap.set(i, dedupedCandidates.length);
    dedupedCandidates.push(c);
  }

  // Defensive: if the winner was dropped by dedup (shouldn't happen because
  // the winner is always the first match for its (brand,line) key, so it
  // lands first in the dedup pass too — but we guard anyway), reinstate it
  // by rehoming the original chosenCandidateIndex.
  if (winnerBeforeDedup && !indexRemap.has(chosenCandidateIndex)) {
    // Winner was somehow absent from deduped — put it back at the front.
    indexRemap.set(chosenCandidateIndex, 0);
    dedupedCandidates.unshift(winnerBeforeDedup);
  }

  // Remap chosenCandidateIndex from matched[] space → dedupedCandidates[] space.
  if (chosenCandidateIndex >= 0) {
    const remapped = indexRemap.get(chosenCandidateIndex);
    chosenCandidateIndex = remapped === undefined ? -1 : remapped;
  }

  // The "winner" is whichever candidate at chosenCandidateIndex (now in
  // deduped space) actually matched the DB. If nothing did, present
  // candidate 0 as a best-guess — the UI's Partial/Unknown states handle it.
  const winner =
    chosenCandidateIndex >= 0
      ? dedupedCandidates[chosenCandidateIndex]
      : dedupedCandidates[0] ?? null;

  const matchedCigar = winner?.cigar ?? null;
  const confidence = winner?.confidence ?? 0;
  const vitolaConfident = winner?.vitolaConfident ?? false;

  track(EVENTS.SCAN_RESULT_RECEIVED, {
    method: 'concierge',
    frame_count: uris.length,
    frames_per_scan: uris.length,
    cigar_id: matchedCigar?.id ?? null,
    raw_brand: winner?.rawBrand ?? null,
    raw_line: winner?.rawLine ?? null,
    confidence,
    latency_ms,
    candidate_count: rawCandidates.length,
  });
  track(EVENTS.SCAN_MATCH_SCORE, { score: winner?.matchScore ?? 0 });
  track(EVENTS.SCAN_CANDIDATE_INDEX_CHOSEN, { index: chosenCandidateIndex });
  if (anyAccentFolded) track(EVENTS.SCAN_ACCENT_FOLDED, {});
  if (anyVitolaStripped) track(EVENTS.SCAN_VITOLA_IN_LINE_STRIPPED, {});

  // Display fields for the winner — used by legacy call sites that haven't
  // switched to consuming `candidates` directly yet.
  const { displayName, displayVitola } = winner
    ? { displayName: winner.displayName, displayVitola: winner.displayVitola }
    : { displayName: 'Unknown', displayVitola: null };

  // Save scan to database for training (use primary frame as the canonical image)
  let scanId: string | null = null;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const primaryMediaType = mediaTypeFor(primaryUri);
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
    const filePath = user ? `${user.id}/${fileName}` : `anonymous/${fileName}`;

    const imageResponse = await fetch(primaryUri);
    const imageBlob = await imageResponse.blob();

    await supabase.storage
      .from('scan-uploads')
      .upload(filePath, imageBlob, { contentType: primaryMediaType });

    const { data: urlData } = supabase.storage
      .from('scan-uploads')
      .getPublicUrl(filePath);

    const { data: scanRow } = await supabase.from('scan_images').insert({
      user_id: user?.id ?? null,
      device_id: deviceId,
      scan_method: 'concierge',
      image_url: urlData.publicUrl,
      identified_cigar_id: matchedCigar?.id ?? null,
      confidence,
      user_confirmed: false,
      raw_llm_response: {
        ...(apiResult as Record<string, unknown>),
        frame_count: uris.length,
        chosen_candidate_index: chosenCandidateIndex,
      },
    }).select('id').single();

    scanId = scanRow?.id ?? null;
  } catch {
    console.warn('Failed to save scan data');
  }

  return {
    cigar: matchedCigar,
    scanId,
    displayName,
    displayVitola,
    vitolaConfident,
    confidence,
    reasoning: overallReasoning,
    rawResponse: apiResult as Record<string, unknown>,
    candidates: dedupedCandidates,
    chosenCandidateIndex,
  };
}
