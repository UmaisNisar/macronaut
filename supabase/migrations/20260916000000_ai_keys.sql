-- ---------------------------------------------------------------------------
-- Everyone brings their own Gemini key.
--
-- A public sign-up page backed by the owner's key means strangers spend the
-- owner's quota, and a daily ceiling only limits how fast. Each account now
-- stores its own key instead, and the app uses it for that account's calls.
--
-- The key is encrypted by the app before it gets here (AES-256-GCM, with a
-- secret that exists only in the deployment's environment), so this table
-- holds ciphertext. Row-level security still applies: an account can read and
-- replace its own row and nobody else's.
--
-- Keyed on auth.users rather than profiles so a key can be saved during
-- onboarding, before the profile row exists.
-- ---------------------------------------------------------------------------
create table if not exists public.ai_keys (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  sealed      text        not null,
  hint        text        not null,
  updated_at  timestamptz not null default now()
);

alter table public.ai_keys enable row level security;

drop policy if exists "ai_keys: own rows" on public.ai_keys;
create policy "ai_keys: own rows" on public.ai_keys
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Checking a pasted key calls Google, so it is metered like everything else
-- that does: otherwise the check is a free way to test a list of stolen keys.
alter table public.ai_usage
  drop constraint if exists ai_usage_kind_check;

alter table public.ai_usage
  add constraint ai_usage_kind_check
  check (kind in ('food', 'photo', 'coach', 'report', 'export', 'error', 'key'));
