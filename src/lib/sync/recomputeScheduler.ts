/**
 * Living-DNA recompute scheduler — a tiny decoupled debouncer (PRD §7.3).
 *
 * Signal sources (swipe / wear / wardrobe stores, the train screen, app
 * foreground) need to ask for a DNA recompute, but they must NOT import the
 * heavy orchestrator (useAppSync → stores → catalog) — that would create import
 * cycles. Instead they call `scheduleLivingDnaRecompute(trigger)`, and useAppSync
 * registers the actual worker once at module load via `registerLivingDnaRecompute`.
 *
 * The debounce coalesces a burst of signals (a swipe session = dozens of records)
 * into ONE recompute. The newest trigger label wins — it's only used for
 * telemetry, so last-write is fine.
 */

export type RecomputeTrigger =
  | 'swipe'
  | 'wear'
  | 'wardrobe'
  | 'session_end'
  | 'foreground'
  | 'migration';

export const RECOMPUTE_DEBOUNCE_MS = 1000;

type Worker = (trigger: RecomputeTrigger) => void | Promise<void>;

let worker: Worker | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let pendingTrigger: RecomputeTrigger | null = null;

/** useAppSync registers the real recompute worker once, at module load. */
export function registerLivingDnaRecompute(fn: Worker): void {
  worker = fn;
}

function fire(): void {
  timer = null;
  const trigger = pendingTrigger ?? 'swipe';
  pendingTrigger = null;
  if (worker) void worker(trigger);
}

/** Ask for a debounced recompute. Coalesces a burst into one run. */
export function scheduleLivingDnaRecompute(trigger: RecomputeTrigger): void {
  pendingTrigger = trigger;
  if (timer) clearTimeout(timer);
  timer = setTimeout(fire, RECOMPUTE_DEBOUNCE_MS);
  // Don't let a pending recompute keep a Node process (test runner) alive.
  (timer as { unref?: () => void }).unref?.();
}

/** Test hook: run any pending recompute synchronously and clear the timer. */
export function __flushLivingDnaRecompute(): void {
  if (timer) {
    clearTimeout(timer);
    fire();
  }
}

/** Test hook: drop any pending recompute + registered worker (isolation). */
export function __resetLivingDnaRecompute(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  pendingTrigger = null;
  worker = null;
}
