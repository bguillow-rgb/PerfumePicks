import { createClient, SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Supabase client.
 *
 * In StickPicks this throws when env vars are missing — that's right for a
 * production build. For Perfume Picks, we want the app to BOOT in "demo mode"
 * even before the new Supabase project is provisioned, so designers can
 * install on a phone and review UI. When env is missing, we export a minimal
 * stub that no-ops auth + queries gracefully. Production builds will set the
 * env vars and use the real client.
 */

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const isPlaceholder = (v: string | undefined): boolean =>
  !v || v.startsWith('REPLACE_') || v === '';

export const isSupabaseConfigured = !isPlaceholder(supabaseUrl) && !isPlaceholder(supabaseAnonKey);

function makeStubClient(): SupabaseClient {
  const error = { message: 'Supabase not configured (demo mode)' } as any;
  const stubAuth = {
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: (_: any) => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signInWithIdToken: async () => ({ data: { session: null, user: null }, error }),
    signInAnonymously: async () => ({ data: { session: null, user: null }, error }),
    signOut: async () => ({ error: null }),
  };
  const stubFrom = () => ({
    select: () => stubBuilder(),
    insert: () => stubBuilder(),
    update: () => stubBuilder(),
    upsert: () => stubBuilder(),
    delete: () => stubBuilder(),
  });
  function stubBuilder(): any {
    const promise: any = Promise.resolve({ data: null, error: null });
    promise.eq = () => stubBuilder();
    promise.in = () => stubBuilder();
    promise.order = () => stubBuilder();
    promise.limit = () => stubBuilder();
    promise.single = () => Promise.resolve({ data: null, error: null });
    promise.maybeSingle = () => Promise.resolve({ data: null, error: null });
    return promise;
  }
  return { auth: stubAuth, from: stubFrom } as unknown as SupabaseClient;
}

export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : makeStubClient();
