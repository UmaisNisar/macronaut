import { afterEach, describe, expect, it, vi } from "vitest";

import type { DataStore, StoredAiKey } from "@/lib/db/store";

/**
 * Bring-your-own-key is what stops a public deployment spending its owner's
 * Gemini quota, so the rules for whose key a call uses are tested at their
 * edges: the owner, a stranger, solo mode, a key that will not decrypt.
 *
 * Every module here reads the environment when it first loads, so each case
 * stubs the environment and imports fresh.
 */

const SUPABASE = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
};

async function load(env: Record<string, string>) {
  vi.resetModules();
  for (const name of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "MACRONAUT_ENCRYPTION_KEY",
    "MACRONAUT_SHARE_SERVER_KEY",
    "MACRONAUT_AI_PRIORITY_EMAILS",
  ]) {
    vi.stubEnv(name, env[name] ?? "");
  }
  return {
    vault: await import("@/lib/ai/key-vault"),
    access: await import("@/lib/ai/access"),
    budget: await import("@/lib/ai/budget"),
    gemini: await import("@/lib/ai/gemini"),
  };
}

function keyStore(saved: StoredAiKey | null) {
  return {
    getAiKey: vi.fn(async () => saved),
  } as unknown as DataStore;
}

const original = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = original;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const SECRET = "a-long-random-deployment-secret-for-tests-only";
const KEY = "AIzaSyTESTTESTTESTTESTTESTTESTTEST1234";

describe("the key vault", () => {
  it("round-trips a key without storing it in the clear", async () => {
    const { vault } = await load({ ...SUPABASE, MACRONAUT_ENCRYPTION_KEY: SECRET });
    const sealed = await vault.sealKey(KEY, "user-1");

    expect(sealed).not.toContain(KEY);
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(await vault.openKey(sealed, "user-1")).toBe(KEY);
  });

  it("will not open a key copied into someone else's row", async () => {
    const { vault } = await load({ ...SUPABASE, MACRONAUT_ENCRYPTION_KEY: SECRET });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const sealed = await vault.sealKey(KEY, "user-1");
    expect(await vault.openKey(sealed, "user-2")).toBeNull();
  });

  it("rejects a tampered ciphertext instead of returning garbage", async () => {
    const { vault } = await load({ ...SUPABASE, MACRONAUT_ENCRYPTION_KEY: SECRET });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const sealed = await vault.sealKey(KEY, "user-1");
    const parts = sealed.split(".");
    const body = Buffer.from(parts[3], "base64url");
    body[0] ^= 1;
    parts[3] = body.toString("base64url");
    expect(await vault.openKey(parts.join("."), "user-1")).toBeNull();
  });

  it("cannot read keys sealed under a different secret", async () => {
    const first = await load({ ...SUPABASE, MACRONAUT_ENCRYPTION_KEY: SECRET });
    const sealed = await first.vault.sealKey(KEY, "user-1");

    const second = await load({ ...SUPABASE, MACRONAUT_ENCRYPTION_KEY: `${SECRET}-rotated` });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await second.vault.openKey(sealed, "user-1")).toBeNull();
  });

  it("refuses to save keys on a hosted deployment with no secret", async () => {
    const { vault } = await load({ ...SUPABASE });
    expect(vault.canStoreKeys()).toBe(false);
    await expect(vault.sealKey(KEY, "user-1")).rejects.toThrow(
      /MACRONAUT_ENCRYPTION_KEY/,
    );
  });

  it("shows only the last four characters", async () => {
    const { vault } = await load({ ...SUPABASE, MACRONAUT_ENCRYPTION_KEY: SECRET });
    expect(vault.keyHint(KEY)).toBe("1234");
  });
});

describe("whose key a call goes out on", () => {
  const stranger = { id: "user-1", email: "stranger@example.com" };

  it("never gives a stranger the server's key on a public deployment", async () => {
    const { access } = await load({
      ...SUPABASE,
      GEMINI_API_KEY: "server-key",
      MACRONAUT_ENCRYPTION_KEY: SECRET,
      MACRONAUT_AI_PRIORITY_EMAILS: "owner@example.com",
    });
    const result = await access.resolveAiAccess(keyStore(null), stranger);
    expect(result).toEqual({ source: "none", apiKey: null, hint: undefined });
  });

  it("uses a person's own key when they have saved one", async () => {
    const env = { ...SUPABASE, GEMINI_API_KEY: "server-key", MACRONAUT_ENCRYPTION_KEY: SECRET };
    const { vault, access } = await load(env);
    const sealed = await vault.sealKey(KEY, stranger.id);

    const result = await access.resolveAiAccess(
      keyStore({ sealed, hint: "1234", updatedAt: "2026-09-16T00:00:00Z" }),
      stranger,
    );
    expect(result).toEqual({ source: "own", apiKey: KEY, hint: "1234" });
  });

  it("serves the owner on the server's key, however they type their email", async () => {
    const { access } = await load({
      ...SUPABASE,
      GEMINI_API_KEY: "server-key",
      MACRONAUT_AI_PRIORITY_EMAILS: "owner@example.com",
    });
    const result = await access.resolveAiAccess(keyStore(null), {
      id: "owner",
      email: " Owner@Example.com",
    });
    expect(result).toEqual({ source: "server", apiKey: "server-key" });
  });

  it("prefers the owner's own key over the server's, so adding one stops spending the pool", async () => {
    const { vault, access } = await load({
      ...SUPABASE,
      GEMINI_API_KEY: "server-key",
      MACRONAUT_ENCRYPTION_KEY: SECRET,
      MACRONAUT_AI_PRIORITY_EMAILS: "owner@example.com",
    });
    const sealed = await vault.sealKey(KEY, "owner");
    const result = await access.resolveAiAccess(
      keyStore({ sealed, hint: "1234", updatedAt: "" }),
      { id: "owner", email: "owner@example.com" },
    );
    expect(result.source).toBe("own");
  });

  it("shares the server's key with everyone only when told to", async () => {
    const { access } = await load({
      ...SUPABASE,
      GEMINI_API_KEY: "server-key",
      MACRONAUT_SHARE_SERVER_KEY: "true",
    });
    const result = await access.resolveAiAccess(keyStore(null), stranger);
    expect(result.source).toBe("server");
  });

  it("uses the server's key in solo mode, where there is only one person", async () => {
    const { access } = await load({ GEMINI_API_KEY: "server-key" });
    const result = await access.resolveAiAccess(keyStore(null), {
      id: "solo-pilot",
      email: null,
    });
    expect(result).toEqual({ source: "server", apiKey: "server-key" });
  });

  it("reports a key that no longer decrypts as missing, keeping its hint", async () => {
    const { access } = await load({ ...SUPABASE, MACRONAUT_ENCRYPTION_KEY: SECRET });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await access.resolveAiAccess(
      keyStore({ sealed: "v1.bad.bad.bad", hint: "9876", updatedAt: "" }),
      stranger,
    );
    expect(result).toEqual({ source: "none", apiKey: null, hint: "9876" });
  });

  it("falls back rather than failing when the key lookup itself errors", async () => {
    const { access } = await load({ ...SUPABASE, MACRONAUT_ENCRYPTION_KEY: SECRET });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const broken = {
      getAiKey: vi.fn(async () => {
        throw new Error("database on fire");
      }),
    } as unknown as DataStore;
    const result = await access.resolveAiAccess(broken, stranger);
    expect(result.source).toBe("none");
  });
});

describe("the shared ceiling, with people's own keys", () => {
  function overPool(limit: number) {
    return {
      bumpAiUsage: vi.fn(async () => ({ user: 1, global: limit + 50 })),
    } as unknown as DataStore;
  }

  it("does not stop a call on someone's own key", async () => {
    const { budget } = await load({ ...SUPABASE });
    const r = await budget.consumeAiBudget(
      overPool(400),
      { id: "u", email: "someone@example.com" },
      "2026-09-16",
      "food",
      "own",
    );
    expect(r.ok).toBe(true);
  });

  it("still guards the server's key", async () => {
    const { budget } = await load({ ...SUPABASE });
    const r = await budget.consumeAiBudget(
      overPool(400),
      { id: "u", email: "someone@example.com" },
      "2026-09-16",
      "food",
      "server",
    );
    expect(r.ok).toBe(false);
  });

  it("limits key checks per account, so the check cannot test stolen keys", async () => {
    const { budget } = await load({ ...SUPABASE });
    const store = {
      bumpAiUsage: vi.fn(async () => ({
        user: budget.AI_DAILY_LIMITS.key + 1,
        global: 0,
      })),
    } as unknown as DataStore;
    const r = await budget.consumeAiBudget(
      store,
      { id: "u", email: null },
      "2026-09-16",
      "key",
    );
    expect(r.ok).toBe(false);
  });
});

describe("talking to Gemini", () => {
  function mockFetch(respond: (url: string) => Response | Error) {
    const calls: { url: string; headers: Headers }[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), headers: new Headers(init?.headers) });
      const out = respond(String(input));
      if (out instanceof Error) throw out;
      return out;
    }) as unknown as typeof fetch;
    return calls;
  }

  const refused = () =>
    new Response(
      JSON.stringify({
        error: {
          code: 400,
          message: "API key not valid. Please pass a valid API key.",
          status: "INVALID_ARGUMENT",
          details: [{ reason: "API_KEY_INVALID" }],
        },
      }),
      { status: 400 },
    );

  it("makes no request at all without a key", async () => {
    const { gemini } = await load({ ...SUPABASE });
    const calls = mockFetch(() => new Response("{}"));
    const result = await gemini.generateJson({
      apiKey: null,
      system: "s",
      prompt: "p",
      schema: { type: "OBJECT" },
      validator: { safeParse: () => ({ success: true, data: {} }) } as never,
    });
    expect(result).toMatchObject({ ok: false, reason: "unconfigured" });
    expect(calls).toHaveLength(0);
  });

  it("stops at the first refusal of the key instead of walking every model", async () => {
    const { gemini } = await load({ ...SUPABASE });
    const calls = mockFetch(refused);
    const result = await gemini.generateJson({
      apiKey: KEY,
      system: "s",
      prompt: "p",
      schema: { type: "OBJECT" },
      validator: { safeParse: () => ({ success: true, data: {} }) } as never,
    });
    expect(result).toMatchObject({ ok: false, reason: "key" });
    expect(calls).toHaveLength(1);
    // In a header, never the URL, where it would end up in logs.
    expect(calls[0].url).not.toContain(KEY);
    expect(calls[0].headers.get("x-goog-api-key")).toBe(KEY);
  });

  it("accepts a working key", async () => {
    const { gemini } = await load({ ...SUPABASE });
    const calls = mockFetch(() => new Response(JSON.stringify({ models: [] })));
    expect(await gemini.checkGeminiKey(KEY)).toEqual({ ok: true });
    expect(calls[0].url).not.toContain(KEY);
  });

  it("accepts a key that is only rate-limited, since Google recognised it", async () => {
    const { gemini } = await load({ ...SUPABASE });
    mockFetch(() => new Response("{}", { status: 429 }));
    expect(await gemini.checkGeminiKey(KEY)).toEqual({ ok: true });
  });

  it("says plainly when Google rejects a key", async () => {
    const { gemini } = await load({ ...SUPABASE });
    mockFetch(refused);
    const result = await gemini.checkGeminiKey(KEY);
    expect(result).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("does not blame the key when Google cannot be reached", async () => {
    const { gemini } = await load({ ...SUPABASE });
    mockFetch(() => new Error("socket hang up"));
    const result = await gemini.checkGeminiKey(KEY);
    expect(result).toMatchObject({ ok: false, reason: "unreachable" });
  });
});
