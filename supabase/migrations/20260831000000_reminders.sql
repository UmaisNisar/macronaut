-- ---------------------------------------------------------------------------
-- Evening reminders.
--
-- A tracker you forget to open is a tracker you stop using. This is the one
-- notification the app sends: a nudge, at an hour you choose, only on days you
-- have not logged anything.
--
-- Two things have to be stored for that to work from a server:
--   * the subscription itself, per device, because one person may install the
--     app on a phone and a laptop
--   * the person's time zone, because "8pm" is meaningless to a cron job that
--     runs in UTC
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists reminder_hour integer
    check (reminder_hour is null or (reminder_hour >= 0 and reminder_hour <= 23));

-- Written by the app from the browser, the same value the day boundary uses.
alter table public.profiles
  add column if not exists time_zone text;

create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now(),
  -- Cleared when a push is accepted; set when the service says it is gone.
  failed_at  timestamptz
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

do $$
begin
  execute 'drop policy if exists "own rows" on public.push_subscriptions';
  execute 'create policy "own rows" on public.push_subscriptions
             for all using (auth.uid() = user_id) with check (auth.uid() = user_id)';
end
$$;
