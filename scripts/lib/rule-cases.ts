// Cases of the rules both the app and the database keep (#546), in supabase/tests/rules/cases.json:
// Jest checks the app's copies against them, and this writes the pgTAP test that checks the
// database's, so that a change to one side without the other fails a test.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const RULE_CASES_PATH = 'supabase/tests/rules/cases.json';
export const RULE_CASES_SQL_PATH = 'supabase/tests/database/rule_cases.test.sql';

type SetValues = {
  weightKg: number | null;
  reps: number | null;
  seconds: number | null;
  meters: number | null;
};

export type RuleCases = {
  oneRepMax: { weightKg: number; reps: number; expected: number }[];
  recordValues: {
    name: string;
    metrics: string[];
    set: SetValues;
    expected: Record<string, number>;
  }[];
  weightStep: { equipment: string | null; expected: number }[];
  weekSchedule: {
    name: string;
    /** The device's day, YYYY-MM-DD; the week is the one it is in. */
    today: string;
    workouts: { id: number; weekdays: number[]; active?: boolean }[];
    moves: { workoutId: number; fromOn: string; toOn: string | null }[];
    logs: { workoutId: number; startedOn: string }[];
    /** Each workout of each day after the week's moves; skipped only for one not done. */
    expected: { day: string; workoutId: number; done: boolean; skipped: boolean }[];
  }[];
};

const USER = '00000000-0000-0000-0000-0000000005e1';

/** A SQL literal of a value, or null. */
function sql(value: string | number | null): string {
  if (value === null) {
    return 'null';
  }
  return typeof value === 'number' ? String(value) : `'${value.replace(/'/g, "''")}'`;
}

/** The pgTAP test of the database's side of the cases in `root`. */
export function ruleCasesSql(root: string): string {
  const cases = JSON.parse(readFileSync(join(root, RULE_CASES_PATH), 'utf8')) as RuleCases;
  const tests =
    cases.oneRepMax.length +
    cases.recordValues.length +
    cases.weightStep.length +
    cases.weekSchedule.length;
  const oneRepMax = cases.oneRepMax.map(
    ({ weightKg, reps, expected }) =>
      `select is(public.one_rep_max(${weightKg}, ${reps}), ${expected}::numeric, 'one_rep_max(${weightKg}, ${reps})');`,
  );
  const weightStep = cases.weightStep.map(
    ({ equipment, expected }) =>
      `select is(public.weight_step(${sql(equipment)}), ${expected}::numeric, 'weight_step(${equipment ?? 'null'})');`,
  );
  // Each set in a log of its own, for a library exercise that records what the case's does.
  const logs = cases.recordValues.map(({ metrics, set }, index) =>
    [
      `with exercise as (`,
      `  select id from public.exercises`,
      `  where owner_id is null and metrics = '{${metrics.join(',')}}' order by id limit 1`,
      `), log as (`,
      `  insert into public.workout_logs (user_id, name, started_at, finished_at, started_on)`,
      `  values ('${USER}', 'Rules', now() - interval '1 hour', now(), current_date) returning id`,
      `)`,
      `insert into cases select ${index}, log.id, exercise.id from log, exercise;`,
      `insert into public.logged_sets (log_id, user_id, exercise_position, set_position, exercise_id,`,
      `  weight_kg, reps, seconds, meters)`,
      `select log_id, '${USER}', 0, 0, exercise_id, ${sql(set.weightKg)}, ${sql(set.reps)},`,
      `  ${sql(set.seconds)}, ${sql(set.meters)}`,
      `from cases where n = ${index};`,
    ].join('\n'),
  );
  const records = cases.recordValues.map(({ name, expected }, index) =>
    [
      `select is(`,
      `  (select coalesce(jsonb_object_agg(r.kind, r.value), '{}') from cases c`,
      `   cross join lateral public.record_candidates(c.exercise_id) r`,
      // The most time is a workout's total, not a set's: recordValues() leaves it out too.
      `   where c.n = ${index} and r.log_id = c.log_id and r.kind <> 'most_time'),`,
      `  ${sql(JSON.stringify(expected))}::jsonb,`,
      `  ${sql(`record_candidates(): ${name}`)}`,
      `);`,
    ].join('\n'),
  );
  // Each week case its own user, whose workouts are numbered from 100 times the case's place.
  const weekUser = (index: number) =>
    `00000000-0000-0000-0000-${String(0x5e2000 + index).padStart(12, '0')}`;
  const weekRows = cases.weekSchedule.map(({ workouts, moves, logs }, index) => {
    const user = weekUser(index);
    const id = (workout: number) => (index + 1) * 100 + workout;
    return [
      `insert into auth.users (id, email) values ('${user}', 'week${index}@example.com');`,
      ...workouts.map(
        (workout) =>
          `insert into public.workouts (id, user_id, name, weekdays, active, estimated_minutes) ` +
          `overriding system value values (${id(workout.id)}, '${user}', 'Workout ${workout.id}', ` +
          `'{${workout.weekdays.join(',')}}', ${workout.active ?? true}, 45);`,
      ),
      ...moves.map(
        (move) =>
          `insert into public.workout_moves (user_id, workout_id, from_on, to_on) values ` +
          `('${user}', ${id(move.workoutId)}, '${move.fromOn}', ${sql(move.toOn)});`,
      ),
      ...logs.map(
        (log) =>
          `insert into public.workout_logs (user_id, name, started_at, finished_at, started_on, ` +
          `source_workout_id) values ('${user}', 'Workout ${log.workoutId}', ` +
          `'${log.startedOn} 10:00', '${log.startedOn} 11:00', '${log.startedOn}', ${id(log.workoutId)});`,
      ),
    ].join('\n');
  });
  const weeks = cases.weekSchedule.map(({ name, today, expected }, index) =>
    [
      `select set_config('request.jwt.claims', '{"sub": "${weekUser(index)}", "role": "authenticated"}', true);`,
      `select is(`,
      `  (select coalesce(jsonb_agg(jsonb_build_object('day', w.day, 'workoutId', w.workout_id - ${(index + 1) * 100},`,
      `     'done', w.done, 'skipped', w.skipped and not w.done) order by w.day, w.workout_id), '[]')`,
      `   from public.day_workouts(date_trunc('week', '${today}'::date)::date,`,
      `     date_trunc('week', '${today}'::date)::date + 6, '${today}') w),`,
      `  ${sql(JSON.stringify(expected))}::jsonb,`,
      `  ${sql(`day_workouts(): ${name}`)}`,
      `);`,
    ].join('\n'),
  );

  return [
    `-- Generated from ${RULE_CASES_PATH} by \`pnpm rules:sql\`: edit the cases, not this file.`,
    `-- The database's side of the rules the app keeps a copy of (#546); Jest checks the app's.`,
    'begin;',
    'create extension if not exists pgtap with schema extensions;',
    '',
    `select plan(${tests});`,
    '',
    ...oneRepMax,
    '',
    ...weightStep,
    '',
    `insert into auth.users (id, email) values ('${USER}', 'rules@example.com');`,
    'create temporary table cases (n integer, log_id bigint, exercise_id text) on commit drop;',
    'grant select on cases to public;',
    '',
    ...logs,
    ...weekRows,
    '',
    '-- As the user, whose logs alone row level security shows.',
    "select set_config('role', 'authenticated', true),",
    `  set_config('request.jwt.claims', '{"sub": "${USER}", "role": "authenticated"}', true);`,
    '',
    ...records,
    '',
    "-- day_workouts() is closed to clients, so it runs without their role, as each case's user.",
    'reset role;',
    ...weeks,
    '',
    'select * from finish();',
    'rollback;',
    '',
  ].join('\n');
}
