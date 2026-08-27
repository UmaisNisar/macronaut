import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Where Google (via Supabase) drops the user back.
 *
 * Supabase sends a one-time `code`; exchanging it here — on the server — is
 * what writes the auth cookies. Anything that goes wrong sends the user back to
 * the landing page with a readable reason rather than a blank screen.
 */
export const dynamic = "force-dynamic";

function resolveOrigin(request: Request, fallback: string): string {
  // Behind a proxy (Vercel) the request URL is the internal http:// one, so the
  // forwarded headers are the only reliable source of the public origin.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedHost) {
    return `${forwardedProto ?? "https"}://${forwardedHost}`;
  }
  return fallback;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = resolveOrigin(request, url.origin);

  const bounce = (message: string) =>
    NextResponse.redirect(
      `${origin}/welcome?error=${encodeURIComponent(message)}`,
    );

  const providerError =
    url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (providerError) return bounce(providerError);

  const code = url.searchParams.get("code");
  if (!code) return bounce("Google did not send a sign-in code back.");

  const supabase = await getSupabaseServerClient();
  if (!supabase) return bounce("Sign-in is not configured on this install.");

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return bounce(error.message);

  // "/" decides between onboarding and today based on whether a profile exists.
  const next = url.searchParams.get("next");
  const safeNext = next && next.startsWith("/") ? next : "/";
  return NextResponse.redirect(`${origin}${safeNext}`);
}
