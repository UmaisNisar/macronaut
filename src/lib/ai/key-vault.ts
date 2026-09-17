import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { aiKeySecret, isSupabaseConfigured, localDataFile } from "@/lib/env";

/**
 * Gemini keys at rest.
 *
 * A key someone pastes in is a credential for their Google account's quota,
 * so it is stored encrypted rather than as a plain column: a leaked database
 * dump, a misconfigured policy or a curious look at the table editor shows
 * ciphertext, not something that can be spent. The secret lives only in the
 * deployment's environment.
 *
 * AES-256-GCM, with the user id as associated data so a ciphertext copied
 * into someone else's row will not decrypt there.
 */

const VERSION = "v1";

class VaultUnavailable extends Error {}

let soloSecret: Promise<Buffer> | null = null;

/**
 * Solo mode needs no configuration anywhere else, so it should not need one
 * here either: a random secret is written once next to the data file. Hosted
 * mode refuses instead, because a secret that silently changes between
 * serverless instances would make every saved key unreadable.
 */
function readSoloSecret(): Promise<Buffer> {
  soloSecret ??= (async () => {
    const dataPath = path.isAbsolute(localDataFile)
      ? localDataFile
      : path.join(/* turbopackIgnore: true */ process.cwd(), localDataFile);
    const file = path.join(path.dirname(dataPath), "vault.key");
    try {
      return Buffer.from((await fs.readFile(file, "utf8")).trim(), "base64");
    } catch {
      const fresh = randomBytes(32);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, fresh.toString("base64"), { mode: 0o600 });
      return fresh;
    }
  })();
  return soloSecret;
}

async function secret(): Promise<Buffer> {
  if (aiKeySecret) return createHash("sha256").update(aiKeySecret).digest();
  if (!isSupabaseConfigured) return readSoloSecret();
  throw new VaultUnavailable("MACRONAUT_ENCRYPTION_KEY is not set");
}

/** Whether keys can be saved at all on this deployment. */
export function canStoreKeys(): boolean {
  return Boolean(aiKeySecret) || !isSupabaseConfigured;
}

const b64 = (b: Buffer) => b.toString("base64url");

export async function sealKey(plain: string, userId: string): Promise<string> {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", await secret(), iv);
  cipher.setAAD(Buffer.from(userId));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, b64(iv), b64(cipher.getAuthTag()), b64(body)].join(".");
}

/** Null rather than a throw: an unreadable key means "no key", not a crash. */
export async function openKey(
  sealed: string,
  userId: string,
): Promise<string | null> {
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || !body) return null;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      await secret(),
      Buffer.from(iv, "base64url"),
    );
    decipher.setAAD(Buffer.from(userId));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(body, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    console.warn(
      "[macronaut] a saved Gemini key could not be decrypted:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/** Enough to recognise a key by, never enough to use one. */
export function keyHint(plain: string): string {
  return plain.slice(-4);
}
