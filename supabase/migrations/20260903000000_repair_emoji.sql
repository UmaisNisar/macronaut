-- ---------------------------------------------------------------------------
-- One-off repair: entries whose "emoji" is a word.
--
-- The model is asked for an emoji and occasionally answers with its name
-- instead — a rice bowl came back as the literal string "bowl", which the app
-- then rendered as text inside the icon circle. Nothing rejected it, because
-- "bowl" is a valid short string.
--
-- The application now resolves every emoji through lib/food-emoji.ts, so no new
-- rows can look like this. Rows already written still can, hence this.
--
-- The mapping here is deliberately small and duplicates a little of that
-- module. It is a one-time data fix rather than live logic, and reaching for
-- the real resolver would mean running application code against production
-- data for the sake of a handful of rows.
-- ---------------------------------------------------------------------------
update public.food_entries
set emoji = case
  when name ilike '%wrap%' or name ilike '%burrito%' or name ilike '%shawarma%' then '🌯'
  when name ilike '%sandwich%' or name ilike '%sub%'                            then '🥪'
  when name ilike '%burger%'                                                    then '🍔'
  when name ilike '%pizza%'                                                     then '🍕'
  when name ilike '%salad%'                                                     then '🥗'
  when name ilike '%soup%' or name ilike '%stew%'                               then '🍲'
  when name ilike '%porridge%' or name ilike '%oat%' or name ilike '%cereal%'   then '🥣'
  when name ilike '%rice%' or name ilike '%biryani%' or name ilike '%bowl%'     then '🍚'
  when name ilike '%pasta%' or name ilike '%spaghetti%'                         then '🍝'
  when name ilike '%curry%' or name ilike '%daal%' or name ilike '%dal%'        then '🍛'
  when name ilike '%chicken%' or name ilike '%turkey%'                          then '🍗'
  when name ilike '%beef%' or name ilike '%steak%' or name ilike '%lamb%'       then '🥩'
  when name ilike '%fish%' or name ilike '%salmon%' or name ilike '%tuna%'      then '🐟'
  when name ilike '%egg%'                                                       then '🥚'
  when name ilike '%yogurt%' or name ilike '%yoghurt%' or name ilike '%milk%'   then '🥛'
  when name ilike '%coffee%'                                                    then '☕'
  when name ilike '%tea%'                                                       then '🍵'
  when name ilike '%coke%' or name ilike '%cola%' or name ilike '%soda%'        then '🥤'
  when name ilike '%apple%'                                                     then '🍏'
  when name ilike '%banana%'                                                    then '🍌'
  when name ilike '%bread%' or name ilike '%toast%'                             then '🍞'
  else '🍽️'
end
-- Only rows whose emoji column contains no pictograph at all: plain letters,
-- digits, spaces and simple punctuation. A real emoji is left alone.
where emoji ~ '^[A-Za-z0-9 ._-]+$';
