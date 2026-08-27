-- ---------------------------------------------------------------------------
-- food_corrections: make Momo learn your kitchen.
--
-- The model estimates "porridge" as a generic bowl of porridge. Yours might be
-- 180 kcal, not 250. You could already fix the entry, but tomorrow it guessed
-- 250 again — the correction died with the row it was made on.
--
-- Keyed on a normalised food name so a correction applies to every future log
-- of the same thing. One row per food per person, overwritten on each new
-- correction, because the latest word is the one that counts.
-- ---------------------------------------------------------------------------
create table if not exists public.food_corrections (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  name_key   text not null,
  name       text not null,
  quantity   text not null default '1 serving',
  calories   numeric(7, 1) not null default 0,
  protein    numeric(6, 1) not null default 0,
  carbs      numeric(6, 1) not null default 0,
  fat        numeric(6, 1) not null default 0,
  fiber      numeric(6, 1) not null default 0,
  sugar      numeric(6, 1) not null default 0,
  times      integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, name_key)
);

alter table public.food_corrections enable row level security;

do $$
begin
  execute 'drop policy if exists "own rows" on public.food_corrections';
  execute 'create policy "own rows" on public.food_corrections
             for all using (auth.uid() = user_id) with check (auth.uid() = user_id)';
end
$$;
