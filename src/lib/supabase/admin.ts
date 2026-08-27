import "server-only";

import { createClient } from "@supabase/supabase-js";

import { supabaseUrl } from "@/lib/env";

/**
 * A client that bypasses row-level security.
 *
 * Exactly one caller needs this: the reminder cron, which by definition has no
 * signed-in user and has to read across accounts to find who to nudge. It is
 * never constructed in a request handled on behalf of a person, and the key it
 * uses is server-only — if it ever reached the browser, RLS would be over.
 */
export function createSupabaseAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !key) return null;

  return createClient(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
