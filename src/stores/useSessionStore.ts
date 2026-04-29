import { create } from 'zustand';

/**
 * Holds the current auth session's user ID so Zustand store actions can
 * fire Supabase writes as side effects without prop-drilling or async
 * session lookups inside synchronous set() calls.
 *
 * Set by _layout.tsx's onSession handler. Read via getState() in store
 * actions (not a hook — no re-renders needed there).
 */
interface SessionState {
  userId: string | null;
  isAnonymous: boolean;
  email: string | null;
  setSession: (userId: string | null, isAnonymous: boolean, email?: string | null) => void;
  clearSession: () => void;
}

export const useSessionStore = create<SessionState>()((set) => ({
  userId: null,
  isAnonymous: false,
  email: null,
  setSession: (userId, isAnonymous, email = null) => set({ userId, isAnonymous, email }),
  clearSession: () => set({ userId: null, isAnonymous: false, email: null }),
}));
