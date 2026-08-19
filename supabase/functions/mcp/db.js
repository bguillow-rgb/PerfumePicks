// Deno shim for the compiled stdio core (fragrances.js imports "./db.js").
// Least privilege: the public query surface runs on the anon key under RLS;
// the service key is confined to wardrobe_items (trending's user-scoped
// aggregate) via a routing proxy, so the core code stays identical to the
// tested npm-package build.
import { PostgrestClient } from "npm:@supabase/postgrest-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? SERVICE_KEY;

const mk = (k) =>
  new PostgrestClient(`${SUPABASE_URL}/rest/v1`, {
    headers: { apikey: k, Authorization: `Bearer ${k}` },
  });

const anon = mk(ANON_KEY);
const admin = mk(SERVICE_KEY);

export const hasServiceKey = true;

export const supabase = {
  from: (table) => (table === "wardrobe_items" ? admin : anon).from(table),
};

// The core never calls checkRateLimit in the Edge build (per-IP limiting
// happens in index.ts), but export a no-op for import compatibility.
export function checkRateLimit() {}
