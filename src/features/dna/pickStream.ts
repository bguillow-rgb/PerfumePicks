/**
 * Pick-stream — the durable, privacy-preserving event log of DNA picker decisions
 * (V1.1 A8). This is the raw material that LATER trains the learned/cohort journey
 * ladders (today they're editorial; see `cohortSourceFor`). On day one it only
 * *captures*; nothing reads it back into the product yet.
 *
 * Design invariants (milestone plan M10):
 *   • Idempotent writes — each row's id is a pure function of (appId, session, seq),
 *     so an offline retry re-upserts the SAME row instead of duplicating. The DB
 *     mirror uses onConflict:'id'.
 *   • Monotonic seq — per session, strictly increasing, so the stream is ORDER-
 *     recoverable without trusting wall-clock timestamps.
 *   • Pseudonymized + rotating app id — the stream is keyed to a rotating per-app
 *     id (NOT the durable device id, NOT PII), so a long-lived user isn't linkable
 *     across rotation windows.
 *   • PII strip — a row carries only fragrance ids + enums (relation/favorite/event)
 *     + the rotating id. Never names, notes, prices, free text, or the auth user id
 *     in the payload itself (the DB column references the user for deletion-cascade,
 *     but the event body is clean).
 *
 * This module is pure + UI-free + storage-free so it unit-tests in isolation; the
 * store (useDnaPickStreamStore) owns persistence, the rotating-id keychain, and the
 * Supabase mirror.
 */

import type { DnaSeed, DnaSource, SeedRelation, JourneySource } from './types';

export type PickStreamEventKind = 'pick' | 'hard_no' | 'favorite' | 'commit';

/** One privacy-clean pick-stream row. No PII — ids + enums only. */
export interface PickStreamEvent {
  /** Deterministic id = `${appId}:${session}:${seq}` → idempotent upsert key. */
  id: string;
  /** Rotating, pseudonymous per-app id (NOT the device id). */
  appId: string;
  /** Groups one picker run. */
  session: string;
  /** Monotonic within the session — recovers stream order. */
  seq: number;
  kind: PickStreamEventKind;
  /** The fragrance the event is about (catalog id), or null for run-level events. */
  fragranceId: string | null;
  relation: SeedRelation | null;
  favorite: boolean;
  source: DnaSource;
  /** Wall clock — advisory only; seq is the source of truth for order. */
  createdAt: string;
}

/** Strictly-increasing per-session sequence counter. */
export function createSeqCounter(start = 0): { next: () => number; peek: () => number } {
  let n = start;
  return {
    next: () => n++,
    peek: () => n,
  };
}

/** The deterministic, idempotent row id. Same (appId, session, seq) → same id. */
export function pickStreamId(appId: string, session: string, seq: number): string {
  return `${appId}:${session}:${seq}`;
}

/**
 * Whitelisted projection of a single seed into a clean event row. This is the PII
 * strip: it reads ONLY id/relation/favorite off the seed — anything else a caller
 * passes is dropped on the floor.
 */
export function seedToEvent(
  seed: DnaSeed,
  ctx: { appId: string; session: string; seq: number; source: DnaSource; now?: () => string },
): PickStreamEvent {
  const now = ctx.now ?? (() => new Date().toISOString());
  return {
    id: pickStreamId(ctx.appId, ctx.session, ctx.seq),
    appId: ctx.appId,
    session: ctx.session,
    seq: ctx.seq,
    kind: seed.favorite ? 'favorite' : 'pick',
    fragranceId: seed.id,
    relation: seed.relation,
    favorite: seed.favorite,
    source: ctx.source,
    createdAt: now(),
  };
}

/**
 * Build the full ordered event batch for one committed picker run: one row per
 * seed (in order), then a run-level `commit` marker. Pure — the caller supplies
 * the rotating appId + a fresh session id + a seq counter.
 */
export function buildPickStreamBatch(
  args: {
    seeds: DnaSeed[];
    source: DnaSource;
    appId: string;
    session: string;
    seq?: { next: () => number };
    now?: () => string;
  },
): PickStreamEvent[] {
  const seq = args.seq ?? createSeqCounter();
  const now = args.now ?? (() => new Date().toISOString());
  const rows: PickStreamEvent[] = [];

  for (const seed of args.seeds) {
    rows.push(
      seedToEvent(seed, { appId: args.appId, session: args.session, seq: seq.next(), source: args.source, now }),
    );
  }

  const commitSeq = seq.next();
  rows.push({
    id: pickStreamId(args.appId, args.session, commitSeq),
    appId: args.appId,
    session: args.session,
    seq: commitSeq,
    kind: 'commit',
    fragranceId: null,
    relation: null,
    favorite: false,
    source: args.source,
    createdAt: now(),
  });

  return rows;
}

/** The Supabase row shape for `dna_picker_events` (snake_case, cascade-keyed). */
export interface PickStreamRow {
  id: string;
  app_id: string;
  session_id: string;
  seq: number;
  kind: PickStreamEventKind;
  fragrance_id: string | null;
  relation: SeedRelation | null;
  favorite: boolean;
  source: DnaSource;
  created_at: string;
}

/** Map a clean event → the DB row. `user_id` is added by the store at write time. */
export function eventToRow(e: PickStreamEvent): PickStreamRow {
  return {
    id: e.id,
    app_id: e.appId,
    session_id: e.session,
    seq: e.seq,
    kind: e.kind,
    fragrance_id: e.fragranceId,
    relation: e.relation,
    favorite: e.favorite,
    source: e.source,
    created_at: e.createdAt,
  };
}

// ── Rotating pseudonymous app id ─────────────────────────────────────────────

/** Default rotation window: 30 days. After this the app id is re-minted. */
export const APP_ID_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface RotatingAppId {
  value: string;
  issuedAt: number;
}

/** Whether a stored app id has aged past its rotation window. */
export function shouldRotateAppId(issuedAt: number, now: number, ttl = APP_ID_TTL_MS): boolean {
  return now - issuedAt >= ttl;
}

/**
 * Return the current app id, rotating it (via `mint`) when missing or expired.
 * Pure: the store passes in the persisted value + clock + a uuid minter.
 */
export function resolveAppId(
  prev: RotatingAppId | null,
  now: number,
  mint: () => string,
  ttl = APP_ID_TTL_MS,
): RotatingAppId {
  if (!prev || shouldRotateAppId(prev.issuedAt, now, ttl)) {
    return { value: mint(), issuedAt: now };
  }
  return prev;
}

// ── Cohort flip stub ─────────────────────────────────────────────────────────

/**
 * Per-ladder cohort-readiness. At launch this is EMPTY — every ladder is still
 * editorial. When the captured pick-stream has trained a ladder, its id flips to
 * true here and `cohortSourceFor` starts reporting `"cohort"`. The plumbing exists
 * now so the flip is a data change, not a code change.
 */
export const COHORT_READY: Readonly<Record<string, boolean>> = Object.freeze({});

/** The journey source for a ladder: cohort once trained, editorial until then. */
export function cohortSourceFor(
  ladderId: string,
  ready: Readonly<Record<string, boolean>> = COHORT_READY,
): JourneySource {
  return ready[ladderId] ? 'cohort' : 'editorial';
}
