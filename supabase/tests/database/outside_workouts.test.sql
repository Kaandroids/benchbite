-- import_outside_workouts() keeps the workouts other apps recorded in a store (#468, ADR 0106): the
-- store is the truth for the time read, rows of the other store and of other times stay, and
-- outside_workout_list leaves out a watch's copy of a logged workout. Only the caller's rows, read
-- by them alone, and no more than the limit.
begin;
create extension if not exists pgtap with schema extensions;

select plan(32);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

-- A workout of `minutes` that started `hours_ago`, as the app sends it.
create function pg_temp.workout(id text, hours_ago numeric, minutes integer, extra jsonb default '{}')
returns jsonb language sql as $$
  select jsonb_build_object(
    'id', id,
    'activity', 'running',
    'startedAt', now() - make_interval(secs => hours_ago * 3600),
    'endedAt', now() - make_interval(secs => hours_ago * 3600) + make_interval(mins => minutes),
    'startedOn', current_date,
    'activeKcal', 310.4,
    'heartRateAvg', 148,
    'source', 'Apple Watch'
  ) || extra;
$$;

create function pg_temp.import(workouts jsonb, store text default 'appleHealth') returns integer
language sql as $$
  select public.import_outside_workouts(
    workouts, store::public.health_store, now() - interval '30 days', now() + interval '1 hour',
    current_date
  );
$$;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

select is(
  pg_temp.import(jsonb_build_array(pg_temp.workout('run', 5, 32), pg_temp.workout('ride', 30, 65))),
  2,
  'Two new workouts are kept'
);
select results_eq(
  $$ select source_id, activity, active_kcal, heart_rate_avg, source from public.outside_workouts
     order by started_at desc $$,
  $$ values ('run', 'running', 310, 148::smallint, 'Apple Watch'),
            ('ride', 'running', 310, 148::smallint, 'Apple Watch') $$,
  'With their activity, rounded calories, heart rate and source'
);
select is(
  pg_temp.import(jsonb_build_array(pg_temp.workout('run', 5, 32), pg_temp.workout('ride', 30, 65))),
  0,
  'The same workouts again change nothing'
);
select is(
  pg_temp.import(jsonb_build_array(
    pg_temp.workout('run', 5, 32, '{"activeKcal": 290}'),
    pg_temp.workout('ride', 30, 65)
  )),
  1,
  'A workout changed in the store is changed'
);
select is(
  pg_temp.import(jsonb_build_array(pg_temp.workout('run', 5, 32, '{"activeKcal": 290}'))),
  1,
  'A workout no longer in the store is taken out'
);
select is(
  (select count(*)::integer from public.outside_workouts),
  1,
  'And only the one given stays'
);
select is(
  pg_temp.import(jsonb_build_array(pg_temp.workout('hc-walk', 3, 20)), 'healthConnect'),
  1,
  'A workout from the other store is kept'
);
select is(
  (select count(*)::integer from public.outside_workouts where store = 'appleHealth'),
  1,
  'Without taking out the first store’s'
);
select is(
  public.import_outside_workouts(
    '[]', 'appleHealth', now() - interval '1 hour', now() + interval '1 hour', current_date
  ),
  0,
  'Workouts before since are not taken out'
);
select is(
  public.import_outside_workouts(
    jsonb_build_array(pg_temp.workout('run', 5, 32, '{"activeKcal": 290}')),
    'appleHealth', now() - interval '30 days', now() - interval '6 hours', current_date
  ),
  0,
  'A workout from after until is left out, and the rows after it stay'
);
select is(
  (select count(*)::integer from public.outside_workouts where store = 'appleHealth'),
  1,
  'So the app can read a longer time in parts'
);
select is(
  pg_temp.import(jsonb_build_array(
    pg_temp.workout('run', 5, 32, '{"activeKcal": 290}'),
    pg_temp.workout('long', 40, 25 * 60),
    pg_temp.workout('backwards', 10, -5),
    pg_temp.workout('', 12, 20),
    pg_temp.workout('Bad', 12, 20, '{"activity": "Running!"}'),
    pg_temp.workout('nodate', 12, 20, '{"startedAt": "yesterday-ish"}'),
    pg_temp.workout('old', 24 * 40, 20),
    pg_temp.workout('future', 5, 20, '{"startedAt": "9999-01-01T00:00:00Z", "endedAt": "9999-01-01T00:20:00Z"}'),
    pg_temp.workout('wrongday', 5, 20, jsonb_build_object('startedOn', current_date - 10))
  )),
  0,
  'Entries that are no workout, start outside the time read or on another day, are left out on their own'
);
select is(
  pg_temp.import(jsonb_build_array(
    pg_temp.workout('run', 5, 32, '{"activeKcal": 290}'),
    pg_temp.workout('odd', 8, 20, '{"activeKcal": 9999, "heartRateAvg": 400, "source": "  "}')
  )),
  1,
  'A workout with figures out of range is kept'
);
select results_eq(
  $$ select active_kcal, heart_rate_avg, source from public.outside_workouts where source_id = 'odd' $$,
  $$ values (null::integer, null::smallint, null::text) $$,
  'With those figures as none'
);

-- A strength workout logged from 4.5 to 4 hours ago, under a watch's workout of the same time.
reset role;
insert into public.workout_logs (user_id, name, started_at, finished_at) values
  ('00000000-0000-0000-0000-00000000000a', 'Full body', now() - interval '270 minutes',
    now() - interval '240 minutes');
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select is(
  pg_temp.import(jsonb_build_array(
    pg_temp.workout('run', 5, 32, '{"activeKcal": 290}'),
    pg_temp.workout('odd', 8, 20, '{"activeKcal": 9999, "heartRateAvg": 400, "source": "  "}'),
    pg_temp.workout('gym', 4.55, 33, '{"activity": "strength_training"}'),
    pg_temp.workout('walk-home', 4.1, 30, '{"activity": "walking"}')
  )),
  2,
  'Workouts overlapping a log are kept'
);
select results_eq(
  $$ select source_id from public.outside_workout_list where store = 'appleHealth'
     order by started_at desc $$,
  $$ values ('walk-home'), ('run'), ('odd') $$,
  'The list leaves out the one covering most of the log, not one that only touches it'
);

-- A 20-minute log in the middle of a four-hour hike.
reset role;
insert into public.workout_logs (user_id, name, started_at, finished_at) values
  ('00000000-0000-0000-0000-00000000000a', 'Core', now() - interval '20 hours',
    now() - interval '1180 minutes');
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select is(
  pg_temp.import(jsonb_build_array(
    pg_temp.workout('run', 5, 32, '{"activeKcal": 290}'),
    pg_temp.workout('odd', 8, 20, '{"activeKcal": 9999, "heartRateAvg": 400, "source": "  "}'),
    pg_temp.workout('gym', 4.55, 33, '{"activity": "strength_training"}'),
    pg_temp.workout('walk-home', 4.1, 30, '{"activity": "walking"}'),
    pg_temp.workout('hike', 22, 240, '{"activity": "hiking"}')
  )),
  1,
  'A long hike is kept'
);
select ok(
  exists (select 1 from public.outside_workout_list where source_id = 'hike'),
  'And listed, though a short log falls inside it'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select is(
  (select count(*)::integer from public.outside_workouts),
  0,
  'Another user reads none of them'
);
select is(
  (select count(*)::integer from public.outside_workout_list),
  0,
  'Nor of the list'
);
select is(
  pg_temp.import(jsonb_build_array(pg_temp.workout('run', 5, 32))),
  1,
  'Their own import keeps their own row'
);
select throws_ok(
  $$ insert into public.outside_workouts (user_id, store, source_id, activity, started_at,
       ended_at, started_on)
     values ('00000000-0000-0000-0000-00000000000b', 'appleHealth', 'x', 'running', now(),
       now() + interval '1 minute', current_date) $$,
  '42501',
  null,
  'No one writes the rows directly'
);
select throws_ok(
  $$ update public.outside_workouts set activity = 'walking' $$,
  '42501',
  null,
  'Nor change them'
);
select throws_ok(
  $$ delete from public.outside_workouts $$,
  '42501',
  null,
  'Nor delete them'
);
select throws_ok(
  $$ select public.import_outside_workouts(
       '[]', 'googleFit', now() - interval '1 day', now(), current_date) $$,
  '22P02',
  null,
  'An unknown store is refused'
);
select throws_ok(
  $$ select public.import_outside_workouts(
       '[]', 'appleHealth', now() - interval '500 days', now(), current_date) $$,
  '22023',
  'The time read is within the last 400 days',
  'A read from too long ago is refused'
);
select throws_ok(
  $$ select public.import_outside_workouts(
       '[]', 'appleHealth', now(), now() - interval '1 day', current_date) $$,
  '22023',
  'The time read is within the last 400 days',
  'A time that ends before it starts is refused'
);

-- Years of workouts kept before the last 400 days, which do not count toward the limit.
reset role;
insert into public.outside_workouts (user_id, store, source_id, activity, started_at, ended_at,
  started_on, imported_at)
select '00000000-0000-0000-0000-00000000000b', 'healthConnect', 'years-ago-' || n, 'walking',
  now() - make_interval(days => 400 + n), now() - make_interval(days => 400 + n) + interval '20 minutes',
  (now() - make_interval(days => 400 + n))::date, now() - make_interval(days => 400 + n)
from generate_series(1, public.outside_workout_limit() + 650) as n;
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select is(
  pg_temp.import(jsonb_build_array(pg_temp.workout('run', 5, 32), pg_temp.workout('today', 2, 30))),
  1,
  'Workouts from years ago do not count toward the limit'
);

-- A user whose imports of the last 400 days are at the limit, though the workouts start long ago, as
-- a caller could date them to slip out of the count. The next workout is one too many.
reset role;
insert into public.outside_workouts (user_id, store, source_id, activity, started_at, ended_at,
  started_on)
select '00000000-0000-0000-0000-00000000000b', 'healthConnect', 'old-' || n, 'walking',
  now() - interval '450 days', now() - interval '450 days' + interval '20 minutes',
  (now() - interval '450 days')::date
from generate_series(1, public.outside_workout_limit()) as n;
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select throws_ok(
  $$ select pg_temp.import(jsonb_build_array(pg_temp.workout('one-more', 2, 30))) $$,
  '54000',
  'Too many outside workouts',
  'An import past the limit is refused, counted by when the workouts were kept'
);

set local role anon;
select throws_ok(
  $$ select public.import_outside_workouts(
       '[]', 'appleHealth', now() - interval '1 day', now(), current_date) $$,
  '42501',
  null,
  'Anonymous callers may not import'
);
select throws_ok(
  $$ select * from public.outside_workouts $$,
  '42501',
  null,
  'Nor read the workouts'
);
select throws_ok(
  $$ select * from public.outside_workout_list $$,
  '42501',
  null,
  'Nor the list'
);

select * from finish();
rollback;
