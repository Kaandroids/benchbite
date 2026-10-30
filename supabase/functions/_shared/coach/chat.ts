// What the app and coach-chat tell each other (ADR 0052), shared by both, so that they agree.
// This file imports nothing, so that the app can bundle it.

/** The longest message the user may send, in characters. */
export const MAX_MESSAGE_LENGTH = 4000;

/**
 * The tools Bite looks things up and proposes changes with; the app says what Bite is doing by
 * their names.
 */
export const COACH_TOOLS = [
  'get_workout_history',
  'get_meal_log',
  'get_week_summary',
  'get_records',
  'search_foods',
  'search_exercises',
  'get_workouts',
  'propose_workout_change',
  'propose_targets_change',
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
  /** A name for this request, by which the app stops it (stop_coach_request(), ADR 0057). */
  requestId?: string;
};

/**
 * Why Bite gave no answer, or stopped short: the reasons of `ai_access()` and `start_ai_call()`,
 * and the function's own, `unavailable` for any failure, `blocked` by the model's safety rules,
 * and `not_saved` for an answer that could not be kept.
 */
export type ChatReason =
  | 'account_required'
  | 'plan_required'
  | 'limit_reached'
  | 'request_too_large'
  | 'unpriced_model'
  | 'call_in_progress'
  | 'unavailable'
  | 'blocked'
  | 'not_saved';

/**
 * Why an answer stopped before its end: the model failed, the user may not go on, the request was
 * stopped, or the model cut it, as at the token limit.
 */
export type Interruption = 'failed' | 'refused' | 'stopped' | 'cut';

/** A day's calories and macros, null where a value is not known. */
export type DayTargets<Value = number> = {
  calories: Value;
  proteinG: Value;
  carbsG: Value;
  fatG: Value;
};

/** A swapped exercise's target as Bite gives it and save_workout() takes it. */
export type ProposalTarget = {
  reps?: { min: number; max: number };
  seconds?: number;
  meters?: number;
};

/**
 * A change Bite proposed (ADR 0058), as its card shows it, in data the app words and formats
 * itself, as the card is kept with the message: exercises swapped in a workout, named in the
 * user's language, or the targets in use and the new ones. The user applies it, keeps things as
 * they are, or undoes it, by its `id` (decide_coach_proposal()).
 */
export type ProposalCard =
  | {
      kind: 'workout';
      id: number;
      /** The workout's name, or its type for one without a name, which the app names. */
      workout: { name: string | null; type: string | null };
      swaps: { from: string; to: string; sets: number; target: ProposalTarget; why?: string }[];
    }
  | {
      kind: 'targets';
      id: number;
      /**
       * The targets in use when it was proposed, as the user sees them; null before any, and
       * left out when they could not be read.
       */
      from?: DayTargets<number | null> | null;
      to: DayTargets;
    };

/** What the app is told as Bite answers, one server-sent event each, with Bite's faces. */
export type ChatEvent<Expression extends string = string> =
  /** A new thread, first, so that the app keeps it however the answer ends. */
  | { event: 'thread'; threadId: number }
  | { event: 'expression'; expression: Expression }
  | { event: 'tool_start'; name: string }
  | { event: 'tool_end'; name: string }
  | { event: 'text'; text: string }
  /** A change Bite proposed, shown as a card under its answer. */
  | { event: 'proposal'; proposal: ProposalCard }
  /**
   * The turn is saved; `interrupted` says why when the answer stopped before its end, and
   * `reason` what failed or was refused, as an error's does.
   */
  | {
      event: 'done';
      threadId: number;
      messageId: number;
      interrupted?: Interruption;
      reason?: ChatReason;
    }
  /**
   * Bite saved no answer, and why: `plan_required`, `limit_reached`, `unavailable`… The question
   * is kept once the model was asked; `dropped` when the new thread begun for it is gone again.
   */
  | { event: 'error'; reason: ChatReason; dropped?: true };
