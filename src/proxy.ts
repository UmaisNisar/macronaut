import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/env";

/**
 * Next 16 renamed Middleware to Proxy. Two jobs run here, and both have to
 * happen before a page renders.
 *
 * 1. Refresh the Supabase auth cookie, so Server Components never see a
 *    silently expired session.
 * 2. Issue a Content-Security-Policy carrying a fresh nonce. Next reads that
 *    nonce off the *request* header and stamps it onto the script tags it
 *    emits, which is the only way an inline bootstrap script and a strict
 *    policy can coexist.
 */

/** Where the browser is allowed to talk to. Empty in solo mode. */
function apiOrigin(): string {
  try {
    return supabaseUrl ? new URL(supabaseUrl).origin : "";
  } catch {
    return "";
  }
}

function policy(nonce: string, dev: boolean): string {
  const connect = ["'self'", apiOrigin()].filter(Boolean).join(" ");

  return [
    "default-src 'self'",

    /*
     * Deliberately not 'strict-dynamic'.
     *
     * strict-dynamic is the stronger form, but it makes the browser ignore
     * 'self' entirely, so every script must either carry the nonce or be
     * loaded by one that does. Vercel's analytics and speed-insights
     * components inject plain script tags and offer no way to pass a nonce
     * through, so turning it on would silently switch off analytics.
     *
     * 'self' is a narrow allowlist here regardless: this origin serves no
     * user-supplied files, so there is nothing on it for an attacker to point
     * a script tag at. Inline script is still refused unless nonced.
     *
     * React uses eval in development to rebuild server stacks in the browser.
     * It does not in production.
     */
    `script-src 'self' 'nonce-${nonce}'${dev ? " 'unsafe-eval'" : ""}`,

    /*
     * unsafe-inline is unavoidable for styles. Motion animates by writing
     * style attributes on elements every frame, and style-src-attr inherits
     * from here — without it every animation in the app stops. CSS injection
     * is a far smaller problem than script injection, and the nonce still
     * governs anything that can execute.
     */
    "style-src 'self' 'unsafe-inline'",

    // data: for the downscaled photo before it is sent, blob: for the camera.
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self'",
    `connect-src ${connect}`,
    "worker-src 'self'",
    "manifest-src 'self'",

    // Nothing here embeds anything, and nothing should embed this.
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",

    // Stops an injected <base> redirecting every relative URL on the page.
    "base-uri 'self'",
    // A form posting a session cookie anywhere but back here is never right.
    "form-action 'self'",

    "upgrade-insecure-requests",
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  // randomUUID is available in the edge runtime; Buffer is not, so the hex
  // form is used directly rather than base64-encoding it.
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const csp = policy(nonce, process.env.NODE_ENV === "development");

  /*
   * Rebuilt on each call rather than captured once: Supabase's setAll writes
   * refreshed tokens back onto the request's cookie jar, and a Headers object
   * snapshotted before that would carry the stale cookie into the render.
   */
  const forward = () => {
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    headers.set("content-security-policy", csp);
    return NextResponse.next({ request: { headers } });
  };

  let response = forward();

  if (isSupabaseConfigured) {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(toSet) {
          for (const { name, value } of toSet) {
            request.cookies.set(name, value);
          }
          response = forward();
          for (const { name, value, options } of toSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    });

    // Touching the user is what triggers the refresh. Do not remove it, and do
    // not put anything between creating the client and this call.
    await supabase.auth.getUser();
  }

  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files — auth cookies are only
     * relevant to actual page and action requests.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
