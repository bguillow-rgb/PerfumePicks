// In-app feedback — a private, always-on line to the founder. Writes a row to
// the shared Pour Picks "feedback" hub (see feedbackHub.ts), tagged with this
// app's APP_TAG so the single poller can route it.
//
// Context is best-effort: every lookup is wrapped so one failure (e.g. no auth
// session, demo mode) can never block the insert. A bare message still lands.

import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useProStore } from '@/src/stores/useProStore';
import { feedbackHub } from './feedbackHub';

const APP_TAG = 'perfumepicks';

export type FeedbackCategory = 'bug' | 'idea' | 'love' | 'other';

export interface FeedbackInput {
  message?: string;
  category?: FeedbackCategory;
  email?: string;
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
      const { data } = await supabase.auth.getUser();
      ctx.user_id = data.user?.id ?? null;
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
  if (!message) return { ok: false, reason: 'empty' };

  const email = input.email?.trim() || null;
  const context = await gatherContext();

  const { error } = await feedbackHub.from('feedback').insert({
    app: APP_TAG,
    kind: 'feedback',
    category: input.category ?? null,
    message,
    email,
    ...context,
  });

  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}
