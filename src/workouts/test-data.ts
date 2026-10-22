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
    finisher: null,
    ...more,
  };
}
