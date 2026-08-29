import type { Instrumentation } from "next";

/**
 * Every server-side error, in the table.
 *
 * Next calls this for anything it catches on the server — a Server Component
 * that throws while rendering, a route handler, a Server Action, the proxy.
 * Before this existed the only server errors ever written down were three
 * deliberate `recordError` calls around AI fallbacks; a genuine crash went to
 * a platform console nobody reads and was invisible from inside the app.
 *
 * Two deliberate choices:
 *
 * The row is written with the service-role client, because an error is exactly
 * the moment when the request's own Supabase client may be the broken thing.
 *
 * `user_id` is left null rather than guessed. The signed-in user could be read
 * out of the auth cookie, but verifying the token here means a network call on
 * a path that is already failing, and trusting it unverified means a log where
 * attribution can be forged. Client-side errors already arrive attributed
 * through /api/report-error, which is authenticated; these are the operator's
 * copy.
 *
 * Nothing in here may throw. An error reporter that fails during error
 * reporting is how a small problem becomes a loop.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context,
) => {
  try {
    const message =
      err instanceof Error ? err.message : String(err ?? "unknown error");

    // Next docs: React may replace the thrown value during RSC rendering, and
    // the digest is what ties this row to what the user was shown.
    const digest =
      typeof err === "object" && err !== null && "digest" in err
        ? String((err as { digest?: unknown }).digest)
        : undefined;

    const detail = [
      err instanceof Error && err.stack ? err.stack : null,
      digest ? `digest ${digest}` : null,
      `${context.routerKind} ${context.routeType} ${context.routePath}`,
      request.method,
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 4000);

    // Always leave a trace the platform log can show, even if the write fails.
    console.error(`[macronaut] ${context.routeType} error on ${request.path}:`, err);

    const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
    const admin = createSupabaseAdminClient();
    if (!admin) return; // solo mode, or no service key: the console line stands

    await admin.from("error_log").insert({
      user_id: null,
      source: "server",
      kind: context.routeType,
      message: message.slice(0, 500),
      detail,
      path: request.path.slice(0, 300),
    });
  } catch {
    // Swallowed on purpose. See the note above about loops.
  }
};
