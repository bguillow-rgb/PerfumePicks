// Standalone Supabase client pointed at the Pour Picks "feedback" hub — the
// shared inbox for the whole Picks family of apps. Deliberately independent of
// this app's own Supabase/backend (which may be a different project, or mock),
// so the feedback channel works regardless of how this app is wired.
//
// The publishable (anon) key is public by design — it already ships in every
// app's bundle. It's kept as a plaintext constant on purpose: secret-visibility
// EXPO_PUBLIC_* vars get stripped from OTA updates, which would silently break
// the channel on the next OTA. A plaintext constant survives OTA.
//
// One poller (on the founder's machine) reads this table and iMessages each
// row, tagged by `app`, so all apps surface into a single inbox.

import { createClient } from '@supabase/supabase-js';

const HUB_URL = 'https://nqnigdqkcvrziwcbgily.supabase.co';
const HUB_ANON_KEY = 'sb_publishable_UpINaQssccF9gF-PNo0ZwA_Ult0KxoF';

export const feedbackHub = createClient(HUB_URL, HUB_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
