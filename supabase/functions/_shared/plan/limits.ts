// Limits of the onboarding's training answers, shared with the app, which offers the same choices.
// This file imports nothing, so that the app can bundle it.

/** Every plan keeps at least one rest day, which the database enforces too. */
export const MAX_TRAINING_DAYS = 6;

/** The session lengths to choose from, in minutes. */
export const SESSION_MINUTES = [30, 45, 60, 75] as const;

export type SessionMinutes = (typeof SESSION_MINUTES)[number];
