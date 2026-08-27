-- ---------------------------------------------------------------------------
-- error_log: somewhere for crashes to land.
--
-- Until now a failure in production was invisible: the AI layer warns to the
-- console on every fallback, which is only ever read on a development machine.
-- If Gemini starts failing on a phone, the app quietly degrades to the built-in
-- estimator and nobody finds out.
--
-- Deliberately not a third-party service. This is one small table in a database
-- that already exists, and it keeps health-adjacent diagnostics inside the same
-- trust boundary as the data itself.
-- ---------------------------------------------------------------------------
create table if not exists public.error_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles (id) on delete cascade,
  source     text not null check (source in ('client', 'server')),
  kind       text not null default 'error',
  message    text not null,
  detail     text,
  path       text,
  created_at timestamptz not null default now()
);

create index if not exists error_log_recent_idx
  on public.error_log (user_id, created_at desc);

alter table public.error_log enable row level security;

do $$
begin
  execute 'drop policy if exists "own rows" on public.error_log';
  -- Readable by the person it happened to. Writes go through the function
  -- below so a client cannot forge rows against another account or delete
  -- its own history of failures.
  execute 'create policy "own rows" on public.error_log
             for select using (auth.uid() = user_id)';
end
$$;

-- ---------------------------------------------------------------------------
-- Bounded on purpose. An error loop on one device could otherwise write
-- thousands of near-identical rows, so each account keeps only its most recent
-- 200 and the writer trims as it goes.
-- ---------------------------------------------------------------------------
create or replace function public.record_error(
  p_source text,
  p_kind text,
  p_message text,
  p_detail text,
  p_path text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into public.error_log (user_id, source, kind, message, detail, path)
  values (
    auth.uid(),
    case when p_source = 'server' then 'server' else 'client' end,
    left(coalesce(p_kind, 'error'), 60),
    left(coalesce(p_message, ''), 500),
    left(p_detail, 4000),
    left(p_path, 300)
  );

  delete from public.error_log
  where user_id = auth.uid()
    and id not in (
      select id from public.error_log
      where user_id = auth.uid()
      order by created_at desc
      limit 200
    );
end;
$$;

revoke all on function public.record_error(text, text, text, text, text) from public;
grant execute on function public.record_error(text, text, text, text, text) to authenticated;
