// Limits of the onboarding's training answers, shared with the app, which offers the same choices.
// This file imports nothing, so that the app can bundle it.

/** Every plan keeps at least one rest day, which the database enforces too. */
export const MAX_TRAINING_DAYS = 6;

/** The session lengths to choose from, in minutes. */
export const SESSION_MINUTES = [30, 45, 60, 75] as const;

export type SessionMinutes = (typeof SESSION_MINUTES)[number];

/**
 * The most exercises a workout may have, finisher included, without premium. The database has the
 * same limit in max_workout_exercises(), and plans stay within it.
 */
export const FREE_WORKOUT_EXERCISES = 10;
