import { NextResponse } from "next/server";

import { getSession, getStore } from "@/lib/session";
import { userToday } from "@/lib/server-date";
import { consumeAiBudget } from "@/lib/ai/budget";

/**
 * Where the browser sends crashes.
 *
 * Authenticated only. An open endpoint that writes rows on demand is a free
 * spam target, and an anonymous stack trace with no account attached would not
 * tell us much anyway — those still reach the server console.
 */

export const dynamic = "force-dynamic";

/** Small enough that a runaway error loop cannot post a novel. */
const LIMITS = { kind: 60, message: 500, detail: 4000, path: 300 };

function trim(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const raw = (body ?? {}) as Record<string, unknown>;
  const message = trim(raw.message, LIMITS.message);
  if (!message) return NextResponse.json({ ok: false }, { status: 400 });

  const store = await getStore();

  // A crash loop on one device should not be able to write all night.
  const budget = await consumeAiBudget(store, session.userId, await userToday(), "error");
  if (!budget.ok) return NextResponse.json({ ok: false }, { status: 429 });

  await store.recordError(session.userId, {
    source: "client",
    kind: trim(raw.kind, LIMITS.kind) || "error",
    message,
    detail: trim(raw.detail, LIMITS.detail) || null,
    path: trim(raw.path, LIMITS.path) || null,
  });

  return NextResponse.json({ ok: true });
}
