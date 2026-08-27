import { NextResponse } from "next/server";

/**
 * The cheapest possible "is the server actually reachable" check.
 *
 * `navigator.onLine` cannot answer that. It reports true for a connection that
 * goes nowhere — a captive portal, a dropped tunnel, aeroplane wifi nobody has
 * paid for — and in testing it stayed true with the network severed outright.
 * The only honest answer is to try to reach the server.
 *
 * Not cached, and not intercepted by the service worker, so a response here
 * means the network genuinely worked.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return new NextResponse(null, {
    status: 204,
    headers: { "cache-control": "no-store" },
  });
}
