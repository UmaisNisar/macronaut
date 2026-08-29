"use client";

import { useEffect } from "react";

/**
 * The last net.
 *
 * The route-level error boundary only covers what renders inside the app
 * layout. If the root layout itself throws, that boundary is gone with it and
 * Next falls back to a default page — which said nothing to the person looking
 * at it and, more to the point, was never written down anywhere.
 *
 * This has to render its own <html> and <body>: at this level there is no
 * layout left to sit inside. It also gets no global stylesheet, which Next's
 * own docs call out — so the palette is repeated here in a <style> block
 * rather than imported, and follows the OS colour scheme, because there is no
 * theme class to read at this point either. Before that it was hard-coded
 * daylight, so the very worst moment in the app was also the one that fired a
 * white screen at someone using it at night.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  /*
   * retry(), not reset(): retry() re-fetches and re-renders, while reset()
   * only clears the error state and re-renders what is already there. On a
   * bad connection that difference is the whole button — reset() reruns the
   * same failed render and looks broken.
   */
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Macronaut crashed at the root:", error);
    void fetch("/api/report-error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "global-error",
        message: error.message || "root layout crashed",
        detail: [error.stack, error.digest ? `digest ${error.digest}` : null]
          .filter(Boolean)
          .join("\n"),
        path: typeof location === "undefined" ? "" : location.pathname,
      }),
      keepalive: true,
    }).catch(() => {
      // Offline, or the endpoint is the thing that broke.
    });
  }, [error]);

  return (
    <html lang="en">
      <body>
        {/* Kept in sync by hand with the two palettes in globals.css. There is
            deliberately no build-time link between them: this file has to work
            when the stylesheet is the thing that failed. */}
        <style>{`
          :root {
            color-scheme: light;
            --bg: #f7f5ff;
            --ink: #2e2545;
            --ink-soft: #6f6689;
            --accent: #7b61ff;
            --on-accent: #ffffff;
          }
          @media (prefers-color-scheme: dark) {
            :root {
              color-scheme: dark;
              --bg: #131022;
              --ink: #f2effc;
              --ink-soft: #b1aad0;
              --accent: #af9dff;
              --on-accent: #191033;
            }
          }
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            padding: 2rem;
            background: var(--bg);
            color: var(--ink);
            font-family: system-ui, -apple-system, sans-serif;
          }
          .wrap { max-width: 22rem; text-align: center; }
          .face { font-size: 3rem; }
          h1 { font-size: 1.25rem; margin: 0.75rem 0 0; }
          p { font-size: 0.9rem; line-height: 1.6; color: var(--ink-soft); margin: 0.5rem 0 0; }
          .ref { font-size: 0.7rem; margin-top: 0.75rem; }
          button {
            margin-top: 1.5rem;
            padding: 0.75rem 1.5rem;
            border-radius: 999px;
            border: 0;
            background: var(--accent);
            color: var(--on-accent);
            font-size: 0.95rem;
            font-weight: 700;
            cursor: pointer;
          }
        `}</style>
        <div className="wrap">
          <div className="face" aria-hidden>
            🫠
          </div>
          <h1>Macronaut fell over</h1>
          <p>
            Nothing you logged is lost — this was the app, not your data. It has
            been reported.
          </p>
          {error.digest ? <p className="ref">ref {error.digest}</p> : null}
          <button onClick={() => retry()}>Try again</button>
        </div>
      </body>
    </html>
  );
}
