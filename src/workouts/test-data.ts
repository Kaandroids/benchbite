import { supabase } from '@/lib/supabase';

import type { Workout, WorkoutExercise } from './workouts';

/** An exercise of a workout, for tests. */
export function testExercise(
  exerciseId: string,
  more: Partial<WorkoutExercise> = {},
): WorkoutExercise {
  return {
    exerciseId,
    sets: 3,
    target: { reps: { min: 8, max: 12 } },
    restSeconds: 90,
    primaryMuscles: ['quadriceps'],
    imagePath: `${exerciseId}/0.webp`,
    ...more,
  };
}

/** A workout, for tests. */
export function testWorkout(id: number, more: Partial<Workout> = {}): Workout {
  return {
    id,
    name: null,
    type: 'full_body',
    weekdays: [1],
    active: true,
    estimatedMinutes: 45,
    exercises: [testExercise('squat')],
    ...more,
  };
}

/** A switch of the alternative in use that waits until the test settles it, in `act`. */
export type HeldSwitch = {
  alternativeId: number;
  succeed: () => void;
  fail: (error: unknown) => void;
};

/**
 * Holds every switch of the alternative in use, sent through a mocked `supabase.rpc`, until the
 * test settles it; the list fills as switches start.
 */
export function holdSwitches(): HeldSwitch[] {
  const held: HeldSwitch[] = [];
  jest.mocked(supabase.rpc).mockImplementation(
    ((_name: string, args: { alternative_id: number }) =>
      new Promise((resolve) => {
        held.push({
          alternativeId: args.alternative_id,
          succeed: () => resolve({ error: null }),
          fail: (error) => resolve({ error }),
        });
      })) as never,
  );
  return held;
}
