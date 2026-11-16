// The app's copies of the database's rules, checked against the cases the database's own pgTAP
// test checks too (supabase/tests/rules/cases.json, #546): a change to one side alone fails.
import { fromIsoDate } from '@/i18n/dates';
import { oneRepMax, recordValues } from '@/sessions/records';
import { weekSchedule } from '@/workouts/week-schedule';
import type { LibraryExercise } from '@/exercises/library';

import cases from '../../supabase/tests/rules/cases.json';
import { setKindOf, weightStepOf } from './fields';

describe('one_rep_max()', () => {
  it.each(cases.oneRepMax)('estimates $weightKg kg × $reps as $expected', (item) => {
    expect(oneRepMax(item.weightKg, item.reps)).toBe(item.expected);
  });
});

describe('record_candidates()', () => {
  it.each(cases.recordValues)('$name', (item) => {
    const metrics = item.metrics as LibraryExercise['metrics'];
    const kind = setKindOf(metrics, { seconds: null, meters: null });
    expect(recordValues(item.set, kind)).toEqual(item.expected);
  });
});

describe('weight_step()', () => {
  it.each(cases.weightStep)('steps $equipment by $expected', (item) => {
    const equipment = (item.equipment ?? undefined) as LibraryExercise['equipment'] | undefined;
    expect(weightStepOf(equipment)).toBe(item.expected);
  });
});

describe('day_workouts()', () => {
  it.each(cases.weekSchedule)('$name', (item) => {
    // The plan as the app reads it: each active workout on each of its weekdays.
    const sessions = item.workouts
      .filter((workout) => (workout as { active?: boolean }).active !== false)
      .flatMap((workout) =>
        workout.weekdays.map((weekday) => ({
          workoutId: workout.id,
          weekday,
          name: `Workout ${workout.id}`,
          type: null,
          exercises: [],
          estimatedMinutes: 45,
        })),
      );
    const finished = item.logs.map((log) => ({
      workoutId: log.workoutId,
      startedOn: log.startedOn,
    }));
    const schedule = weekSchedule(sessions, item.moves, finished, fromIsoDate(item.today));
    const days = schedule.days.flatMap((day) =>
      day.workouts.map((workout) => ({
        day: day.date,
        workoutId: workout.session.workoutId,
        done: workout.status === 'done',
        skipped: workout.status === 'skipped',
      })),
    );
    expect(days).toEqual(item.expected);
  });
});
