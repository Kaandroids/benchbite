// What the app and coach-chat tell each other (ADR 0052), shared by both, so that they agree.
// This file imports only types, so that the app can bundle it.
import type { Database } from '../database.types.ts';
import type { EstimateItem, EstimateMeal } from '../meal/estimate.ts';

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
  'propose_food_log_change',
  'log_meal_card',
  'save_note',
  'update_note',
  'archive_note',
] as const;

export type CoachToolName = (typeof COACH_TOOLS)[number];

/**
 * A photo sent to Bite, as base64 JPEG data in the request itself, re-encoded on the device so
 * that it has no Exif data, within the limits of `photos.ts` (ADR 0062).
 */
export type ChatPhoto = { mimeType: 'image/jpeg'; data: string };

/** A photo of a user's message as the message keeps it: its path in `coach-media`, and its size. */
export type ChatPhotoPart = {
  type: 'image';
  path: string;
  mimeType: 'image/jpeg';
  width?: number;
  height?: number;
};

/** A message to Bite: text, photos, or both. */
export type ChatRequest = {
  message?: string;
  /** Up to `MAX_PHOTOS` photos, which only this turn sends to the model. */
  photos?: ChatPhoto[];
  /** The device's local time, HH:MM, so that Bite knows the time of day. */
  localTime?: string;
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
 * Why a message's photos are refused before Bite is asked: too large together, or one of them is
 * not a JPEG, or has Exif data or any other metadata segment (ADR 0065). The app tells each apart.
 */
export const PHOTO_REFUSALS = ['photos_too_large', 'photo_not_jpeg', 'photo_has_exif'] as const;

/** Why one photo is refused, which the refusal names by its index. */
export type PhotoRefusal = Exclude<(typeof PHOTO_REFUSALS)[number], 'photos_too_large'>;

/**
 * Why a message was refused before Bite was asked, answered as JSON with an HTTP status rather
 * than as events: `{ error, photo? }`, `photo` being the index of the photo refused.
 */
export type ChatRefusal =
  'invalid_request' | 'thread_not_found' | (typeof PHOTO_REFUSALS)[number] | 'unavailable';

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

/** An entry of the food log as a food log proposal's card shows it. */
export type FoodLogEntry = {
  /** YYYY-MM-DD. */
  day: string;
  meal: EstimateMeal;
  grams: number;
  /** What the entry adds at these grams, at the values it was logged with. */
  kcal: number;
};

/** An entry a food log proposal changes, named in the user's language; removed without `to`. */
export type FoodLogChange = {
  food: string;
  from: FoodLogEntry;
  to?: FoodLogEntry;
};

/**
 * A change Bite proposed (ADR 0058), as its card shows it, in data the app words and formats
 * itself, as the card is kept with the message: exercises swapped in a workout, named in the
 * user's language, the targets in use and the new ones, or entries of the food log moved,
 * resized or removed (ADR 0068). The user applies it, keeps things as they are, or undoes it, by
 * its `id` (decide_coach_proposal()).
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
    }
  | { kind: 'food_log'; id: number; changes: FoodLogChange[] };

/**
 * The kinds of proposal the chat shows a card for. coach-chat offers Bite a tool only for these,
 * and the app leaves out any other it gets.
 */
export const SHOWN_PROPOSAL_KINDS = [
  'workout',
  'targets',
  'food_log',
] as const satisfies readonly ProposalCard['kind'][];

/**
 * A meal Bite estimated (ADR 0062), as its card shows it: the items as `estimate-meal` gives them,
 * matched to the food library alike, on a day and meal. The user adds it, with the grams they may
 * change, and undoes it, by its `id` (log_coach_meal_card(), undo_coach_meal_card()); where it
 * stands is read from `coach_meal_cards`, as the card is kept with the message.
 */
export type MealCard = {
  id: number;
  /** The day it is logged on, YYYY-MM-DD. */
  day: string;
  meal: EstimateMeal;
  /** In the order log_coach_meal_card() takes changed grams in. */
  items: EstimateItem[];
  /** Bite's short line about the meal, in the user's language. */
  note?: string;
};

/** What a note in Bite's notebook is about (#296, ADR 0071), as `coach_notes` has it. */
export type NoteCategory = Database['public']['Enums']['coach_note_category'];

/**
 * A note Bite saved, changed or archived in its notebook (ADR 0071), as the chat shows it under
 * the answer: `asked` when the user has saving from chats off, so that the note waits for their
 * yes. The notebook reads where it stands from `coach_notes`, by its `id`.
 */
export type NoteCard = {
  id: number;
  action: 'saved' | 'asked' | 'updated' | 'archived';
  category: NoteCategory;
  /** In the user's language, as Bite wrote it. */
  text: string;
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
  /** A meal Bite estimated, shown as a card under its answer for the user to add. */
  | { event: 'meal_card'; mealCard: MealCard }
  /** A note Bite saved, asked to save, changed or archived, shown as a line under its answer. */
  | { event: 'note'; note: NoteCard }
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
