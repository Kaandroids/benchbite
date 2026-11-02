/** How many days the free trial lasts, as the stores run it (ADR 0078). */
export const TRIAL_DAYS = 7;

/** What a user did with Bite in their trial. */
export type TrialUsage = { chats: number; photos: number; reviews: number };
