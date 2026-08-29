-- ---------------------------------------------------------------------------
-- food_entries.alternatives: the model's runner-up guesses, kept with the row.
--
-- Some foods cannot be identified from a photograph with any confidence. A
-- thirty-percent-full glass of dark liquid is coffee, cola, iced tea or a diet
-- cola, and a model asked to pick one will pick one — a Coke Zero came back as
-- coffee, which is how this column came to exist.
--
-- Guessing silently is the worst of the options and refusing to guess is not
-- much better. Committing to an answer and carrying the runner-ups lets the
-- guess be corrected in a tap.
--
-- Stored rather than shown once at logging time, because you notice the drink
-- was wrong when you look back at the day, not during the two seconds the
-- confirmation card is on screen. Each alternative carries its own nutrition,
-- so switching is a local update and not a second model call.
-- ---------------------------------------------------------------------------
alter table public.food_entries
  add column if not exists alternatives jsonb not null default '[]'::jsonb;

comment on column public.food_entries.alternatives is
  'Runner-up identifications with their own macros. Empty when the read was unambiguous.';
