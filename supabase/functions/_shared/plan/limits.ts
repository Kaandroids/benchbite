// Limits of the onboarding's training answers, shared with the app, which offers the same choices.
// This file imports nothing, so that the app can bundle it.

/** Every plan keeps at least one rest day, which the database enforces too. */
export const MAX_TRAINING_DAYS = 6;

/** The session lengths to choose from, in minutes. */
export const SESSION_MINUTES = [30, 45, 60, 75] as const;

export type SessionMinutes = (typeof SESSION_MINUTES)[number];

/**
 * The most exercises a workout may have without premium. The database has the
 * same limit in workout_limits(), and plans stay within it.
 */
export const FREE_WORKOUT_EXERCISES = 20;

/**
 * The most exercises a workout of the plan may have, fewer than the free limit, as
 * complete_onboarding() refuses more (BB005) when it saves the plan.
 */
export const PLAN_WORKOUT_EXERCISES = 12;

/**
 * The most workouts a user may have without premium, as in workout_limits(). A plan has at most
 * this many, so that every user can start with the whole plan.
 */
export const FREE_WORKOUTS = 3;
