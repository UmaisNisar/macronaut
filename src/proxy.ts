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

function policy(nonce: string, dev: boolean, secure: boolean): string {
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

    /*
     * Only when the page itself arrived over https.
     *
     * On a plain-http origin the directive has nothing useful to do, and it
     * actively breaks things: Chrome exempts localhost from upgrading, and
     * WebKit does not. Testing against http://localhost in WebKit, every
     * stylesheet was upgraded to https, failed with an SSL error, and the
     * page rendered with no CSS at all — which looked exactly like a
     * catastrophic Safari layout bug for about twenty minutes.
     *
     * Production is https, so nothing changes there.
     */
    ...(secure ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  // randomUUID is available in the edge runtime; Buffer is not, so the hex
  // form is used directly rather than base64-encoding it.
  const nonce = crypto.randomUUID().replace(/-/g, "");
  // Vercel terminates TLS upstream, so the header is the honest answer here.
  const secure =
    request.headers.get("x-forwarded-proto") === "https" ||
    request.nextUrl.protocol === "https:";
  const csp = policy(nonce, process.env.NODE_ENV === "development", secure);

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

    /*
     * Refresh the session, but only when it is nearly out of time.
     *
     * The documented pattern is to call getUser() here on every request, and
     * getUser() always asks the Auth API — a round trip from the function in
     * Washington to the database in Montreal, in front of every navigation,
     * including the ones where the token has fifty-nine minutes left on it.
     * A no-op request through this proxy already measured 137ms against 59ms
     * for a static file; that call sits on top of it.
     *
     * getClaims() answers the same question locally: it verifies the JWT
     * against the project's published key, which it fetches once per instance
     * and caches. So the network call now happens roughly once an hour, when
     * the token is actually close to expiring, instead of once per page.
     *
     * Erring towards refreshing: anything unreadable, unexpired-but-unknown,
     * or thrown is treated as "refresh now". A needless refresh costs a round
     * trip; a missed one signs somebody out.
     */
    const REFRESH_WITHIN_SECONDS = 120;
    let needsRefresh = true;

    try {
      const { data, error } = await supabase.auth.getClaims();
      const exp = data?.claims?.exp;
      if (!error && typeof exp === "number") {
        needsRefresh = exp - Math.floor(Date.now() / 1000) < REFRESH_WITHIN_SECONDS;
      } else if (!error && !data?.claims) {
        // Nobody is signed in. Nothing to refresh, and nothing to ask about.
        needsRefresh = false;
      }
    } catch {
      needsRefresh = true;
    }

    if (needsRefresh) {
      // Touching the user is what triggers the refresh, and what writes the
      // new cookies back through setAll above.
      await supabase.auth.getUser();
    }
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
