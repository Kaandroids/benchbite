import { useTranslation } from 'react-i18next';

import { useNumberFormat } from '@/i18n/units';
import { minutesAndSeconds } from '@/lib/time';

import type { Muscle, Workout, WorkoutTarget } from './workouts';

/**
 * How long a workout took: minutes and seconds under an hour, such as 52:00, and hours and
 * minutes from an hour, such as 1:05 h.
 */
export function workoutLength(seconds: number): string {
  if (seconds < 3600) {
    return minutesAndSeconds(seconds);
  }
  const minutes = Math.round(seconds / 60);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')} h`;
}

/** A workout's name, or the name of its type for workouts from the onboarding. */
export function useWorkoutName() {
  const { t } = useTranslation();
  return ({ name, type }: Pick<Workout, 'name' | 'type'>) =>
    name ?? (type ? t(`workout.sessionTypes.${type}`) : '');
}

/** A workout's size, such as "6 exercises · about 45 min". */
export function useSessionSize() {
  const { t } = useTranslation();
  return ({ exercises, estimatedMinutes }: Pick<Workout, 'exercises' | 'estimatedMinutes'>) =>
    t('workout.session', { count: exercises.length, minutes: estimatedMinutes });
}

/**
 * The sets and target of an exercise, such as "3 × 8–12 reps", "3 × 45 s" or "1 × 400 m · 2 min".
 */
export function useTargetFormat() {
  const { t } = useTranslation();
  const { format } = useNumberFormat();
  const time = (seconds: number) =>
    seconds < 60
      ? t('workout.target.seconds', { seconds })
      : seconds % 60 === 0
        ? t('workout.target.minutes', { minutes: seconds / 60 })
        : t('workout.target.time', { time: minutesAndSeconds(seconds) });
  const distance = (meters: number) =>
    meters >= 1000
      ? t('workout.target.kilometers', { kilometers: format(meters / 1000) })
      : t('workout.target.meters', { meters });
  return (sets: number, target: WorkoutTarget) => {
    if ('reps' in target) {
      const { min, max } = target.reps;
      return min === max
        ? t('workout.target.reps', { sets, count: min })
        : t('workout.target.repRange', { sets, min, max });
    }
    const parts = [
      target.meters !== null ? distance(target.meters) : null,
      target.seconds !== null ? time(target.seconds) : null,
    ].filter((part) => part !== null);
    return t('workout.target.sets', { sets, target: parts.join(' · ') });
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
