// What the app and coach-chat tell each other (ADR 0052), shared by both, so that they agree.
// This file imports nothing, so that the app can bundle it.

/** The longest message the user may send, in characters. */
export const MAX_MESSAGE_LENGTH = 4000;

/** The tools Bite looks things up with; the app says what Bite is doing by their names. */
export const COACH_TOOLS = [
  'get_workout_history',
  'get_meal_log',
  'get_week_summary',
  'get_records',
  'search_foods',
  'search_exercises',
] as const;

export type CoachToolName = (typeof COACH_TOOLS)[number];

/** A message to Bite. */
export type ChatRequest = {
  message: string;
  /** The thread to go on with; a new one without. */
  threadId?: number;
  /** The app's language, which Bite answers in. */
  language: string;
  /** The user's day, YYYY-MM-DD. */
  today: string;
};

/**
 * Why an answer stopped before its end: the model failed, the user may not go on, the request was
 * stopped, or the model cut it, as at the token limit.
 */
export type Interruption = 'failed' | 'refused' | 'stopped' | 'cut';

/** What the app is told as Bite answers, one server-sent event each, with Bite's faces. */
export type ChatEvent<Expression extends string = string> =
  /** A new thread, first, so that the app keeps it however the answer ends. */
  | { event: 'thread'; threadId: number }
  | { event: 'expression'; expression: Expression }
  | { event: 'tool_start'; name: string }
  | { event: 'tool_end'; name: string }
  | { event: 'text'; text: string }
  /** The turn is saved; `interrupted` says why when the answer stopped before its end. */
  | { event: 'done'; threadId: number; messageId: number; interrupted?: Interruption }
  /**
   * Bite saved no answer, and why: `plan_required`, `limit_reached`, `unavailable`… The question
   * is kept once the model was asked; `dropped` when the new thread begun for it is gone again.
   */
  | { event: 'error'; reason: string; dropped?: true };
