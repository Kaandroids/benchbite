import { useSyncExternalStore } from 'react';

import type { LibraryExercise } from '@/exercises/library';

import type { WorkoutDraft, WorkoutTarget } from './workouts';

export type DraftExercise = WorkoutDraft['exercises'][number] & {
  /** Tells apart the same exercise added twice, for lists and reordering. */
  key: string;
};

/** The name is what the user typed; empty until they type one. */
export type Draft = Omit<WorkoutDraft, 'name' | 'exercises'> & {
  name: string;
  exercises: DraftExercise[];
};

// The workout being edited. The editor and the exercise picker are separate screens that change
// the same draft; there is only ever one editor open.
let draft: Draft | null = null;
let nextKey = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDraft(): Draft | null {
  return useSyncExternalStore(subscribe, () => draft);
}

/** Starts editing a workout, or a new one. */
export function startDraft(workout: Omit<Draft, 'exercises'> & Pick<WorkoutDraft, 'exercises'>) {
  draft = {
    ...workout,
    exercises: workout.exercises.map((exercise) => ({ ...exercise, key: String(nextKey++) })),
  };
  emit();
}

export function updateDraft(change: (current: Draft) => Draft) {
  if (draft) {
    draft = change(draft);
    emit();
  }
}

export function clearDraft() {
  draft = null;
  emit();
}

/**
 * The target a new exercise starts with, from what it records: a rep range for reps, a distance
 * for distances, and a time for the rest.
 */
export function defaultTarget(metrics: LibraryExercise['metrics']): WorkoutTarget {
  if (metrics.includes('reps')) {
    return { reps: { min: 8, max: 12 } };
  }
  if (metrics.includes('distance')) {
    return { seconds: null, meters: 1000 };
  }
  return { seconds: 30, meters: null };
}

/** Adds exercises at the end of the draft, with their default sets, target and rest. */
export function addExercises(exercises: LibraryExercise[]) {
  updateDraft((current) => ({
    ...current,
    exercises: [
      ...current.exercises,
      ...exercises.map((exercise) => {
        const distance = exercise.metrics.includes('distance');
        return {
          key: String(nextKey++),
          exerciseId: exercise.id,
          sets: distance ? 1 : 3,
          target: defaultTarget(exercise.metrics),
          restSeconds: distance ? 0 : 90,
        };
      }),
    ],
  }));
}
