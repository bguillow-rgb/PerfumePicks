// In-app feedback — a private, always-on line to the founder. Writes a row to
// the shared Pour Picks "feedback" hub (see feedbackHub.ts), tagged with this
// app's APP_TAG so the single poller can route it.
//
// Context is best-effort: every lookup is wrapped so one failure (e.g. no auth
// session, demo mode) can never block the insert. A bare message still lands.

import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { isSupabaseConfigured } from '@/lib/supabase';
import { resolveCurrentUser } from '@/src/stores/useAuthStore';
import { useProStore } from '@/src/stores/useProStore';
import { feedbackHub } from './feedbackHub';

const APP_TAG = 'perfumepicks';

export type FeedbackCategory = 'bug' | 'idea' | 'love' | 'other';

/**
 * What flavor of signal this is. 'feedback' = the open channel; 'nps' = a 0-10
 * score (optionally with a comment). Both land in the same hub table.
 */
export type FeedbackKind = 'feedback' | 'nps';

export interface FeedbackInput {
  /** Optional for NPS (a score with no comment is valid). */
  message?: string;
  category?: FeedbackCategory;
  email?: string;
  kind?: FeedbackKind;
  /** NPS score 0-10. Omit for non-NPS signals. */
  rating?: number;
}

type SubmitResult = { ok: true } | { ok: false; reason: string };

async function gatherContext(): Promise<Record<string, unknown>> {
  const ctx: Record<string, unknown> = {};

  try {
    ctx.app_version = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? null;
  } catch {
    /* ignore */
  }
  try {
    ctx.build = Application.nativeBuildVersion ?? null;
  } catch {
    /* ignore */
  }
  try {
    ctx.platform = Platform.OS;
    ctx.os_version = String(Platform.Version);
  } catch {
    /* ignore */
  }
  try {
    if (isSupabaseConfigured) {
      const user = await resolveCurrentUser();
      ctx.user_id = user?.id ?? null;
    }
  } catch {
    /* ignore */
  }
  try {
    ctx.is_pro = useProStore.getState().isPro;
  } catch {
    /* ignore */
  }

  return ctx;
}

export async function submitFeedback(input: FeedbackInput): Promise<SubmitResult> {
  const message = input.message?.trim() || null;
  const hasRating = typeof input.rating === 'number';
  // Every row must carry SOMETHING — a comment, a score, or both. An NPS score
  // with no comment is valid, so this can't be a bare message check.
  if (!message && !hasRating) return { ok: false, reason: 'empty' };

  const email = input.email?.trim() || null;
  const context = await gatherContext();

  const { error } = await feedbackHub.from('feedback').insert({
    app: APP_TAG,
    kind: input.kind ?? 'feedback',
    category: input.category ?? null,
    message,
    rating: hasRating ? input.rating : null,
    email,
    ...context,
  });

  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

export interface DeadLinkReport {
  retailer: string;
  url: string;
  fragranceId: string;
  /** 'open_failed' | 'no_redirect' | 'http_404' | 'timeout' | 'network' | ... */
  reason: string;
  sourceScreen?: string;
}

/**
 * Surfaces a broken buy link to the founder immediately via the same hub that
 * powers in-app feedback (a row here iMessages the founder). Tagged kind
 * 'link_dead' so it's filterable from real user feedback. Best-effort and
 * fully swallowed — a reporting failure must never bubble into a buy tap.
 */
export async function reportDeadLink(report: DeadLinkReport): Promise<void> {
  try {
    const context = await gatherContext();
    await feedbackHub.from('feedback').insert({
      app: APP_TAG,
      kind: 'link_dead',
      category: report.retailer,
      message:
        `Dead buy link (${report.reason}) — ${report.retailer}\n` +
        `fragrance: ${report.fragranceId}\n` +
        `from: ${report.sourceScreen ?? 'unknown'}\n` +
        `${report.url}`,
      email: null,
      ...context,
    });
  } catch {
    /* never throw from a click handler */
  }
}
