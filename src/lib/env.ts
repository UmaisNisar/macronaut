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
/**
 * A ceiling on model calls across every account, per day.
 *
 * Signups are open, which means the daily allowance in AI_DAILY_LIMITS
 * bounds what one person can spend and nothing at all about what fifty
 * people can. This is the number that does.
 *
 * Set well above real use: a handful of people logging normally will not
 * come near it, and a script creating accounts will hit it quickly.
 */
export const aiGlobalDailyLimit = Number(
  process.env.MACRONAUT_AI_GLOBAL_DAILY_LIMIT?.trim() || "400",
);

/**
 * Accounts served even after the shared ceiling above is reached.
 *
 * Comma-separated email addresses. Without this a stranger could lock the
 * owner out of their own app simply by spending the pool, which trades one
 * problem for a worse one.
 */
export const aiPriorityEmails = (process.env.MACRONAUT_AI_PRIORITY_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);

export const geminiFallbackModels = (
  process.env.GEMINI_FALLBACK_MODELS ??
  "gemini-3.6-flash,gemini-3.5-flash,gemini-2.5-flash-lite,gemini-3.5-flash-lite,gemini-3.1-flash-lite"
)
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

/** Whether this deployment holds a Gemini key of its own. */
export const isGeminiConfigured = Boolean(geminiApiKey);

/**
 * Who the server's own key is for.
 *
 * On a public deployment every account brings its own key, and the one in
 * GEMINI_API_KEY is kept for the accounts in MACRONAUT_AI_PRIORITY_EMAILS —
 * the owner. Set this to "true" to share it with everyone instead, which is
 * what a private deployment for friends might want. Solo mode always uses it:
 * there is only one person, and it is their machine.
 */
export const shareServerAiKey =
  process.env.MACRONAUT_SHARE_SERVER_KEY?.trim().toLowerCase() === "true";

/**
 * Encrypts the Gemini keys people save. Any long random string; changing it
 * makes every saved key unreadable, so each person would need to add theirs
 * again. Optional in solo mode, where one is generated beside the data file.
 */
export const aiKeySecret = process.env.MACRONAUT_ENCRYPTION_KEY?.trim() || "";

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
