import { renderHook } from '@/test/render';

import { mainMuscles, minutesAndSeconds, useRestFormat, useTargetFormat } from './format';
import type { Workout, WorkoutExercise } from './workouts';

const exercise = (primaryMuscles: WorkoutExercise['primaryMuscles']): WorkoutExercise => ({
  exerciseId: 'x',
  slot: 'squat',
  sets: 3,
  target: { reps: { min: 8, max: 12 } },
  restSeconds: 90,
  primaryMuscles,
  imagePath: null,
});

describe('minutesAndSeconds', () => {
  it.each([
    [0, '0:00'],
    [45, '0:45'],
    [90, '1:30'],
    [600, '10:00'],
  ])('writes %i seconds as %s', (seconds, text) => {
    expect(minutesAndSeconds(seconds)).toBe(text);
  });
});

describe('useTargetFormat', () => {
  it.each([
    [{ reps: { min: 8, max: 12 } }, '3 × 8–12 reps'],
    [{ reps: { min: 10, max: 10 } }, '3 × 10 reps'],
    [{ seconds: 45 }, '3 × 45 s'],
    [{ seconds: 240 }, '3 × 4 min'],
    [{ seconds: 90 }, '3 × 1:30 min'],
  ])('writes %j as %s', async (target, text) => {
    const { result } = await renderHook(() => useTargetFormat());
    expect(result.current(3, target)).toBe(text);
  });
});

describe('useRestFormat', () => {
  it('writes the rest in minutes and seconds, or no rest', async () => {
    const { result } = await renderHook(() => useRestFormat());
    expect(result.current(90)).toBe('Rest 1:30');
    expect(result.current(0)).toBe('No rest');
  });
});

describe('mainMuscles', () => {
  it('lists the muscles most exercises work, ties in order, ignoring the finisher', () => {
    const workout: Workout = {
      id: 1,
      type: 'pull',
      weekdays: [],
      active: true,
      estimatedMinutes: 45,
      exercises: [
        exercise(['lats']),
        exercise(['middle back', 'lats']),
        exercise(['biceps']),
        exercise(['traps']),
      ],
      finisher: exercise(['quadriceps']),
    };
    expect(mainMuscles(workout)).toEqual(['lats', 'middle back', 'biceps']);
  });
});
