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
  // Always use the deterministic fallback — it's specific to the fragrance
  // and more useful than generic server messages like "AI temporarily unavailable."
  return {
    text: resp.text,
    fallback: deterministic_fallback(params.fragrance_context),
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
/**
 * Parse a JSON object out of model text.
 *
 * WHY THIS IS NOT JSON.parse: a bare JSON.parse on model output is brittle, and
 * on 2026-08-29 it was silently breaking every bottle scan. The proxy was
 * returning a valid 107-char answer (confirmed server-side: Anthropic 200, usage
 * recorded, response sent) and the app still showed "Add it manually", because
 * the model wrapped its JSON in a ```json fence — so JSON.parse threw, the catch
 * returned confidence 0, and scan.tsx renders anything under 0.5 as no-match.
 * Backend success and an unreadable photo looked identical to the user.
 *
 * Strips a markdown fence, then falls back to the outermost {...} span so
 * leading prose ("Here's the bottle:") can't break it either.
 */
export function parseModelJson<T>(raw: string): T | null {
  if (!raw) return null;
  let t = raw.trim();
  // ```json ... ```  or  ``` ... ```
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) t = fence[1].trim();
  try {
    return JSON.parse(t) as T;
  } catch {
    // Last resort: the outermost object literal anywhere in the text.
    const a = t.indexOf('{');
    const b = t.lastIndexOf('}');
    if (a !== -1 && b > a) {
      try { return JSON.parse(t.slice(a, b + 1)) as T; } catch { /* fall through */ }
    }
    return null;
  }
}

export async function scanBottle(params: BottleScanParams): Promise<{ brand: string | null; name: string | null; confidence: number }> {
  const resp = await callProxy({ type: 'bottle_scan', ...params });
  const parsed = resp.text
    ? parseModelJson<{ brand?: string | null; name?: string | null; confidence?: number | string }>(resp.text)
    : null;
  if (!parsed) {
    // Distinguish "the model said nothing usable" from "we could not read its
    // reply" — the second is our bug and must be visible, not silently a
    // no-match. captureException gives it a Sentry trail either way.
    if (resp.text) {
      captureException(new Error('scanBottle: unparseable model output'), {
        context: 'claude_proxy',
        text_head: String(resp.text).slice(0, 200),
      });
    }
    return { brand: null, name: null, confidence: 0 };
  }
  // Confidence occasionally arrives as a string ("0.9"); coerce before compare.
  const confidence = Number(parsed.confidence ?? 0);
  return {
    brand: parsed.brand ?? null,
    name: parsed.name ?? null,
    confidence: Number.isFinite(confidence) ? confidence : 0,
  };
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
