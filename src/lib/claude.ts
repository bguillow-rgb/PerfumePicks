/**
 * Client-side Claude API wrapper.
 *
 * All calls go through the claude-proxy Edge Function — the API key
 * never ships in the binary. The proxy handles cost guards, model
 * routing, and usage tracking.
 *
 * Returns the AI-generated text or null (with a fallback message)
 * when guards trip or the API errors.
 */

import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { captureException } from '@/src/lib/observability';

interface ClaudeResponse {
  text: string | null;
  fallback?: string;
  model?: string;
  tokens?: { input: number; output: number };
}

interface WhyThisParams {
  taste_profile: Record<string, unknown>;
  fragrance_context: Record<string, unknown>;
}

interface MorningPickParams {
  taste_profile: Record<string, unknown>;
  fragrance_context: Record<string, unknown>;
  wear_history: Record<string, unknown>[];
}

interface BottleScanParams {
  image_base64: string;
}

/**
 * "Why this?" explanation for a recommendation card.
 * Uses Haiku for speed + cost. Returns null + fallback on failure.
 */
export async function getWhyThis(params: WhyThisParams): Promise<{ text: string | null; fallback: string }> {
  const resp = await callProxy({ type: 'why_this', ...params });
  return {
    text: resp.text,
    fallback: resp.fallback ?? deterministic_fallback(params.fragrance_context),
  };
}

/**
 * AI-powered morning pick suggestion.
 * Uses Haiku. Returns null + fallback on failure.
 */
export async function getMorningPick(params: MorningPickParams): Promise<{ text: string | null; fallback: string }> {
  const resp = await callProxy({ type: 'morning_pick', ...params });
  return {
    text: resp.text,
    fallback: resp.fallback ?? 'Based on your recent wears and preferences.',
  };
}

/**
 * Bottle scan identification.
 * Uses Sonnet (vision). Returns parsed JSON or null.
 */
export async function scanBottle(params: BottleScanParams): Promise<{ brand: string | null; name: string | null; confidence: number }> {
  const resp = await callProxy({ type: 'bottle_scan', ...params });
  if (resp.text) {
    try {
      return JSON.parse(resp.text);
    } catch {
      return { brand: null, name: null, confidence: 0 };
    }
  }
  return { brand: null, name: null, confidence: 0 };
}

// ── Internal ──

async function callProxy(body: Record<string, unknown>): Promise<ClaudeResponse> {
  if (!isSupabaseConfigured) {
    return { text: null, fallback: 'AI features require sign-in.' };
  }

  try {
    const { data, error } = await supabase.functions.invoke('claude-proxy', {
      body,
    });

    if (error) {
      captureException(error, { context: 'claude_proxy' });
      return { text: null, fallback: 'AI temporarily unavailable.' };
    }

    return data as ClaudeResponse;
  } catch (e) {
    captureException(e as Error, { context: 'claude_proxy' });
    return { text: null, fallback: 'AI temporarily unavailable.' };
  }
}

/**
 * Deterministic fallback when AI is unavailable.
 * Generates a generic but specific-enough explanation from the fragrance data.
 */
function deterministic_fallback(fragrance: Record<string, unknown>): string {
  const accords = (fragrance.top_accords as string[]) ?? [];
  const family = fragrance.fragrance_family as string ?? '';
  if (accords.length > 0) {
    return `Matches your taste for ${accords.slice(0, 2).join(' and ')} fragrances.`;
  }
  if (family) {
    return `A ${family.toLowerCase()} fragrance that aligns with your profile.`;
  }
  return 'Selected based on your taste profile.';
}
