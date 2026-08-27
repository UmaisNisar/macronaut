"use client";

import { useEffect } from "react";

/**
 * Catches what nothing else does.
 *
 * React error boundaries only see errors thrown during rendering. Everything
 * else — a listener that throws, a rejected promise nobody awaited, a failure
 * inside a timeout — vanishes into a console the user never opens. This
 * forwards those to the server so a phone-only failure is not invisible.
 *
 * Deliberately quiet: reporting is best-effort, never blocks, and never shows
 * the user anything. They already saw whatever went wrong.
 */

/** Identical errors fire in bursts; report each distinct one once per session. */
const seen = new Set<string>();

function report(kind: string, message: string, detail?: string) {
  if (!message) return;
  const key = `${kind}:${message}`.slice(0, 200);
  if (seen.has(key)) return;
  seen.add(key);

  const body = JSON.stringify({
    kind,
    message,
    detail,
    path: typeof location === "undefined" ? "" : location.pathname,
  });

  // keepalive so a crash during navigation still gets out.
  void fetch("/api/report-error", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // Offline, or the endpoint is the thing that is broken. Either way this is
    // not worth surfacing.
  });
}

export function ErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      report(
        "uncaught",
        event.message,
        `${event.filename ?? ""}:${event.lineno ?? 0} ${event.error?.stack ?? ""}`.trim(),
      );
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      report(
        "unhandled-rejection",
        reason instanceof Error ? reason.message : String(reason ?? "unknown"),
        reason instanceof Error ? reason.stack : undefined,
      );
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}

/** For the render-time error boundary, which sees a different class of failure. */
export function reportBoundaryError(error: Error, digest?: string) {
  report("render", error.message, `${digest ? `digest ${digest}\n` : ""}${error.stack ?? ""}`);
}
