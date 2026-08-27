-- ---------------------------------------------------------------------------
-- ai_usage: a per-day, per-kind counter so one account cannot spend the
-- project's whole model budget.
--
-- Signups are open, which means anyone who finds the URL can create an account
-- and start making Gemini calls billed to the project owner. RLS already stops
-- them reading anyone else's data; this stops them costing money without limit.
-- ---------------------------------------------------------------------------
create table if not exists public.ai_usage (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  usage_date date not null,
  kind       text not null
              check (kind in ('food', 'photo', 'coach', 'report')),
  count      integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date, kind)
);

alter table public.ai_usage enable row level security;

do $$
begin
  execute 'drop policy if exists "own rows" on public.ai_usage';
  -- Read-only to the client. Increments go exclusively through the function
  -- below, so a client cannot reset its own counter to zero.
  execute 'create policy "own rows" on public.ai_usage
             for select using (auth.uid() = user_id)';
end
$$;

-- ---------------------------------------------------------------------------
-- Atomic increment. Doing this as read-then-write from the application would
-- race: two concurrent requests would both read N and both write N+1, and the
-- limit could be walked past by hammering the endpoint. One statement, one
-- authoritative answer.
--
-- security definer so it can write a table the caller may only read, and the
-- user is taken from auth.uid() rather than an argument so it cannot be spent
-- on someone else's behalf.
-- ---------------------------------------------------------------------------
create or replace function public.bump_ai_usage(p_kind text, p_date date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into public.ai_usage as u (user_id, usage_date, kind, count, updated_at)
  values (auth.uid(), p_date, p_kind, 1, now())
  on conflict (user_id, usage_date, kind)
  do update set count = u.count + 1, updated_at = now()
  returning u.count into new_count;

  return new_count;
end;
$$;

revoke all on function public.bump_ai_usage(text, date) from public;
grant execute on function public.bump_ai_usage(text, date) to authenticated;
