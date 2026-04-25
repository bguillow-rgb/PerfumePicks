import { File } from 'expo-file-system/next';
import { supabase } from '@/lib/supabase';
import { getDeviceId } from '@/lib/deviceId';
import { track } from '@/src/lib/observability/analytics';
import { EVENTS } from '@/src/lib/observability/events';
import type { Cigar } from '@/src/types/cigar';

interface IdentifyResult {
  cigar: Cigar | null;
  scanId: string | null; // scan_images row ID for corrections
  displayName: string; // name with vitola stripped if vitola is uncertain
  displayVitola: string | null; // separate vitola to show, or null if uncertain
  vitolaConfident: boolean;
  confidence: number;
  reasoning: string;
  rawResponse: Record<string, unknown>;
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

export async function identifyCigar(imageUriOrUris: string | string[]): Promise<IdentifyResult> {
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

  // Call our Supabase Edge Function — keeps Anthropic key server-side.
  // supabase.functions.invoke automatically attaches the user's JWT.
  const { data: apiResult, error: invokeError } = await supabase.functions.invoke(
    'identify-cigar',
    { body: { images, device_id: deviceId } },
  );

  if (invokeError) {
    // Map function errors to user-friendly copy. Never leak raw transport details.
    const status = (invokeError as any).context?.status;
    if (status === 401) {
      throw new Error('Please sign in again and try scanning.');
    }
    if (status === 429) {
      throw new Error('You\'ve hit the scan limit. Upgrade to Pro for unlimited scans.');
    }
    throw new Error('Cigar scanning is temporarily unavailable. Please try again later.');
  }

  if (!apiResult || (apiResult as any).error) {
    throw new Error((apiResult as any)?.error ?? 'Cigar scanning is temporarily unavailable.');
  }

  const textContent = (apiResult as any).content?.find((c: any) => c.type === 'text')?.text ?? '{}';

  let parsed: any;
  try {
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : textContent);
  } catch {
    parsed = { brand: null, name: null, confidence: 0, reasoning: 'Failed to parse response' };
  }

  // Back-compat: older responses used "name" instead of "line"
  const parsedLine: string | null = parsed.line ?? parsed.name ?? null;
  const claudeVitola: string | null = isConfidentVitola(parsed.vitola) ? parsed.vitola : null;
  const vitolaConfident = claudeVitola !== null;

  // Try to match against our database using the `line` column
  let matchedCigar: Cigar | null = null;

  if (parsed.brand && parsedLine) {
    // Fetch ALL rows that match brand + line, so we can pick the right vitola.
    // Query `line` (canonical) — falls back transparently to pre-migration `name` when `line` = `name`.
    const { data } = await supabase
      .from('cigars')
      .select('*')
      .ilike('brand', `%${parsed.brand}%`)
      .ilike('line', `%${parsedLine}%`)
      .limit(20);

    if (data && data.length > 0) {
      if (vitolaConfident && claudeVitola) {
        // Prefer the SKU whose vitola matches Claude's confident guess
        const vitolaMatch = data.find(
          (c: any) => c.vitola && c.vitola.toLowerCase() === claudeVitola.toLowerCase()
        );
        matchedCigar = (vitolaMatch ?? data[0]) as Cigar;
      } else {
        // Claude couldn't determine size — just grab the first SKU of this line.
        // UI will show line name + "size unclear" so user isn't misled.
        matchedCigar = data[0] as Cigar;
      }
    } else {
      // Fallback: brand-only, grab any record for the brand
      const { data: brandData } = await supabase
        .from('cigars')
        .select('*')
        .ilike('brand', `%${parsed.brand}%`)
        .limit(1);

      if (brandData && brandData.length > 0) {
        matchedCigar = brandData[0] as Cigar;
      }
    }
  }

  track(EVENTS.SCAN_RESULT_RECEIVED, {
    method: 'concierge',
    frame_count: uris.length,
    cigar_id: matchedCigar?.id ?? null,
    raw_brand: parsed.brand ?? null,
    raw_line: parsedLine,
    confidence: parsed.confidence ?? 0,
  });

  // Compute display fields using the new `line` column (preferred) with name fallback
  let displayName = parsedLine ?? 'Unknown';
  let displayVitola: string | null = null;

  if (matchedCigar) {
    // Prefer the canonical line column; fall back to stripped name for any unmigrated rows
    displayName = matchedCigar.line ?? stripVitolaFromName(matchedCigar.name, matchedCigar.vitola);
    if (vitolaConfident) {
      displayVitola = matchedCigar.vitola ?? claudeVitola;
    } else {
      displayVitola = null;
    }
  }

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
      confidence: parsed.confidence ?? null,
      user_confirmed: false,
      raw_llm_response: { ...(apiResult as Record<string, unknown>), frame_count: uris.length },
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
    confidence: parsed.confidence ?? 0,
    reasoning: parsed.reasoning ?? '',
    rawResponse: apiResult as Record<string, unknown>,
  };
}
