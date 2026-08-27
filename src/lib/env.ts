/**
 * Macronaut degrades gracefully instead of refusing to boot.
 *
 * - No Supabase keys  -> "solo mode": a single local pilot, JSON file storage.
 * - No Gemini key     -> the built-in estimator handles food, template coaching
 *                        handles the writing. Everything stays usable.
 */

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
export const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const geminiApiKey =
  process.env.GEMINI_API_KEY?.trim() ||
  process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
  "";

export const geminiModel =
  process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";

/**
 * Models to fall back through, in order, when the one above is exhausted or
 * failing.
 *
 * Gemini's free tier caps requests per day *per model* — twenty on this
 * project — so each extra name here is another twenty requests a day. That
 * makes a chain meaningfully better than a single spare, though it is still
 * rationing rather than a fix: billing removes the ceiling.
 *
 * Comma-separated. Set to an empty string to disable fallback entirely.
 */
export const geminiFallbackModels = (
  process.env.GEMINI_FALLBACK_MODELS ??
  "gemini-3.6-flash,gemini-3.5-flash,gemini-2.5-flash-lite,gemini-3.5-flash-lite,gemini-3.1-flash-lite"
)
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

export const isGeminiConfigured = Boolean(geminiApiKey);

/** Stable id for the single pilot in solo mode. */
export const SOLO_USER_ID = "solo-pilot";

export const localDataFile =
  process.env.MACRONAUT_DATA_FILE?.trim() || ".data/macronaut.json";

/**
 * Web push signing. Public key is safe in the browser; the private one signs
 * on the server and must never leave it.
 */
export const vapid = {
  publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || "",
  privateKey: process.env.VAPID_PRIVATE_KEY?.trim() || "",
  subject: process.env.VAPID_SUBJECT?.trim() || "mailto:hello@macronaut.app",
};

export const isPushConfigured = Boolean(vapid.publicKey);
