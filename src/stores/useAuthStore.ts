import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * Shared auth source of truth.
 *
 * The app has exactly ONE Supabase auth subscription — `getSession()` +
 * `onAuthStateChange` in app/_layout.tsx. That callback already knows the
 * current session; this store simply re-publishes it so the rest of the app can
 * read "who is signed in" WITHOUT each screen making its own
 * `supabase.auth.getUser()` network round-trip (the GoTrue `/user` endpoint).
 *
 * Before this store, ~17 call sites each called getUser() independently — e.g.
 * the Profile screen fired it twice on mount (ProfileScreen + BadgesSection).
 * Now they read `user`/`getCurrentUser()` here, which is already in memory.
 *
 * `loading` stays true until the first session resolves (getSession returns, or
 * demo mode is detected in _layout). Nothing subscribes here directly — the
 * store is fed exclusively from _layout's single subscription.
 */
interface AuthState {
  session: Session | null;
  user: User | null;
  /** Guests / anonymous sessions have a session but is_anonymous === true. */
  isAnonymous: boolean;
  /** True until the first session resolves. */
  loading: boolean;
  setSession: (session: Session | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  isAnonymous: false,
  loading: true,
  setSession: (session) =>
    set({
      session,
      user: session?.user ?? null,
      isAnonymous: !!session?.user?.is_anonymous,
      loading: false,
    }),
}));

/**
 * Synchronous current-user read for effects, event handlers, and imperative
 * code that runs after auth has resolved (the common case). Returns null when
 * signed out or in demo mode.
 */
export function getCurrentUser(): User | null {
  return useAuthStore.getState().user;
}

/**
 * Async current-user resolver with a network fallback. Returns the store's user
 * immediately once auth has resolved. ONLY if the store is still cold (the app
 * just launched and the first session hasn't landed) does it fall back to a
 * one-off `supabase.auth.getUser()` — preserving the exact pre-refactor behavior
 * for background/imperative code that can run before the store hydrates.
 */
export async function resolveCurrentUser(): Promise<User | null> {
  const state = useAuthStore.getState();
  if (!state.loading) return state.user;
  if (!isSupabaseConfigured) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
