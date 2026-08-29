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
 * layout left to sit inside. The styling is inline for the same reason — the
 * stylesheet may be exactly what failed to load.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
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
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#f7f5ff",
          color: "#2e2545",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "2rem",
        }}
      >
        <div style={{ maxWidth: "22rem", textAlign: "center" }}>
          <div style={{ fontSize: "3rem" }} aria-hidden>
            🫠
          </div>
          <h1 style={{ fontSize: "1.25rem", margin: "0.75rem 0 0" }}>
            Macronaut fell over
          </h1>
          <p
            style={{
              fontSize: "0.9rem",
              lineHeight: 1.6,
              color: "#6f6689",
              margin: "0.5rem 0 0",
            }}
          >
            Nothing you logged is lost — this was the app, not your data. It has
            been reported.
          </p>
          {error.digest ? (
            <p style={{ fontSize: "0.7rem", color: "#6f6689", marginTop: "0.75rem" }}>
              ref {error.digest}
            </p>
          ) : null}
          <button
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              padding: "0.75rem 1.5rem",
              borderRadius: "999px",
              border: 0,
              background: "#7b61ff",
              color: "#fff",
              fontSize: "0.95rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
