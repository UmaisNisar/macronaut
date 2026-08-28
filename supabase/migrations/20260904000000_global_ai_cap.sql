-- ---------------------------------------------------------------------------
-- A ceiling on what the whole service can spend in a day.
--
-- The per-account limit in ai_usage stops one person running up a bill. It does
-- nothing about ten people: signups are open, so anyone who finds the URL can
-- create an account and start spending the project owner's model quota, and
-- twenty accounts at eighty calls each is sixteen hundred calls nobody
-- authorised.
--
-- Counting across accounts needs to see rows the caller cannot read, so it is
-- done here rather than in a query. Same shape as bump_ai_usage: the user is
-- taken from auth.uid() and never from an argument, so a caller can only ever
-- spend their own allowance.
--
-- bump_ai_usage is left in place. Replacing it in a migration would break any
-- instance still running the previous deployment for the few seconds between
-- the database changing and the code doing so.
-- ---------------------------------------------------------------------------
create or replace function public.bump_ai_usage_totals(p_kind text, p_date date)
returns table (user_count integer, global_count integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into public.ai_usage as u (user_id, usage_date, kind, count, updated_at)
  values (auth.uid(), p_date, p_kind, 1, now())
  on conflict (user_id, usage_date, kind)
  do update set count = u.count + 1, updated_at = now()
  returning u.count into user_count;

  -- Only the kinds that actually reach a model. 'export' and 'error' are
  -- rate-limited through the same table but cost nothing to run.
  select coalesce(sum(a.count), 0)::integer
    into global_count
    from public.ai_usage a
   where a.usage_date = p_date
     and a.kind in ('food', 'photo', 'coach', 'report');

  return next;
end;
$$;

revoke all on function public.bump_ai_usage_totals(text, date) from public;
grant execute on function public.bump_ai_usage_totals(text, date) to authenticated;
