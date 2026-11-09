-- import_outside_workouts() keeps the workouts other apps recorded in a store (#468, ADR 0106): the
-- store is the truth from `since` on, rows of the other store stay, and outside_workout_list leaves
-- out a watch's copy of a logged workout. Only the caller's rows, read by them alone.
begin;
create extension if not exists pgtap with schema extensions;

select plan(21);

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
  select public.import_outside_workouts(workouts, store, now() - interval '30 days', current_date);
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
  $$ values ('run', 'running', 310::smallint, 148::smallint, 'Apple Watch'),
            ('ride', 'running', 310::smallint, 148::smallint, 'Apple Watch') $$,
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
    jsonb_build_array(pg_temp.workout('run', 5, 32, '{"activeKcal": 290}')),
    'appleHealth', now() - interval '1 hour', current_date
  ),
  0,
  'Workouts before since are neither given nor taken out'
);
select is(
  pg_temp.import(jsonb_build_array(
    pg_temp.workout('run', 5, 32, '{"activeKcal": 290}'),
    pg_temp.workout('long', 40, 25 * 60),
    pg_temp.workout('backwards', 10, -5),
    pg_temp.workout('', 12, 20),
    pg_temp.workout('Bad', 12, 20, '{"activity": "Running!"}'),
    pg_temp.workout('nodate', 12, 20, '{"startedAt": "yesterday-ish"}'),
    pg_temp.workout('old', 24 * 40, 20)
  )),
  0,
  'Entries that are no workout, or start before since, are left out on their own'
);
select is(
  pg_temp.import(jsonb_build_array(
    pg_temp.workout('run', 5, 32, '{"activeKcal": 290}'),
    pg_temp.workout('odd', 8, 20, '{"activeKcal": 99999, "heartRateAvg": 400, "source": "  "}')
  )),
  1,
  'A workout with figures out of range is kept'
);
select results_eq(
  $$ select active_kcal, heart_rate_avg, source from public.outside_workouts where source_id = 'odd' $$,
  $$ values (null::smallint, null::smallint, null::text) $$,
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
    pg_temp.workout('odd', 8, 20, '{"activeKcal": 99999, "heartRateAvg": 400, "source": "  "}'),
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
  $$ select public.import_outside_workouts('[]', 'googleFit', now() - interval '1 day', current_date) $$,
  '22023',
  'The store is Apple Health or Health Connect',
  'An unknown store is refused'
);
select throws_ok(
  $$ select public.import_outside_workouts('[]', 'appleHealth', now() - interval '500 days', current_date) $$,
  '22023',
  'Since is within the last 400 days',
  'A read from too long ago is refused'
);

set local role anon;
select throws_ok(
  $$ select public.import_outside_workouts('[]', 'appleHealth', now() - interval '1 day', current_date) $$,
  '42501',
  null,
  'Anonymous callers may not import'
);

select * from finish();
rollback;
