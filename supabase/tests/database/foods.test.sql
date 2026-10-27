-- The imported food library: every food has its names and one default portion, and clients can
-- read the library but not change it.
begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

select cmp_ok(
  (select count(*) from public.foods)::integer, '>=', 300,
  'The chosen foods are imported'
);

select is_empty(
  $$ select f.id, l.language from public.foods f
     cross join (values ('en'), ('de'), ('tr')) as l (language)
     left join public.food_names n on n.food_id = f.id and n.language = l.language
     where n.food_id is null $$,
  'Every food has an English, German and Turkish name'
);

select is_empty(
  $$ select id from public.foods where archived_at is not null $$,
  'The listed foods are not archived'
);

select is_empty(
  $$ select f.id from public.foods f
     left join public.food_portions p on p.food_id = f.id and p.is_default
     where p.food_id is null $$,
  'Every food has a default portion'
);

select throws_ok(
  $$ insert into public.food_portions (food_id, unit, grams, is_default)
     values ('C133000', 'handful', 30, true) $$,
  '23505',
  null,
  'A food cannot have two default portions'
);

select results_eq(
  $$ select f.kcal, f.protein_g, f.carbs_g, f.fat_g, f.food_group
     from public.foods f where f.id = 'C133000' $$,
  $$ values (348.0::numeric, 13.22::numeric, 53.30::numeric, 6.65::numeric,
       'cereals'::public.food_group) $$,
  'Nutrients per 100 g come from the BLS'
);

select throws_ok(
  $$ update public.food_names set name = 'YUMURTA, ÇIĞ' where food_id = 'C133000' and language = 'tr' $$,
  '23505',
  null,
  'A name is used once per language, whatever its case'
);
select lives_ok(
  $$ update public.food_names set name = 'Haferflocken' where food_id = 'C133000' and language = 'en' $$,
  'The same name may be used in another language'
);

select throws_ok(
  $$ insert into public.food_names (food_id, language, name) values ('C133000', 'english', 'x') $$,
  '23514',
  null,
  'A language is a two-letter code'
);

select set_config('role', 'anon', true);

select isnt_empty(
  $$ select * from public.foods f join public.food_names n on n.food_id = f.id
     join public.food_portions p on p.food_id = f.id $$,
  'Guests can read foods, their names and portions'
);
select throws_ok(
  $$ insert into public.foods (id, source, food_group, kcal, protein_g, carbs_g, fat_g)
     values ('Z000000', 'bls', 'dishes', 1, 1, 1, 1) $$,
  '42501',
  null,
  'Guests cannot add foods'
);

select set_config('role', 'authenticated', true),
  set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select throws_ok(
  $$ update public.foods set kcal = 1 where id = 'C133000' $$,
  '42501',
  null,
  'Signed-in users cannot change foods'
);
select throws_ok(
  $$ insert into public.food_names (food_id, language, name) values ('C133000', 'fr', 'x') $$,
  '42501',
  null,
  'Signed-in users cannot add names'
);
select throws_ok(
  $$ delete from public.food_portions where food_id = 'C133000' $$,
  '42501',
  null,
  'Signed-in users cannot remove portions'
);

select * from finish();
rollback;
