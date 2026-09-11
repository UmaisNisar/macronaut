import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/env";
import { createResilientFetch } from "@/lib/supabase/resilient-fetch";

/**
 * Request-scoped Supabase client. Returns null in solo mode so callers can
 * fall back to the local store without a try/catch dance.
 */
export async function getSupabaseServerClient() {
  if (!isSupabaseConfigured) return null;

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    // Reads retry through transient Supabase failures; writes deliberately do
    // not. See resilient-fetch for what the error log said about both.
    global: { fetch: createResilientFetch() },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component: middleware refreshes the session
          // instead, so silently ignoring this is correct.
        }
      },
    },
  });
}
