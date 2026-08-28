import { cache } from "react";
import { redirect } from "next/navigation";

import { isSupabaseConfigured, SOLO_USER_ID } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createLocalStore } from "@/lib/db/local";
import { createSupabaseStore } from "@/lib/db/supabase";
import type { DataStore } from "@/lib/db/store";

export type Session = {
  userId: string;
  email: string | null;
  /** Display name from the OAuth provider, when it gave us one. */
  name: string | null;
  mode: "supabase" | "solo";
};

/** Solo mode has exactly one pilot and no sign-in wall. */
const SOLO_SESSION: Session = {
  userId: SOLO_USER_ID,
  email: null,
  name: null,
  mode: "solo",
};

export const getSession = cache(async (): Promise<Session | null> => {
  if (!isSupabaseConfigured) return SOLO_SESSION;

  const sb = await getSupabaseServerClient();
  if (!sb) return SOLO_SESSION;

  // getClaims() verifies the JWT signature in-process against the project's
  // published ES256 public key, which it fetches once and caches. getUser()
  // asks the Auth API to do the same thing over the network, and that round
  // trip sat on the critical path of *every* navigation before any data query
  // could start. Same guarantee, one less hop.
  const { data, error } = await sb.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;

  const meta = (claims.user_metadata ?? {}) as Record<string, unknown>;
  const name =
    typeof meta.full_name === "string"
      ? meta.full_name
      : typeof meta.name === "string"
        ? meta.name
        : null;

  return {
    userId: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    name,
    mode: "supabase",
  };
});

export const getStore = cache(async (): Promise<DataStore> => {
  if (!isSupabaseConfigured) return createLocalStore();
  const sb = await getSupabaseServerClient();
  if (!sb) return createLocalStore();
  return createSupabaseStore(sb);
});

/**
 * Deduped per request. The layout and the page both need the profile and they
 * render in parallel, so without cache() every navigation issued the same query
 * twice — and each one is a round trip from the function region to the database
 * region, which is not free.
 */
export const getCurrentProfile = cache(
  async (): Promise<Awaited<ReturnType<DataStore["getProfile"]>>> => {
    const session = await getSession();
    if (!session) return null;
    const store = await getStore();
    return store.getProfile(session.userId);
  },
);

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/welcome");
  return session;
}

/**
 * Everything a page needs to *start* querying: who, and where from.
 *
 * The user id comes out of the JWT, which is verified in-process, so it is
 * known before any database round trip has happened. That matters more than
 * it sounds: requireProfile below fetches the profile and only then does the
 * page fire its own queries, which is two round trips in series — and the
 * functions run in Washington while the database sits in Montreal, so each
 * one is a border crossing. The page's queries only ever needed the id, so
 * they can go at the same time as the profile rather than after it.
 */
export async function requireUser(): Promise<{
  session: Session;
  store: DataStore;
}> {
  const session = await requireSession();
  const store = await getStore();
  return { session, store };
}

/**
 * The profile, as a promise to be awaited alongside a page's own queries.
 *
 * Redirects exactly as requireProfile does; throwing NEXT_REDIRECT from
 * inside a Promise.all propagates the same way it would anywhere else.
 */
export async function onboardedProfile(): Promise<
  NonNullable<Awaited<ReturnType<DataStore["getProfile"]>>>
> {
  const profile = await getCurrentProfile();
  if (!profile?.onboardedAt) redirect("/onboarding");
  return profile;
}

/**
 * Session + store + profile for an app page.
 *
 * Pages render in parallel with their layout, so the layout's onboarding
 * redirect is not a guarantee the page can rely on — a signed-in user with no
 * profile row yet would otherwise crash on a non-null assertion. Every page
 * under (app) goes through this.
 */
export async function requireProfile(): Promise<{
  session: Session;
  store: DataStore;
  profile: NonNullable<Awaited<ReturnType<DataStore["getProfile"]>>>;
}> {
  const session = await requireSession();
  const store = await getStore();
  const profile = await getCurrentProfile();
  if (!profile?.onboardedAt) redirect("/onboarding");
  return { session, store, profile };
}
