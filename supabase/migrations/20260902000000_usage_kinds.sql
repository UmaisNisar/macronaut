-- ---------------------------------------------------------------------------
-- The daily meter was written for model calls, but it is really a per-account
-- rate limit and two other endpoints need one:
--
--   export  — rebuilds your entire history on every call, so it is the most
--             expensive thing an authenticated stranger could hammer, and
--             signups are open
--   error   — writes a row per report, so a crash loop on one device could
--             otherwise spend the night filling the table
-- ---------------------------------------------------------------------------
alter table public.ai_usage
  drop constraint if exists ai_usage_kind_check;

alter table public.ai_usage
  add constraint ai_usage_kind_check
  check (kind in ('food', 'photo', 'coach', 'report', 'export', 'error'));
