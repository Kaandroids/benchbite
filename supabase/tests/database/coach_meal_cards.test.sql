-- Bite's meal cards: kept when Bite estimates a meal, logged only by the user, with the grams they
-- changed, and undone only while the entries are as logged (ADR 0062).
begin;
create extension if not exists pgtap with schema extensions;

select plan(43);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

create temporary table ids (name text primary key, id bigint) on commit drop;
grant select, insert on ids to authenticated;

insert into public.coach_threads (user_id) values ('00000000-0000-0000-0000-00000000000a');
insert into ids select 'thread', max(id) from public.coach_threads;
insert into public.coach_threads (user_id) values ('00000000-0000-0000-0000-00000000000b');
insert into ids select 'b thread', max(id) from public.coach_threads;
insert into public.custom_foods (user_id, name, kcal, protein_g, carbs_g, fat_g)
values ('00000000-0000-0000-0000-00000000000b', 'B''s granola', 450, 10, 60, 18);
insert into ids select 'b food', max(id) from public.custom_foods;
insert into public.recipes (user_id, name, servings, serving_unit)
values ('00000000-0000-0000-0000-00000000000b', 'B''s porridge', 1, 'bowl');
insert into ids select 'b recipe', max(id) from public.recipes;

-- A library food and one the library did not have, as Bite's tool sends them.
create function pg_temp.items() returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('food_id', 'C133000', 'grams', 150),
    jsonb_build_object('name', 'Dal makhani', 'grams', 200, 'kcal', 140, 'protein_g', 6,
      'carbs_g', 14, 'fat_g', 7)
  );
$$;

create function pg_temp.add(items jsonb, day date default current_date) returns bigint
language sql as $$
  select public.add_coach_meal_card((select id from ids where name = 'thread'), day, 'dinner', items);
$$;

create function pg_temp.card(name text) returns public.coach_meal_cards language sql as $$
  select * from public.coach_meal_cards where id = (select id from ids where ids.name = card.name);
$$;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

insert into ids select 'card', pg_temp.add(pg_temp.items());
select is((pg_temp.card('card')).status::text, 'pending', 'A card is kept pending');
select is((pg_temp.card('card')).meal::text, 'dinner', 'on its meal');
select is(
  (select count(*)::integer from public.meal_entries), 0,
  'Keeping a card logs nothing, though it was tried'
);
select is(
  (select count(*)::integer from public.custom_foods), 0,
  'and makes no food of the user''s own'
);

select throws_ok(
  $$ select public.add_coach_meal_card((select id from ids where name = 'b thread'), current_date,
       'dinner', pg_temp.items()) $$,
  'P0002', null, 'A card goes only in one of the user''s threads'
);
select throws_ok(
  $$ select pg_temp.add(pg_temp.items(), current_date - 30) $$,
  'BB020', null, 'A card for a day that cannot be logged is refused at once'
);
select throws_ok(
  format(
    $$ select pg_temp.add(jsonb_build_array(jsonb_build_object('custom_food_id', %s, 'grams', 50))) $$,
    (select id from ids where name = 'b food')
  ),
  '23503', null, 'as is another user''s food'
);
select throws_ok(
  format(
    $$ select pg_temp.add(jsonb_build_array(jsonb_build_object('recipe_id', %s, 'grams', 50))) $$,
    (select id from ids where name = 'b recipe')
  ),
  '23503', null, 'or recipe'
);
select throws_ok(
  $$ select pg_temp.add('[]') $$,
  '22023', null, 'and a card of no items'
);

select throws_ok(
  $$ insert into public.coach_meal_cards (user_id, thread_id, day, meal, items)
     values ('00000000-0000-0000-0000-00000000000a', (select id from ids where name = 'thread'),
       current_date, 'lunch', '[{"food_id": "C133000", "grams": 1}]') $$,
  '42501', null, 'Users do not write cards themselves'
);
select throws_ok(
  $$ update public.coach_meal_cards set status = 'logged' $$,
  '42501', null, 'nor change them'
);
select throws_ok(
  $$ select public.coach_meal_card_entries('{1}') $$,
  '42501', null, 'nor read entries through the helper'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select is(
  (select count(*)::integer from public.coach_meal_cards), 0, 'Users read only their own cards'
);
select throws_ok(
  format($$ select public.log_coach_meal_card(%s) $$, (select id from ids where name = 'card')),
  'P0002', null, 'and log only their own'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select throws_ok(
  format($$ select public.log_coach_meal_card(%s, '{100}') $$, (select id from ids where name = 'card')),
  '22023', null, 'Changed grams are one for each item'
);
select throws_ok(
  format($$ select public.log_coach_meal_card(%s, '{100, null}') $$, (select id from ids where name = 'card')),
  '22023', null, 'and none is left out'
);

-- The user halves the dal on the card.
create temporary table logged on commit drop as
  select * from public.log_coach_meal_card((select id from ids where name = 'card'), '{150, 100}');
grant select on logged to authenticated;

select is((select status::text from logged), 'logged', 'Adding logs the card');
select results_eq(
  $$ select e.food_id, c.name, e.grams, e.meal::text, e.day from public.meal_entries e
     left join public.custom_foods c on c.id = e.custom_food_id order by e.id $$,
  $$ values ('C133000', null, 150.0, 'dinner', current_date),
       (null, 'Dal makhani', 100.0, 'dinner', current_date) $$,
  'at the grams the user gave, on its day and meal'
);
select is(
  (select entry_ids from logged),
  (select array_agg(id order by id) from public.meal_entries),
  'It keeps the entries it made'
);
select is(
  (select food_ids from logged),
  (select array_agg(id) from public.custom_foods),
  'and the food of the user''s own it saved'
);
select is(
  (select kcal from logged), (select sum(kcal) from public.meal_entries),
  'and what they add'
);
select is(
  (pg_temp.card('card')).status::text, 'logged', 'The card reads as logged'
);

-- A correction, which holds the dal the card saved by its name and values, as Bite's tool keeps an
-- own food of exactly the search name.
insert into ids select 'correction', pg_temp.add(jsonb_build_array(
  jsonb_build_object('name', 'Dal makhani', 'grams', 250, 'kcal', 140, 'protein_g', 6,
    'carbs_g', 14, 'fat_g', 7)
));
select throws_ok(
  format($$ select public.log_coach_meal_card(%s) $$, (select id from ids where name = 'card')),
  'BB036', null, 'A card is logged once'
);

-- The user changes an entry: Undo is theirs no longer, until it is as logged again.
update public.meal_entries set grams = 300 where food_id = 'C133000';
select throws_ok(
  format($$ select public.undo_coach_meal_card(%s) $$, (select id from ids where name = 'card')),
  'BB035', null, 'A card is not undone once its entries changed'
);
update public.meal_entries set grams = 150 where food_id = 'C133000';

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select throws_ok(
  format($$ select public.undo_coach_meal_card(%s) $$, (select id from ids where name = 'card')),
  'P0002', null, 'Users undo only their own cards'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select is(
  (public.undo_coach_meal_card((select id from ids where name = 'card'))).status::text, 'undone',
  'Undo takes back a card whose entries are as logged'
);
select is(
  (select count(*)::integer from public.meal_entries), 0, 'Its entries are gone'
);
select is(
  (select count(*)::integer from public.custom_foods), 0, 'and the food it saved'
);
select throws_ok(
  format($$ select public.undo_coach_meal_card(%s) $$, (select id from ids where name = 'card')),
  'BB036', null, 'A card is undone once'
);
select throws_ok(
  format($$ select public.log_coach_meal_card(%s) $$, (select id from ids where name = 'card')),
  'BB036', null, 'and not logged again'
);
select is(
  (public.log_coach_meal_card((select id from ids where name = 'correction'))).status::text,
  'logged', 'A card that holds the food an undone card saved still logs'
);
select results_eq(
  $$ select c.name, e.grams from public.meal_entries e
     join public.custom_foods c on c.id = e.custom_food_id $$,
  $$ values ('Dal makhani'::text, 250.0) $$,
  'with the food made again'
);

-- A card saves Ayran, which the user then logs again at lunch: undoing the card leaves it.
create function pg_temp.own(name text) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('name', name, 'grams', 250, 'kcal', 36,
    'protein_g', 1.7, 'carbs_g', 2.5, 'fat_g', 2));
$$;
insert into ids select 'ayran card', pg_temp.add(pg_temp.own('Ayran'));
select public.log_coach_meal_card((select id from ids where name = 'ayran card'));
insert into public.meal_entries (day, meal, custom_food_id, grams)
select current_date, 'lunch', id, 200 from public.custom_foods where name = 'Ayran';
select is(
  (public.undo_coach_meal_card((select id from ids where name = 'ayran card'))).status::text,
  'undone', 'A card whose food the user logged again is undone'
);
select results_eq(
  $$ select e.meal::text, c.archived_at is null from public.meal_entries e
     join public.custom_foods c on c.id = e.custom_food_id where c.name = 'Ayran' $$,
  $$ values ('lunch', true) $$,
  'and only its own entry goes: the food stays, not archived'
);

-- A card saves Kefir, which the user then changes.
insert into ids select 'kefir card', pg_temp.add(pg_temp.own('Kefir'));
select public.log_coach_meal_card((select id from ids where name = 'kefir card'));
update public.custom_foods set kcal = 60 where name = 'Kefir';
select is(
  (public.undo_coach_meal_card((select id from ids where name = 'kefir card'))).status::text,
  'undone', 'A card whose food the user changed is undone'
);
select is(
  (select count(*)::integer from public.meal_entries e
   join public.custom_foods c on c.id = e.custom_food_id where c.name = 'Kefir'),
  0, 'without its entry'
);
select results_eq(
  $$ select kcal, archived_at is null from public.custom_foods where name = 'Kefir' $$,
  $$ values (60.0, true) $$,
  'and the changed food stays as the user made it'
);

-- A card saves Lassi, which nothing else uses: undoing it removes the food.
insert into ids select 'lassi card', pg_temp.add(pg_temp.own('Lassi'));
select public.log_coach_meal_card((select id from ids where name = 'lassi card'));
select public.undo_coach_meal_card((select id from ids where name = 'lassi card'));
select is(
  (select count(*)::integer from public.custom_foods where name = 'Lassi'),
  0, 'A food only its card used goes with it'
);

-- A card saves Chaas, which the user stars: the star names it, so undoing the card leaves it.
insert into ids select 'chaas card', pg_temp.add(pg_temp.own('Chaas'));
select public.log_coach_meal_card((select id from ids where name = 'chaas card'));
insert into public.favourite_foods (custom_food_id)
select id from public.custom_foods where name = 'Chaas';
select public.undo_coach_meal_card((select id from ids where name = 'chaas card'));
select results_eq(
  $$ select archived_at is null from public.custom_foods where name = 'Chaas' $$,
  $$ values (true) $$,
  'A food the user starred stays, not archived'
);

-- 50 cards today already.
reset role;
insert into public.coach_meal_cards (user_id, thread_id, day, meal, items)
select '00000000-0000-0000-0000-00000000000a', (select id from ids where name = 'thread'),
  current_date, 'snack', '[{"food_id": "C133000", "grams": 1}]'
from generate_series(1, 49);
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select throws_ok(
  $$ select pg_temp.add(pg_temp.items()) $$,
  'BB038', null, 'A user keeps at most 50 cards a day'
);

reset role;
select set_config('role', 'anon', true);
select throws_ok(
  $$ select public.add_coach_meal_card(1, current_date, 'dinner', '[]') $$,
  '42501', null, 'Only signed-in users keep cards'
);
select throws_ok(
  $$ select public.log_coach_meal_card(1) $$,
  '42501', null, 'log them'
);
select throws_ok(
  $$ select public.undo_coach_meal_card(1) $$,
  '42501', null, 'or undo them'
);

select * from finish();
rollback;
