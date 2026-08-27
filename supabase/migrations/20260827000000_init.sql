-- ============================================================================
-- Macronaut — database schema
-- Run this once in the Supabase SQL editor (or `supabase db push`).
-- Safe to re-run: every statement is idempotent.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles: one row per pilot, mirrors auth.users
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  email               text,
  display_name        text,
  age                 integer      not null default 30,
  gender              text         not null default 'other'
                       check (gender in ('male', 'female', 'other')),
  height_cm           numeric(5, 1) not null default 170,
  starting_weight_kg  numeric(5, 1) not null default 80,
  current_weight_kg   numeric(5, 1) not null default 80,
  target_weight_kg    numeric(5, 1) not null default 75,
  weekly_loss_kg      numeric(3, 2) not null default 0.5,
  activity_level      text         not null default 'light'
                       check (activity_level in ('sedentary', 'light', 'moderate', 'very')),
  units               text         not null default 'metric'
                       check (units in ('metric', 'imperial')),
  onboarded_at        timestamptz,
  created_at          timestamptz  not null default now()
);

-- ---------------------------------------------------------------------------
-- goal_snapshots: immutable record of what the plan was on a given day, so
-- editing today's goal never rewrites the meaning of last month's history.
-- ---------------------------------------------------------------------------
create table if not exists public.goal_snapshots (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  effective_from    date not null,
  age               integer       not null,
  gender            text          not null,
  height_cm         numeric(5, 1) not null,
  weight_kg         numeric(5, 1) not null,
  target_weight_kg  numeric(5, 1) not null,
  weekly_loss_kg    numeric(3, 2) not null,
  activity_level    text          not null,
  targets           jsonb         not null,
  created_at        timestamptz   not null default now(),
  unique (user_id, effective_from)
);

create index if not exists goal_snapshots_user_date_idx
  on public.goal_snapshots (user_id, effective_from desc);

-- ---------------------------------------------------------------------------
-- daily_logs: the per-day rollup. Rewritten whenever food entries change.
-- ---------------------------------------------------------------------------
create table if not exists public.daily_logs (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles (id) on delete cascade,
  log_date              date not null,

  bmr                   integer not null default 0,
  tdee                  integer not null default 0,
  deficit               integer not null default 0,
  deficit_clamped       boolean not null default false,
  calorie_target        integer not null default 0,
  protein_target        integer not null default 0,
  carb_target           integer not null default 0,
  fat_target            integer not null default 0,
  fiber_target          integer not null default 0,

  total_calories        numeric(8, 1) not null default 0,
  total_protein         numeric(7, 1) not null default 0,
  total_carbs           numeric(7, 1) not null default 0,
  total_fat             numeric(7, 1) not null default 0,
  total_fiber           numeric(7, 1) not null default 0,
  total_sugar           numeric(7, 1) not null default 0,

  entry_count           integer not null default 0,
  score                 integer not null default 0,
  status                text    not null default 'unlogged'
                         check (status in ('great', 'solid', 'over', 'under', 'unlogged')),

  coach                 jsonb,
  coach_generated_at    timestamptz,
  coach_signature       text,

  updated_at            timestamptz not null default now(),
  unique (user_id, log_date)
);

create index if not exists daily_logs_user_date_idx
  on public.daily_logs (user_id, log_date desc);

-- ---------------------------------------------------------------------------
-- food_entries: one row per food the AI (or the user) identified
-- ---------------------------------------------------------------------------
create table if not exists public.food_entries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  log_date     date not null,
  meal         text not null default 'snack'
                check (meal in ('breakfast', 'lunch', 'dinner', 'snack', 'drink')),
  name         text not null,
  quantity     text not null default '1 serving',
  emoji        text not null default '🍽️',
  calories     numeric(7, 1) not null default 0,
  protein      numeric(6, 1) not null default 0,
  carbs        numeric(6, 1) not null default 0,
  fat          numeric(6, 1) not null default 0,
  fiber        numeric(6, 1) not null default 0,
  sugar        numeric(6, 1) not null default 0,
  confidence   text not null default 'medium'
                check (confidence in ('high', 'medium', 'low')),
  assumptions  text[] not null default '{}',
  raw_input    text not null default '',
  source       text not null default 'ai'
                check (source in ('ai', 'estimator', 'manual')),
  created_at   timestamptz not null default now()
);

create index if not exists food_entries_user_date_idx
  on public.food_entries (user_id, log_date, created_at);

-- ---------------------------------------------------------------------------
-- weight_logs: at most one per calendar day
-- ---------------------------------------------------------------------------
create table if not exists public.weight_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  logged_on   date not null,
  weight_kg   numeric(5, 2) not null,
  note        text,
  coach       jsonb,
  created_at  timestamptz not null default now(),
  unique (user_id, logged_on)
);

create index if not exists weight_logs_user_date_idx
  on public.weight_logs (user_id, logged_on);

-- ---------------------------------------------------------------------------
-- achievements
-- ---------------------------------------------------------------------------
create table if not exists public.achievements (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  key          text not null,
  unlocked_on  date not null,
  unique (user_id, key)
);

-- ---------------------------------------------------------------------------
-- ai_reports: cached weekly / biweekly / monthly write-ups
-- ---------------------------------------------------------------------------
create table if not exists public.ai_reports (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  period        text not null check (period in ('7d', '14d', '30d')),
  period_start  date not null,
  period_end    date not null,
  signature     text not null,
  report        jsonb not null,
  created_at    timestamptz not null default now(),
  unique (user_id, period)
);

-- ============================================================================
-- Row level security — a pilot only ever sees their own telemetry
-- ============================================================================

alter table public.profiles       enable row level security;
alter table public.goal_snapshots enable row level security;
alter table public.daily_logs     enable row level security;
alter table public.food_entries   enable row level security;
alter table public.weight_logs    enable row level security;
alter table public.achievements   enable row level security;
alter table public.ai_reports     enable row level security;

do $$
declare
  t text;
begin
  -- profiles keys on id; everything else keys on user_id
  execute 'drop policy if exists "own profile" on public.profiles';
  execute 'create policy "own profile" on public.profiles
             for all using (auth.uid() = id) with check (auth.uid() = id)';

  foreach t in array array[
    'goal_snapshots', 'daily_logs', 'food_entries',
    'weight_logs', 'achievements', 'ai_reports'
  ]
  loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I
         for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t
    );
  end loop;
end
$$;
