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

export const isGeminiConfigured = Boolean(geminiApiKey);

/** Stable id for the single pilot in solo mode. */
export const SOLO_USER_ID = "solo-pilot";

export const localDataFile =
  process.env.MACRONAUT_DATA_FILE?.trim() || ".data/macronaut.json";
