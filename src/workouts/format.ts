import { useTranslation } from 'react-i18next';

import type { Target } from '@shared/plan/types';

import type { Muscle, Workout } from './workouts';

/** A time in seconds as minutes and seconds, such as 1:30. */
export function minutesAndSeconds(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** The sets and target of an exercise, such as "3 × 8–12 reps" or "3 × 45 s". */
export function useTargetFormat() {
  const { t } = useTranslation();
  return (sets: number, target: Target) => {
    if ('seconds' in target) {
      const { seconds } = target;
      return seconds < 60
        ? t('workout.target.seconds', { sets, seconds })
        : seconds % 60 === 0
          ? t('workout.target.minutes', { sets, minutes: seconds / 60 })
          : t('workout.target.time', { sets, time: minutesAndSeconds(seconds) });
    }
    const { min, max } = target.reps;
    return min === max
      ? t('workout.target.reps', { sets, reps: min })
      : t('workout.target.repRange', { sets, min, max });
  };
}

/** The rest after each set, such as "Rest 1:30". */
export function useRestFormat() {
  const { t } = useTranslation();
  return (seconds: number) =>
    seconds === 0 ? t('workout.noRest') : t('workout.rest', { time: minutesAndSeconds(seconds) });
}

/**
 * The muscles a workout trains most, by how many of its main exercises work them, ties in the
 * order they come up.
 */
export function mainMuscles(workout: Workout, limit = 3): Muscle[] {
  const counts = new Map<Muscle, number>();
  for (const exercise of workout.exercises) {
    for (const muscle of exercise.primaryMuscles) {
      counts.set(muscle, (counts.get(muscle) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([muscle]) => muscle);
}
