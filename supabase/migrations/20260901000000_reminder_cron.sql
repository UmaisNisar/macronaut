-- ---------------------------------------------------------------------------
-- Run the reminder job hourly, from Postgres.
--
-- Vercel's Hobby plan allows one cron run per day, which cannot serve an hour
-- the person chooses: 8pm is a different UTC hour for every time zone, and
-- changes twice a year with daylight saving. Supabase can schedule this itself
-- with pg_cron, and pg_net can make the HTTP call, so the whole thing stays
-- inside infrastructure this project already owns.
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Somewhere to keep the endpoint and its secret. Not a committed value: the
-- row is inserted separately, and the schema is unreachable from the API, so
-- no client can read it even with a valid session.
create schema if not exists private;
revoke all on schema private from anon, authenticated;

create table if not exists private.settings (
  key   text primary key,
  value text not null
);

revoke all on private.settings from anon, authenticated;

create or replace function private.run_reminder_cron()
returns void
language plpgsql
security definer
set search_path = private, public, extensions
as $$
declare
  base_url text;
  secret   text;
begin
  select value into base_url from private.settings where key = 'app_url';
  select value into secret   from private.settings where key = 'cron_secret';

  -- Nothing configured yet is not an error; it just means no reminders.
  if base_url is null or secret is null then
    return;
  end if;

  perform net.http_get(
    url := base_url || '/api/cron/reminders',
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret),
    timeout_milliseconds := 30000
  );
end;
$$;

revoke all on function private.run_reminder_cron() from anon, authenticated;

-- Re-scheduling is idempotent: unschedule first so re-running this migration
-- cannot end up with two jobs sending two notifications.
do $$
begin
  perform cron.unschedule('macronaut-reminders');
exception
  when others then null;
end
$$;

select cron.schedule(
  'macronaut-reminders',
  '0 * * * *',
  $$select private.run_reminder_cron()$$
);
