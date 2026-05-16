/**
 * Perfume Concierge — AI fragrance identification.
 * Mirrors Pour Picks' identifyService.ts architecture with
 * brand/name/concentration instead of distillery/expression/variant.
 *
 * Flow:
 *   1. Read photo URIs as base64.
 *   2. POST to identify-bottle Edge Function with base64 frames + device_id.
 *   3. Edge Function calls Claude Sonnet vision, returns { brand, name,
 *      concentration, confidence, reasoning }.
 *   4. Match the result to the fragrances catalog by brand + name.
 *   5. Persist the scan to scan_images for the training loop.
 */

import { readAsStringAsync } from 'expo-file-system';

import { getDeviceId } from '@/src/lib/deviceId';
import { track, EVENTS } from '@/src/lib/observability';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

// ── Types ──

interface LabelReaderParsed {
  brand?: string | null;
  name?: string | null;
  concentration?: string | null;
  confidence?: number;
  reasoning?: string;
}

export interface IdentifyResult {
  fragranceId: string | null;       // matched fragrances.id
  scanId: string | null;            // scan_images row ID for corrections
  displayBrand: string;
  displayName: string;
  displayConcentration: string | null;
  confidence: number;
  reasoning: string;
  aiBrand: string;
  aiName: string;
  aiConcentration: string | null;
  rawResponse: Record<string, unknown>;
  routeTo: 'default' | 'confirm_personal';
  labelReader: LabelReaderParsed | null;
}

export interface DeeperCandidate {
  brand: string;
  name: string;
  concentration: string | null;
  fragrance_family: string | null;
  gender: string | null;
}

export interface DeeperResult {
  candidate: DeeperCandidate;
  source: 'catalog' | 'generated';
  catalogFragranceId: string | null;
  confidence: number;
  reasoning: string;
}

// ── Helpers ──

async function readFileAsBase64(uri: string): Promise<string> {
  return readAsStringAsync(uri, {
    encoding: 'base64',
  });
}

function mediaTypeFor(uri: string): string {
  const ext = uri.split('.').pop()?.toLowerCase();
  return ext === 'png' ? 'image/png' : 'image/jpeg';
}

// ── identifyBottle ──

export async function identifyBottle(
  imageUriOrUris: string | string[]
): Promise<IdentifyResult> {
  if (!isSupabaseConfigured) {
    throw new Error('Sign in to use the Perfume Concierge.');
  }

  const uris = Array.isArray(imageUriOrUris)
    ? imageUriOrUris
    : [imageUriOrUris];
  if (uris.length === 0) throw new Error('No image provided');

  const images = await Promise.all(
    uris.map(async (u) => ({
      base64: await readFileAsBase64(u),
      mediaType: mediaTypeFor(u),
    }))
  );

  const deviceId = await getDeviceId();

  const { data: apiResult, error: invokeError } =
    await supabase.functions.invoke('identify-bottle', {
      body: { images, device_id: deviceId },
    });

  if (invokeError) {
    const status = (invokeError as any)?.context?.status;
    if (status === 401)
      throw new Error('Please sign in again and try scanning.');
    if (status === 429)
      throw new Error(
        "You've hit the scan limit. Upgrade to Pro for unlimited scans."
      );
    throw new Error(
      'Fragrance scanning is temporarily unavailable. Please try again later.'
    );
  }

  if (!apiResult || (apiResult as any).error) {
    throw new Error(
      (apiResult as any)?.error ??
        'Fragrance scanning is temporarily unavailable.'
    );
  }

  const textContent =
    (apiResult as any)?.content?.find(
      (c: any) => c.type === 'text'
    )?.text ?? '{}';

  let parsed: {
    brand?: string | null;
    name?: string | null;
    concentration?: string | null;
    confidence?: number;
    reasoning?: string;
  } = {};
  try {
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : textContent);
  } catch {
    parsed = { confidence: 0, reasoning: 'Failed to parse response' };
  }

  // Label-reader fallback
  let labelReader: LabelReaderParsed | null = null;
  const lrRaw = (apiResult as any).label_reader;
  if (lrRaw) {
    try {
      const lrText =
        lrRaw?.content?.find((c: any) => c.type === 'text')?.text ?? '{}';
      const lrMatch = lrText.match(/\{[\s\S]*\}/);
      const lrParsed = JSON.parse(lrMatch ? lrMatch[0] : lrText);
      const lrConf =
        typeof lrParsed.confidence === 'number' ? lrParsed.confidence : 0;
      const lrName =
        typeof lrParsed.name === 'string' ? lrParsed.name.trim() : '';
      if (lrConf >= 0.4 && lrName.length > 0) {
        labelReader = lrParsed as LabelReaderParsed;
      }
    } catch {
      // Silent — label-reader is a bonus.
    }
  }

  const effectiveBrand =
    parsed.brand && parsed.brand.length > 0
      ? parsed.brand
      : labelReader?.brand ?? null;
  const effectiveName =
    parsed.name && parsed.name.length > 0
      ? parsed.name
      : labelReader?.name ?? null;

  // ── Catalog matching ──
  let matchedFragranceId: string | null = null;
  let matchedBrand: string | null = null;
  let matchedName: string | null = null;
  let matchedConcentration: string | null = null;

  if (effectiveBrand && effectiveName) {
    const { data } = await supabase
      .from('fragrances')
      .select('id, name, concentration, brands!inner(name)')
      .ilike('brands.name', `%${effectiveBrand}%`)
      .ilike('name', `%${effectiveName}%`)
      .limit(20);

    if (data && data.length > 0) {
      const match = data[0] as any;
      matchedFragranceId = match.id;
      matchedBrand = match.brands?.name ?? effectiveBrand;
      matchedName = match.name;
      matchedConcentration = match.concentration ?? null;
    } else {
      // Fallback: brand-only match
      const { data: brandData } = await supabase
        .from('fragrances')
        .select('id, name, concentration, brands!inner(name)')
        .ilike('brands.name', `%${effectiveBrand}%`)
        .limit(1);
      if (brandData && brandData.length > 0) {
        const match = brandData[0] as any;
        matchedFragranceId = match.id;
        matchedBrand = match.brands?.name ?? effectiveBrand;
        matchedName = match.name;
        matchedConcentration = match.concentration ?? null;
      }
    }
  }

  track(EVENTS.SCAN_COMPLETED, {
    method: 'concierge',
    frame_count: uris.length,
    fragrance_id: matchedFragranceId,
    raw_brand: parsed.brand ?? null,
    raw_name: parsed.name ?? null,
    confidence: parsed.confidence ?? 0,
  });

  // ── Persist scan ──
  let scanId: string | null = null;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Upload scan image to storage
    const primaryBase64 = images[0]?.base64 ?? '';
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
    const filePath = user
      ? `${user.id}/${fileName}`
      : `anonymous/${fileName}`;

    let imageUrl: string | null = null;
    try {
      // Convert base64 to Uint8Array for upload
      const binaryStr = atob(primaryBase64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      await supabase.storage
        .from('scan-uploads')
        .upload(filePath, bytes.buffer, {
          contentType: 'image/jpeg',
        });
      const { data: urlData } = supabase.storage
        .from('scan-uploads')
        .getPublicUrl(filePath);
      imageUrl = urlData.publicUrl;
    } catch {
      // Non-blocking — scan still works without image persistence.
    }

    const { data: scanRow } = await supabase
      .from('scan_images')
      .insert({
        user_id: user?.id ?? null,
        device_id: deviceId,
        scan_method: 'concierge',
        image_url: imageUrl,
        identified_fragrance_id: matchedFragranceId,
        confidence: parsed.confidence ?? null,
        user_confirmed: false,
        raw_llm_response: {
          ...(apiResult as Record<string, unknown>),
          frame_count: uris.length,
        },
      })
      .select('id')
      .single();
    scanId = (scanRow?.id as string) ?? null;
  } catch {
    console.warn('Failed to save scan data');
  }

  // Always route to confirm_personal — every scan gets a confirm screen.
  const routeTo: 'default' | 'confirm_personal' = 'confirm_personal';

  return {
    fragranceId: matchedFragranceId,
    scanId,
    displayBrand: matchedBrand ?? effectiveBrand ?? 'Unknown',
    displayName: matchedName ?? effectiveName ?? 'Unknown',
    displayConcentration:
      matchedConcentration ?? parsed.concentration ?? null,
    confidence: parsed.confidence ?? 0,
    reasoning: parsed.reasoning ?? '',
    aiBrand: effectiveBrand ?? '',
    aiName: effectiveName ?? '',
    aiConcentration:
      typeof parsed.concentration === 'string'
        ? parsed.concentration
        : null,
    rawResponse: apiResult as Record<string, unknown>,
    routeTo,
    labelReader,
  };
}

// ── describeBottle ──

export async function describeBottle(
  description: string
): Promise<IdentifyResult> {
  if (!isSupabaseConfigured) {
    throw new Error('Sign in to use the Perfume Concierge.');
  }

  const text = description.trim();
  if (!text) throw new Error('Description is required');
  if (text.length > 1000)
    throw new Error('Description too long (max 1000 characters)');

  const deviceId = await getDeviceId();

  const { data: apiResult, error: invokeError } =
    await supabase.functions.invoke('identify-bottle', {
      body: { mode: 'describe', description: text, device_id: deviceId },
    });

  if (invokeError) {
    const status = (invokeError as any)?.context?.status;
    if (status === 401)
      throw new Error('Please sign in again and try again.');
    if (status === 429)
      throw new Error(
        "You've hit the scan limit. Upgrade to Pro for unlimited."
      );
    throw new Error(
      'Fragrance identification is temporarily unavailable. Please try again later.'
    );
  }

  if (!apiResult || (apiResult as any).error) {
    throw new Error(
      (apiResult as any)?.error ??
        'Fragrance identification is temporarily unavailable.'
    );
  }

  const textContent =
    (apiResult as any)?.content?.find(
      (c: any) => c.type === 'text'
    )?.text ?? '{}';

  let parsed: {
    brand?: string | null;
    name?: string | null;
    concentration?: string | null;
    confidence?: number;
    reasoning?: string;
  } = {};
  try {
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : textContent);
  } catch {
    parsed = { confidence: 0, reasoning: 'Failed to parse response' };
  }

  // Catalog matching (same as identifyBottle)
  let matchedFragranceId: string | null = null;
  let matchedBrand: string | null = null;
  let matchedName: string | null = null;
  let matchedConcentration: string | null = null;

  if (parsed.brand && parsed.name) {
    const { data } = await supabase
      .from('fragrances')
      .select('id, name, concentration, brands!inner(name)')
      .ilike('brands.name', `%${parsed.brand}%`)
      .ilike('name', `%${parsed.name}%`)
      .limit(20);

    if (data && data.length > 0) {
      const match = data[0] as any;
      matchedFragranceId = match.id;
      matchedBrand = match.brands?.name ?? parsed.brand;
      matchedName = match.name;
      matchedConcentration = match.concentration ?? null;
    }
  }

  track(EVENTS.SCAN_COMPLETED, {
    method: 'describe',
    frame_count: 0,
    fragrance_id: matchedFragranceId,
    raw_brand: parsed.brand ?? null,
    raw_name: parsed.name ?? null,
    confidence: parsed.confidence ?? 0,
  });

  // Persist scan_images row
  let scanId: string | null = null;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: scanRow } = await supabase
      .from('scan_images')
      .insert({
        user_id: user?.id ?? null,
        device_id: deviceId,
        scan_method: 'describe',
        image_url: null,
        identified_fragrance_id: matchedFragranceId,
        confidence: parsed.confidence ?? null,
        user_confirmed: false,
        raw_llm_response: {
          ...(apiResult as Record<string, unknown>),
          description: text,
        },
      })
      .select('id')
      .single();
    scanId = (scanRow?.id as string) ?? null;
  } catch {
    console.warn('Failed to save describe scan data');
  }

  return {
    fragranceId: matchedFragranceId,
    scanId,
    displayBrand: matchedBrand ?? parsed.brand ?? 'Unknown',
    displayName: matchedName ?? parsed.name ?? 'Unknown',
    displayConcentration:
      matchedConcentration ?? parsed.concentration ?? null,
    confidence: parsed.confidence ?? 0,
    reasoning: parsed.reasoning ?? '',
    aiBrand: typeof parsed.brand === 'string' ? parsed.brand : '',
    aiName: typeof parsed.name === 'string' ? parsed.name : '',
    aiConcentration:
      typeof parsed.concentration === 'string'
        ? parsed.concentration
        : null,
    rawResponse: apiResult as Record<string, unknown>,
    routeTo: 'confirm_personal',
    labelReader: null,
  };
}

// ── findBottleDeeper ──

export async function findBottleDeeper(input: {
  displayName: string;
  brand: string;
  name: string;
  concentration: string | null;
  confidence: number;
  reasoning: string;
}): Promise<DeeperResult | null> {
  if (!isSupabaseConfigured) return null;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;

  const deviceId = await getDeviceId();

  const { data, error } = await supabase.functions.invoke(
    'find-bottle-deeper',
    {
      body: {
        brand: input.brand,
        name: input.name,
        concentration: input.concentration,
        confidence: input.confidence,
        reasoning: input.reasoning,
        device_id: deviceId,
      },
    }
  );

  if (error) {
    track(EVENTS.SCAN_COMPLETED, {
      method: 'find_deeper_failed',
      reason: (error as any)?.message ?? 'unknown',
    });
    return null;
  }

  const raw = (data ?? null) as {
    candidate?: DeeperCandidate;
    source?: 'catalog' | 'generated';
    confidence?: number;
    reasoning?: string;
  } | null;
  if (!raw || !raw.candidate || !raw.source) return null;

  // Re-resolve catalog fragrance ID if source is catalog
  let catalogFragranceId: string | null = null;
  if (raw.source === 'catalog') {
    const { data: row } = await supabase
      .from('fragrances')
      .select('id, brands!inner(name)')
      .ilike('brands.name', `%${raw.candidate.brand}%`)
      .ilike('name', `%${raw.candidate.name}%`)
      .limit(1)
      .maybeSingle();
    catalogFragranceId = (row?.id as string) ?? null;
  }

  return {
    candidate: raw.candidate,
    source: raw.source,
    catalogFragranceId,
    confidence: raw.confidence ?? 0,
    reasoning: raw.reasoning ?? '',
  };
}
