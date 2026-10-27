-- Foods of one's own: only their owner sees, searches and logs them, and deleting one archives it
-- and keeps the entries that name it.
begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

-- What the app sends: a yoghurt from its label, with a pot of 200 g.
insert into public.custom_foods (name, kcal, protein_g, carbs_g, fat_g, portion_unit, portion_grams)
  values ('Protein yoghurt, vanilla', 70, 10, 6.5, 0.3, 'serving', 200);

create temporary table mine on commit drop as select id from public.custom_foods;
grant select on mine to authenticated;

select results_eq(
  $$ select user_id from public.custom_foods $$,
  $$ values ('00000000-0000-0000-0000-00000000000a'::uuid) $$,
  'A food of one''s own belongs to its creator'
);

select throws_ok(
  $$ insert into public.custom_foods (name, kcal, protein_g, carbs_g, fat_g)
     values ('PROTEIN YOGHURT, VANILLA', 1, 1, 1, 1) $$,
  '23505',
  null,
  'A user''s foods have different names'
);
select throws_ok(
  $$ insert into public.custom_foods (name, kcal, protein_g, carbs_g, fat_g)
     values ('Too much', 900, 60, 40, 10) $$,
  '23514',
  null,
  'Protein, carbs and fat add up to at most 100 g per 100 g'
);
select throws_ok(
  $$ insert into public.custom_foods (user_id, name, kcal, protein_g, carbs_g, fat_g)
     values ('00000000-0000-0000-0000-00000000000b', 'Not mine', 1, 1, 1, 1) $$,
  '42501',
  null,
  'A food cannot be made for another user'
);

insert into public.meal_entries (day, meal, custom_food_id, grams)
  select current_date, 'snack', id, 200 from mine;

select results_eq(
  $$ select kcal_per_100g, kcal from public.meal_entries $$,
  $$ values (70.0::numeric, 140.0::numeric) $$,
  'An entry copies the values of a food of one''s own'
);

select throws_ok(
  $$ insert into public.meal_entries (day, meal, food_id, custom_food_id, grams)
     select current_date, 'snack', 'C133000', id, 50 from mine $$,
  '23514',
  null,
  'An entry names one food'
);

select results_eq(
  $$ select food_id, custom_food_id, name, portion_grams
     from public.search_foods('protein yog', 'en') limit 1 $$,
  $$ select null::text, id, 'Protein yoghurt, vanilla', 200.0::numeric from mine $$,
  'Search finds one''s own foods'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');

select is_empty(
  $$ select * from public.custom_foods $$,
  'Users do not see the foods of others'
);
select is_empty(
  $$ select * from public.search_foods('protein yoghurt', 'en') where custom_food_id is not null $$,
  'Search does not find the foods of others'
);
select throws_ok(
  $$ insert into public.meal_entries (day, meal, custom_food_id, grams)
     select current_date, 'snack', id, 50 from mine $$,
  '23503',
  null,
  'Users cannot log the foods of others'
);

update public.custom_foods set name = 'Taken', archived_at = now();

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

select results_eq(
  $$ select name, archived_at from public.custom_foods $$,
  $$ values ('Protein yoghurt, vanilla', null::timestamptz) $$,
  'Users cannot change or delete the foods of others'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

select throws_ok(
  $$ delete from public.custom_foods $$,
  '42501',
  null,
  'Foods of one''s own are archived, not deleted'
);

update public.custom_foods set kcal = 1, archived_at = '2000-01-01';

select is(
  (select archived_at from public.custom_foods),
  now(),
  'Deleting takes the server''s time'
);
select throws_ok(
  $$ update public.custom_foods set archived_at = null $$,
  'BB025',
  null,
  'A deleted food cannot be brought back'
);
select throws_ok(
  $$ update public.custom_foods set name = 'Renamed' $$,
  'BB025',
  null,
  'A deleted food cannot be changed'
);

select throws_ok(
  $$ insert into public.meal_entries (day, meal, custom_food_id, grams)
     select current_date, 'snack', id, 50 from mine $$,
  'BB022',
  null,
  'A deleted food cannot be logged'
);
select results_eq(
  $$ select kcal from public.meal_entries $$,
  $$ values (140.0::numeric) $$,
  'Changing or deleting a food leaves its past entries as they were'
);

-- Removing an entry of it and undoing that brings it back with its food.
create temporary table logged on commit drop as select id from public.meal_entries;
grant select on logged to authenticated;
delete from public.meal_entries;
select public.restore_meal_entry((select id from logged));

select results_eq(
  $$ select custom_food_id, kcal from public.meal_entries $$,
  $$ select id, 140.0::numeric from mine $$,
  'An entry of a food of one''s own is restored with it'
);

-- 199 more make 200 that are not deleted; deleted ones count up to 1,000.
insert into public.custom_foods (name, kcal, protein_g, carbs_g, fat_g)
  select 'Food ' || n, 1, 1, 1, 1 from generate_series(1, 200) n;

select throws_ok(
  $$ insert into public.custom_foods (name, kcal, protein_g, carbs_g, fat_g)
     values ('One too many', 1, 1, 1, 1) $$,
  'BB024',
  null,
  'A user has up to 200 foods of their own'
);

update public.custom_foods set archived_at = now() where archived_at is null;
insert into public.custom_foods (name, kcal, protein_g, carbs_g, fat_g)
  select 'More ' || n, 1, 1, 1, 1 from generate_series(1, 200) n;
update public.custom_foods set archived_at = now() where archived_at is null;
insert into public.custom_foods (name, kcal, protein_g, carbs_g, fat_g)
  select 'Again ' || n, 1, 1, 1, 1 from generate_series(1, 200) n;
update public.custom_foods set archived_at = now() where archived_at is null;
insert into public.custom_foods (name, kcal, protein_g, carbs_g, fat_g)
  select 'Still ' || n, 1, 1, 1, 1 from generate_series(1, 200) n;
update public.custom_foods set archived_at = now() where archived_at is null;
insert into public.custom_foods (name, kcal, protein_g, carbs_g, fat_g)
  select 'Last ' || n, 1, 1, 1, 1 from generate_series(1, 199) n;

select throws_ok(
  $$ insert into public.custom_foods (name, kcal, protein_g, carbs_g, fat_g)
     values ('One too many', 1, 1, 1, 1) $$,
  'BB024',
  null,
  'Deleted foods count too, up to 1,000'
);

select set_config('role', 'anon', true);

select throws_ok(
  $$ insert into public.custom_foods (name, kcal, protein_g, carbs_g, fat_g)
     values ('Guest', 1, 1, 1, 1) $$,
  '42501',
  null,
  'Requests without a session cannot add foods'
);
select throws_ok(
  $$ select * from public.custom_foods $$,
  '42501',
  null,
  'Requests without a session cannot read foods of one''s own'
);

select * from finish();
rollback;
