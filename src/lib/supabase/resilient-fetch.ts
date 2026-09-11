import "server-only";

/**
 * Retry the requests it is safe to retry.
 *
 * The error log says this is worth having. Over eleven days production
 * recorded ten `JWT issued at future` failures spread across seven different
 * reads (goals, food, profile, weights, days, frequent foods, day) and ten
 * `Gateway Timeout`s on the hourly reminder cron — roughly one run in seven.
 * Each one surfaced to whoever was holding the phone as React error #441, a
 * blank screen with a digest on it, for a condition that had already cleared
 * by the time they tried again.
 *
 * Both are transient and neither is the app's fault:
 *
 * `JWT issued at future` is clock skew inside Supabase. The token is minted by
 * one service and checked against the clock of another, and when the proxy
 * refreshes a session the freshly-issued token can look a second early to
 * whichever machine validates it. It is rejected at the door, before any
 * statement runs.
 *
 * `Gateway Timeout` is the gateway giving up. The reminder query reads a
 * single row on a table of one profile, so it is not the query.
 *
 * WHAT IS DELIBERATELY NOT RETRIED
 *
 * Writes, on a timeout. A 504 means the gateway stopped waiting, not that the
 * database stopped working — the insert may well have committed. Replaying it
 * would give someone two dinners. `save food: Gateway Timeout` is in that log
 * twice and it stays unretried here; the fix for that one belongs in the
 * outbox, which already exists to hold a meal the server would not take.
 *
 * A rejected JWT is different, and writes do get retried for it: the request
 * never reached the database, so there is nothing to duplicate.
 */

/** Three attempts total. Beyond that it is not skew, it is an outage. */
const MAX_ATTEMPTS = 3;

/** Short, because the caller is a page render with a person waiting on it. */
const BACKOFF_MS = [120, 320];

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

function methodOf(input: RequestInfo | URL, init?: RequestInit): string {
  const raw =
    init?.method ?? (input instanceof Request ? input.method : "GET") ?? "GET";
  return raw.toUpperCase();
}

/** Reads are replayable by definition; the rest may have left a mark. */
function isRead(method: string): boolean {
  return method === "GET" || method === "HEAD";
}

/**
 * Supabase reports the skew as a 401 whose body names it. Reading the body
 * costs a clone, which is why it is only done for the one status where it
 * could possibly say this.
 */
async function isClockSkew(response: Response): Promise<boolean> {
  if (response.status !== 401) return false;
  try {
    const text = await response.clone().text();
    return /issued at future|iat.*future|future.*iat/i.test(text);
  } catch {
    return false;
  }
}

export function createResilientFetch(): typeof fetch {
  return async function resilientFetch(input, init) {
    const method = methodOf(input, init);
    let lastNetworkError: unknown;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const isLast = attempt === MAX_ATTEMPTS - 1;

      let response: Response;
      try {
        response = await fetch(input, init);
      } catch (error) {
        // A connection that never completed cannot have written anything,
        // so this one is safe for any method.
        lastNetworkError = error;
        if (isLast) throw error;
        await sleep(BACKOFF_MS[attempt] ?? 320);
        continue;
      }

      if (isLast) return response;

      if (await isClockSkew(response)) {
        await sleep(BACKOFF_MS[attempt] ?? 320);
        continue;
      }

      if (isRead(method) && RETRYABLE_STATUS.has(response.status)) {
        await sleep(BACKOFF_MS[attempt] ?? 320);
        continue;
      }

      return response;
    }

    // Unreachable: the final attempt always returns or throws above.
    throw lastNetworkError ?? new Error("request failed");
  };
}
