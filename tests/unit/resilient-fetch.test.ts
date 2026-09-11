import { describe, expect, it, vi, afterEach } from "vitest";

import { createResilientFetch } from "@/lib/supabase/resilient-fetch";

const original = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = original;
  vi.restoreAllMocks();
});

/** Queue of responses (or thrown errors) the fake fetch hands out in order. */
function mockFetch(steps: (Response | Error)[]) {
  const calls: { url: string; method: string }[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: (init?.method ?? "GET").toUpperCase(),
    });
    const step = steps.shift();
    if (step instanceof Error) throw step;
    return step ?? new Response("{}", { status: 200 });
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return { fn, calls };
}

const ok = () => new Response("{}", { status: 200 });
const status = (code: number, body = "{}") => new Response(body, { status: code });
const skew = () =>
  new Response(JSON.stringify({ message: "JWT issued at future" }), {
    status: 401,
  });

describe("resilient fetch — reads", () => {
  it("retries a Gateway Timeout and returns the eventual success", async () => {
    const { calls } = mockFetch([status(504), ok()]);
    const res = await createResilientFetch()("https://db/rest/v1/profiles");
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  it("gives up after three attempts rather than hammering", async () => {
    const { calls } = mockFetch([status(504), status(504), status(504)]);
    const res = await createResilientFetch()("https://db/rest/v1/profiles");
    expect(res.status).toBe(504);
    expect(calls).toHaveLength(3);
  });

  it("retries a dropped connection", async () => {
    const { calls } = mockFetch([new Error("ECONNRESET"), ok()]);
    const res = await createResilientFetch()("https://db/rest/v1/profiles");
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  it("does not retry a genuine 404", async () => {
    const { calls } = mockFetch([status(404), ok()]);
    const res = await createResilientFetch()("https://db/rest/v1/nope");
    expect(res.status).toBe(404);
    expect(calls).toHaveLength(1);
  });
});

/*
 * The important half. A 504 on an insert means the gateway stopped waiting,
 * not that the database did — the row may already exist, so replaying it
 * would log the same meal twice. Production hit this exact case.
 */
describe("resilient fetch — writes", () => {
  it("never replays a POST that timed out", async () => {
    const { calls } = mockFetch([status(504), ok()]);
    const res = await createResilientFetch()("https://db/rest/v1/food_entries", {
      method: "POST",
      body: "{}",
    });
    expect(res.status).toBe(504);
    expect(calls).toHaveLength(1);
  });

  it.each(["PATCH", "DELETE", "PUT"])("never replays a %s", async (method) => {
    const { calls } = mockFetch([status(503), ok()]);
    const res = await createResilientFetch()("https://db/rest/v1/x", { method });
    expect(res.status).toBe(503);
    expect(calls).toHaveLength(1);
  });

  /* A rejected token never reached the database, so there is nothing to
     duplicate — this one is safe for any method, and is why writes are not
     simply excluded wholesale. */
  it("does replay a write rejected for clock skew", async () => {
    const { calls } = mockFetch([skew(), ok()]);
    const res = await createResilientFetch()("https://db/rest/v1/food_entries", {
      method: "POST",
      body: "{}",
    });
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2);
  });
});

describe("resilient fetch — clock skew", () => {
  it("retries the read that production actually logged", async () => {
    const { calls } = mockFetch([skew(), ok()]);
    const res = await createResilientFetch()("https://db/rest/v1/goal_snapshots");
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  it("leaves an ordinary 401 alone — that is a real sign-out", async () => {
    const { calls } = mockFetch([
      status(401, JSON.stringify({ message: "invalid claim: missing sub" })),
      ok(),
    ]);
    const res = await createResilientFetch()("https://db/rest/v1/profiles");
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(1);
  });

  it("does not consume the body it inspects", async () => {
    mockFetch([skew(), new Response(JSON.stringify({ hi: true }), { status: 200 })]);
    const res = await createResilientFetch()("https://db/rest/v1/profiles");
    await expect(res.json()).resolves.toEqual({ hi: true });
  });
});
