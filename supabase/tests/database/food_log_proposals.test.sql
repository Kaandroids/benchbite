-- Bite proposes changes to the food log; the user applies, keeps or undoes them, and only to the
-- entries as Bite saw them (ADR 0068).
begin;
create extension if not exists pgtap with schema extensions;

select plan(45);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

create temporary table ids (name text primary key, id bigint) on commit drop;
grant select, insert on ids to authenticated;

create function pg_temp.id(name text) returns bigint language sql as $$
  select id from ids where ids.name = id.name;
$$;

create function pg_temp.propose(changes jsonb) returns bigint language sql as $$
  select public.propose_coach_change(
    pg_temp.id('thread'), 'food_log', jsonb_build_object('changes', changes), current_date
  );
$$;

create function pg_temp.decide(name text, decision text) returns text language sql as $$
  select public.decide_coach_proposal(
    pg_temp.id(name), decision::public.coach_proposal_decision, current_date
  )::text;
$$;

-- An entry of the caller's as it is now, or null when it is gone.
create function pg_temp.entry(name text) returns record language sql as $$
  select (e.day, e.meal, e.grams, e.portion_unit, e.portion_count)
  from public.meal_entries e where e.id = pg_temp.id(name);
$$;

reset role;
insert into public.coach_threads (user_id) values ('00000000-0000-0000-0000-00000000000a');
insert into ids select 'thread', max(id) from public.coach_threads;

-- A's pizza at lunch, two slices, and a chocolate bar today; B's breakfast.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
insert into public.meal_entries (day, meal, food_id, grams, portion_unit, portion_count)
  values (current_date, 'lunch', 'C133000', 200, 'serving', 2);
insert into ids select 'pizza', max(id) from public.meal_entries;
insert into public.meal_entries (day, meal, food_id, grams)
  values (current_date, 'snack', 'C133000', 50);
insert into ids select 'chocolate', max(id) from public.meal_entries;
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
insert into public.meal_entries (day, meal, food_id, grams)
  values (current_date, 'breakfast', 'C133000', 80);
insert into ids select 'b entry', max(id) from public.meal_entries;

create temporary table logged on commit drop as
  select * from public.meal_entries where false;
reset role;
insert into logged select * from public.meal_entries where id = pg_temp.id('chocolate');
grant select on logged to authenticated;

-- The pizza moves to dinner, and the chocolate bar was not today.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
insert into ids select 'moves', pg_temp.propose(jsonb_build_array(
  jsonb_build_object('entryId', pg_temp.id('pizza'), 'meal', 'dinner'),
  jsonb_build_object('entryId', pg_temp.id('chocolate'), 'remove', true)
));
select is(
  (select change from public.coach_proposals where id = pg_temp.id('moves')),
  jsonb_build_object('changes', jsonb_build_array(
    jsonb_build_object('entryId', pg_temp.id('pizza'), 'day', current_date, 'meal', 'dinner', 'grams', 200.0),
    jsonb_build_object('entryId', pg_temp.id('chocolate'), 'remove', true)
  )),
  'A proposal fills in what a change leaves as it is'
);
select is(
  (select jsonb_array_length(before) from public.coach_proposals where id = pg_temp.id('moves')),
  2,
  'and keeps the entries as Bite saw them'
);
select is(
  (select status::text from public.coach_proposals where id = pg_temp.id('moves')),
  'pending',
  'It waits for the user'
);
select results_eq(
  $$ select count(*)::integer, min(meal::text) from public.meal_entries $$,
  $$ values (2, 'lunch') $$,
  'and changes nothing until then'
);

select is(pg_temp.decide('moves', 'apply'), 'applied', 'The user applies it');
select is(
  pg_temp.entry('pizza')::text,
  format('(%s,dinner,200.0,serving,2.0)', current_date),
  'The pizza is at dinner, with its portion'
);
select is(pg_temp.entry('chocolate')::text, null, 'and the chocolate bar is gone');
select is(
  (select jsonb_array_length(after) from public.coach_proposals where id = pg_temp.id('moves')),
  1,
  'The proposal keeps what applying left'
);
select throws_ok($$ select pg_temp.decide('moves', 'apply') $$, 'BB036', null, 'A proposal applies once');

-- Undone, the chocolate bar comes back as it was, long after the hour a removed entry is kept for.
reset role;
delete from public.removed_meal_entries;
update public.foods set kcal = 1 where id = 'C133000';
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select is(pg_temp.decide('moves', 'undo'), 'undone', 'Undo puts it back');
select is(
  pg_temp.entry('pizza')::text,
  format('(%s,lunch,200.0,serving,2.0)', current_date),
  'The pizza is at lunch again'
);
select results_eq(
  $$ select id, day, meal, food_id, grams, kcal_per_100g, kcal, created_at
     from public.meal_entries where id = pg_temp.id('chocolate') $$,
  $$ select id, day, meal, food_id, grams, kcal_per_100g, kcal, created_at from logged $$,
  'and the chocolate bar is back with its id, time and values'
);
select throws_ok($$ select pg_temp.decide('moves', 'undo') $$, 'BB036', null, 'Undo is done once');

-- Grams in place of portions, and another day.
insert into ids select 'resize', pg_temp.propose(jsonb_build_array(
  jsonb_build_object('entryId', pg_temp.id('pizza'), 'grams', 150, 'day', current_date - 1)
));
select pg_temp.decide('resize', 'apply');
select is(
  pg_temp.entry('pizza')::text,
  format('(%s,lunch,150.0,,)', current_date - 1),
  'New grams replace the portion, on the day Bite named'
);
select pg_temp.decide('resize', 'undo');
select is(
  pg_temp.entry('pizza')::text,
  format('(%s,lunch,200.0,serving,2.0)', current_date),
  'and undone the entry has its day, grams and portion again'
);

-- Changed meanwhile: never overwritten.
insert into ids select 'stale', pg_temp.propose(jsonb_build_array(
  jsonb_build_object('entryId', pg_temp.id('pizza'), 'meal', 'dinner')
));
update public.meal_entries set grams = 250 where id = pg_temp.id('pizza');
select throws_ok(
  $$ select pg_temp.decide('stale', 'apply') $$, 'BB035', null,
  'An entry changed since the proposal is not changed by it'
);
select is(pg_temp.decide('stale', 'keep'), 'kept', 'The user keeps things as they are instead');
select throws_ok($$ select pg_temp.decide('stale', 'keep') $$, 'BB036', null, 'and keeps it once');

insert into ids select 'edited', pg_temp.propose(jsonb_build_array(
  jsonb_build_object('entryId', pg_temp.id('pizza'), 'meal', 'dinner')
));
select pg_temp.decide('edited', 'apply');
update public.meal_entries set grams = 300 where id = pg_temp.id('pizza');
select throws_ok(
  $$ select pg_temp.decide('edited', 'undo') $$, 'BB035', null,
  'nor undone over a change made after it'
);
update public.meal_entries set grams = 250 where id = pg_temp.id('pizza');

insert into ids select 'removed', pg_temp.propose(jsonb_build_array(
  jsonb_build_object('entryId', pg_temp.id('chocolate'), 'remove', true)
));
select pg_temp.decide('removed', 'apply');
select public.restore_meal_entry(pg_temp.id('chocolate'));
select throws_ok(
  $$ select pg_temp.decide('removed', 'undo') $$, 'BB035', null,
  'A removal is not undone once the user restored the entry themselves'
);

insert into ids select 'gone', pg_temp.propose(jsonb_build_array(
  jsonb_build_object('entryId', pg_temp.id('chocolate'), 'grams', 40)
));
delete from public.meal_entries where id = pg_temp.id('chocolate');
select throws_ok(
  $$ select pg_temp.decide('gone', 'apply') $$, 'BB035', null,
  'nor applied to an entry removed since'
);
select public.restore_meal_entry(pg_temp.id('chocolate'));

-- A removed entry whose own food was deleted since cannot come back.
reset role;
insert into public.custom_foods (user_id, name, kcal, protein_g, carbs_g, fat_g)
values ('00000000-0000-0000-0000-00000000000a', 'Granola', 450, 10, 60, 18);
insert into ids select 'granola', max(id) from public.custom_foods;
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
insert into public.meal_entries (day, meal, custom_food_id, grams)
  values (current_date, 'breakfast', pg_temp.id('granola'), 60);
insert into ids select 'granola entry', max(id) from public.meal_entries;
insert into ids select 'granola gone', pg_temp.propose(jsonb_build_array(
  jsonb_build_object('entryId', pg_temp.id('granola entry'), 'remove', true)
));
select pg_temp.decide('granola gone', 'apply');
reset role;
delete from public.removed_meal_entries where id = pg_temp.id('granola entry');
delete from public.custom_foods where id = pg_temp.id('granola');
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select throws_ok(
  $$ select pg_temp.decide('granola gone', 'undo') $$, 'BB035', null,
  'A removal is not undone once its food is deleted'
);

-- What a proposal may hold.
select throws_ok(
  $$ select pg_temp.propose('[]') $$, '22023', null, 'A proposal changes at least one entry'
);
select throws_ok(
  $$ select pg_temp.propose((select jsonb_agg(jsonb_build_object('entryId', pg_temp.id('pizza'), 'grams', g))
       from generate_series(1, 11) g)) $$,
  '22023', null,
  'and at most ten'
);
select throws_ok(
  $$ select pg_temp.propose(jsonb_build_array(jsonb_build_object('entryId', pg_temp.id('pizza')))) $$,
  '22023', null,
  'Each change says what changes'
);
select throws_ok(
  $$ select pg_temp.propose(jsonb_build_array(
       jsonb_build_object('entryId', pg_temp.id('pizza'), 'remove', true, 'grams', 100))) $$,
  '22023', null,
  'and does not both remove and change an entry'
);
select throws_ok(
  $$ select pg_temp.propose(jsonb_build_array(
       jsonb_build_object('entryId', pg_temp.id('pizza'), 'meal', 'dinner', 'grams', 250))) $$,
  '22023', null,
  'A change that changes nothing is refused'
);
select throws_ok(
  $$ select pg_temp.propose(jsonb_build_array(
       jsonb_build_object('entryId', pg_temp.id('pizza'), 'meal', 'dinner'),
       jsonb_build_object('entryId', pg_temp.id('pizza'), 'grams', 100))) $$,
  'BB045', null,
  'An entry is changed once in a proposal'
);
select throws_ok(
  $$ select pg_temp.propose(jsonb_build_array(
       jsonb_build_object('entryId', pg_temp.id('pizza'), 'day', current_date + 3))) $$,
  'BB020', null,
  'An entry moves only to a day that can be logged'
);
select throws_ok(
  $$ select pg_temp.propose(jsonb_build_array(
       jsonb_build_object('entryId', pg_temp.id('pizza'), 'grams', 6000))) $$,
  '23514', null,
  'and to grams in range'
);

-- An entry on a day closed to logging is the user's history.
reset role;
set local session_replication_role = replica;
insert into public.meal_entries (user_id, day, meal, food_id, grams, kcal_per_100g)
  values ('00000000-0000-0000-0000-00000000000a', current_date - 20, 'lunch', 'C133000', 100, 250);
set local session_replication_role = origin;
insert into ids select 'old', max(id) from public.meal_entries;
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select throws_ok(
  $$ select pg_temp.propose(jsonb_build_array(jsonb_build_object('entryId', pg_temp.id('old'), 'remove', true))) $$,
  'BB020', null,
  'An entry on a day that can no longer be logged is not changed'
);
select is(
  (select count(*)::integer from public.coach_proposals where status = 'pending'),
  1,
  'and the trials leave nothing behind'
);

-- Someone else's.
select throws_ok(
  $$ select pg_temp.propose(jsonb_build_array(jsonb_build_object('entryId', pg_temp.id('b entry'), 'remove', true))) $$,
  'BB044', null,
  'Users propose changes to their own entries only'
);
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select is_empty($$ select 1 from public.coach_proposals $$, 'and read no one else''s proposals');
select throws_ok($$ select pg_temp.decide('gone', 'keep') $$, 'P0002', null, 'nor decide them');
select throws_ok(
  $$ select public.propose_coach_change(pg_temp.id('thread'), 'food_log',
       jsonb_build_object('changes', jsonb_build_array(jsonb_build_object('entryId', pg_temp.id('pizza'), 'remove', true))),
       current_date) $$,
  'P0002', null,
  'nor propose in another user''s thread'
);
reset role;
select is(
  (select grams from public.meal_entries where id = pg_temp.id('b entry')),
  80.0,
  'Another user''s entry is never touched'
);

-- Anon reaches none of it.
set local role anon;
select throws_ok(
  $$ select public.propose_coach_change(1, 'food_log', '{"changes": []}', current_date) $$,
  '42501', null,
  'Signed-out callers propose nothing'
);
reset role;
select ok(
  not bool_or(has_function_privilege(role, p.oid, 'execute')),
  'The food log''s helpers are closed to clients'
)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
cross join (values ('anon'), ('authenticated')) roles (role)
where p.proname in (
  'put_back_meal_entry', 'food_log_entry_ids', 'food_log_entries', 'check_food_log_days',
  'food_log_change', 'apply_food_log_change', 'undo_food_log_change', 'undo_coach_change'
);
select ok(
  has_function_privilege('authenticated', 'public.restore_meal_entry(bigint)', 'execute')
    and not has_function_privilege('anon', 'public.restore_meal_entry(bigint)', 'execute'),
  'Restoring an entry stays open to signed-in users only'
);

-- One window for every check that a day can be logged.
select ok(
  public.is_loggable_day(current_date) and public.is_loggable_day(current_date + 1)
    and public.is_loggable_day(public.last_day_closed_to_logging() + 1),
  'Today, tomorrow for the time zones and the days back to the window can be logged'
);
select ok(
  not public.is_loggable_day(current_date + 2)
    and not public.is_loggable_day(public.last_day_closed_to_logging()),
  'Later days and those closed to logging cannot'
);
select ok(
  has_function_privilege('authenticated', 'public.is_loggable_day(date)', 'execute')
    and not has_function_privilege('anon', 'public.is_loggable_day(date)', 'execute'),
  'Signed-in users can check a day, as their entries'' trigger does'
);
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select throws_ok(
  $$ insert into public.meal_entries (day, meal, food_id, grams)
     values (public.last_day_closed_to_logging(), 'lunch', 'C133000', 100) $$,
  'BB020', 'Only today and the week before can be logged',
  'Logging still refuses a closed day with the same message'
);
select lives_ok(
  $$ insert into public.meal_entries (day, meal, food_id, grams)
     values (public.last_day_closed_to_logging() + 1, 'lunch', 'C133000', 100) $$,
  'and takes the first day still open'
);
reset role;

select * from finish();
rollback;
