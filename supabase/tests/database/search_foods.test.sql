-- Searching the food library: by part of a name in the user's language or in English, with
-- typos, best matches first, with the name in the user's language and the default portion.
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

select set_config('role', 'authenticated', true),
  set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select results_eq(
  $$ select food_id, name from public.search_foods('Ei', 'de') limit 2 $$,
  $$ values ('E111100', 'Ei, roh'), ('E111132', 'Ei, gekocht') $$,
  'A name that starts with the query as a word comes first'
);

select ok(
  (select bool_and(name ilike '%yumurta%') from public.search_foods('yumurta', 'tr')),
  'Foods are found by their Turkish names'
);

select is(
  (select name from public.search_foods('inc', 'tr') limit 1),
  'İncir',
  'A Turkish dotted İ is found with an i'
);
select is(
  (select name from public.search_foods('ıspa', 'tr') limit 1),
  'Ispanak, çiğ',
  'A Turkish dotless ı is found with an I'
);
select isnt_empty(
  $$ select * from public.search_foods('KARIŞIK', 'tr') $$,
  'A query in capitals finds the food'
);

select is(
  (select name from public.search_foods('oat flakes', 'de') limit 1),
  'Haferflocken',
  'An English query finds a food and shows its name in the user''s language'
);

select is(
  (select name from public.search_foods('chiken', 'en') limit 1) ilike '%chicken%',
  true,
  'A typo still finds the food'
);

select results_eq(
  $$ select kcal, portion_unit, portion_grams from public.search_foods('Haferflocken', 'de')
     limit 1 $$,
  $$ select f.kcal, p.unit, p.grams from public.foods f
     join public.food_portions p on p.food_id = f.id and p.is_default
     where f.id = 'C133000' $$,
  'A result has its values per 100 g and its default portion'
);

select is(
  (select name from public.search_foods('Banana', 'fr') limit 1),
  'Banana',
  'A language without names falls back to English'
);

select is_empty(
  $$ select * from public.search_foods('E', 'de') $$,
  'A query of one character finds nothing'
);

select is(
  (select count(*)::integer from public.search_foods('an', 'en')),
  30,
  'Up to 30 foods are found'
);

reset role;
update public.foods set archived_at = now() where id = 'C133000';
select set_config('role', 'authenticated', true);

select is_empty(
  $$ select * from public.search_foods('Haferflocken', 'de') where food_id = 'C133000' $$,
  'Archived foods are not found'
);

-- A search's wildcards are the characters themselves, as names are matched by `like`.
select is_empty(
  $$ select * from public.search_foods('%%', 'de') $$,
  'A percent sign in a search matches only itself'
);
select is_empty(
  $$ select * from public.search_foods('E_', 'de') $$,
  'An underscore in a search matches only itself'
);

-- The names a search looks at come from the trigram index on their key (#545).
reset role;
create function pg_temp.plan(query text) returns text language plpgsql as $$
declare
  line text;
  plan text := '';
begin
  for line in execute 'explain (costs off) ' || query loop
    plan := plan || line || E'\n';
  end loop;
  return plan;
end;
$$;
set local enable_seqscan = off;
select matches(
  pg_temp.plan($$ select food_id from public.food_names n
    where n.name_key like '%apfel%' $$),
  'Bitmap Index Scan on food_names_name_key_trgm',
  'A name that holds the search is found through the index'
);
select matches(
  pg_temp.plan($$ select food_id from public.food_names n
    where 'apfel' operator(extensions.<<%) n.name_key $$),
  'Bitmap Index Scan on food_names_name_key_trgm',
  'and so is one with a word close to it'
);
reset enable_seqscan;

select set_config('role', 'anon', true);

select throws_ok(
  $$ select * from public.search_foods('Ei', 'de') $$,
  '42501',
  null,
  'Requests without a session cannot search'
);

select * from finish();
rollback;
