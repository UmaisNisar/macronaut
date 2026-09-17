import "server-only";

import {
  aiPriorityEmails,
  geminiApiKey,
  isSupabaseConfigured,
  shareServerAiKey,
} from "@/lib/env";
import { openKey } from "@/lib/ai/key-vault";
import type { DataStore } from "@/lib/db/store";

/**
 * Which Gemini key, if any, a person's calls go out on.
 *
 *   own     — the key they saved. Their quota, their bill.
 *   server  — the deployment's key. Solo mode, the accounts listed in
 *             MACRONAUT_AI_PRIORITY_EMAILS, or everyone when the owner has
 *             chosen to share it.
 *   none    — no model. Food falls back to the built-in estimator and the
 *             coaching to templates, so the app still works.
 *
 * A saved key wins over the server's even for the owner, so adding one is a
 * way to stop spending the shared pool.
 */
export type AiAccess =
  | { source: "own"; apiKey: string; hint: string }
  | { source: "server"; apiKey: string }
  | { source: "none"; apiKey: null; hint?: string };

/**
 * Whose calls are served on the server's key even on a public deployment.
 *
 * Matched on email rather than id so it can be set without looking a UUID up
 * in the database, and compared case-insensitively because that is how people
 * type their own address.
 */
export function isPriority(email: string | null): boolean {
  if (!email) return false;
  const wanted = email.trim().toLowerCase();
  return aiPriorityEmails.some((e) => e.toLowerCase() === wanted);
}

export function serverKeyFor(email: string | null): string | null {
  if (!geminiApiKey) return null;
  if (!isSupabaseConfigured || shareServerAiKey || isPriority(email)) {
    return geminiApiKey;
  }
  return null;
}

export async function resolveAiAccess(
  store: DataStore,
  user: { id: string; email: string | null },
): Promise<AiAccess> {
  let stored: Awaited<ReturnType<DataStore["getAiKey"]>> = null;
  try {
    stored = await store.getAiKey(user.id);
  } catch (error) {
    // A failed lookup degrades to the estimator rather than failing the log.
    console.warn("[macronaut] could not load the saved Gemini key:", error);
  }

  if (stored) {
    const apiKey = await openKey(stored.sealed, user.id);
    if (apiKey) return { source: "own", apiKey, hint: stored.hint };
  }

  const server = serverKeyFor(user.email);
  if (server) return { source: "server", apiKey: server };

  // A key that exists but will not decrypt still gets its hint shown, so the
  // screen can say "add it again" rather than pretending none was saved.
  return { source: "none", apiKey: null, hint: stored?.hint };
}
