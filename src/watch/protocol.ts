// What the phone and the watch say to each other about the workout in progress (ADR 0109). The
// phone keeps the workout and sends the watch its state; the watch sends commands, each saying what
// a set or the rest should be, never what to toggle, so that one that arrives twice or late does
// no harm.
import {
  addSet,
  lastActivity,
  setValues,
  toggleDone,
  type Session,
  type SessionSet,
} from '@/sessions/session';
import { SET_LIMITS } from '@/sets/fields';
import { MAX_SETS, type SetValues } from '@/sets/values';
import type { WorkoutTarget } from '@/workouts/workouts';

/** Raised when a message changes shape; each side drops a message of another version. */
export const PROTOCOL_VERSION = 1;

/** How many applied command ids the workout keeps and sends back: far more than wait at once. */
const KEPT_COMMANDS = 50;

export type WatchSet = SetValues & { done: boolean };

export type WatchExercise = {
  exerciseId: string;
  /** In the user's language, as the phone shows it. */
  name: string;
  target: WorkoutTarget;
  restSeconds: number;
  sets: WatchSet[];
  last: SetValues[];
};

export type WatchWorkout = {
  /** The workout's id: a command for another workout is dropped. */
  id: string;
  name: string | null;
  startedAt: number;
  current: number;
  rest: { endsAt: number; seconds: number } | null;
  exercises: WatchExercise[];
  /** The latest commands the phone applied, so that the watch stops showing them as waiting. */
  applied: string[];
};

/** The phone's state for the watch; none when no workout runs. */
export type WatchState = {
  v: typeof PROTOCOL_VERSION;
  /** Grows with each state, so that the watch drops one older than what it has. */
  seq: number;
  workout: WatchWorkout | null;
};

type CommandBase = {
  v: typeof PROTOCOL_VERSION;
  /** Unique, so that a command delivered twice applies once. */
  id: string;
  /** When the user did it on the watch, in milliseconds since the epoch. */
  at: number;
  workoutId: string;
};

export type WatchCommand = CommandBase &
  (
    | { type: 'setValues'; exercise: number; set: number; values: Partial<SetValues> }
    | { type: 'setDone'; exercise: number; set: number; done: boolean }
    | { type: 'addSet'; exercise: number }
    /** The rest the watch showed, `of` its end, made to end at `endsAt`, or skipped with null. */
    | { type: 'setRest'; of: number; endsAt: number | null }
  );

/** The workout's id; one started before ids were kept is named by its start. */
export function workoutIdOf(session: Session): string {
  return session.id ?? `started-${session.startedAt}`;
}

/** The state for the watch, its exercises named by `names` (by exercise id). */
export function stateOf(
  session: Session | null,
  names: (exerciseId: string) => string,
  seq: number,
): WatchState {
  return {
    v: PROTOCOL_VERSION,
    seq,
    workout: session && {
      id: workoutIdOf(session),
      name: session.name,
      startedAt: session.startedAt,
      current: session.current,
      rest: session.rest,
      exercises: session.exercises.map((exercise) => ({
        exerciseId: exercise.exerciseId,
        name: names(exercise.exerciseId),
        target: exercise.target,
        restSeconds: exercise.restSeconds,
        sets: exercise.sets.map(({ weightKg, reps, seconds, meters, done }) => ({
          weightKg,
          reps,
          seconds,
          meters,
          done,
        })),
        last: exercise.last,
      })),
      applied: session.watchCommands ?? [],
    },
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isIndex = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

const isTime = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/** A set's values as a watch sent them: only known fields, each none or within a set's limits. */
function valuesOf(value: unknown): Partial<SetValues> | null {
  if (!isRecord(value)) return null;
  const values: Partial<SetValues> = {};
  for (const [field, given] of Object.entries(value)) {
    if (!(field in SET_LIMITS)) return null;
    const limit = SET_LIMITS[field as keyof SetValues];
    if (given !== null && !(typeof given === 'number' && given >= 0 && given <= limit)) {
      return null;
    }
    values[field as keyof SetValues] = given;
  }
  return Object.keys(values).length > 0 ? values : null;
}

/** A command from the watch, or null for anything that is not one of this version. */
export function parseCommand(message: unknown): WatchCommand | null {
  if (!isRecord(message) || message.v !== PROTOCOL_VERSION) return null;
  const { id, at, workoutId, type } = message;
  if (typeof id !== 'string' || !id || !isTime(at) || typeof workoutId !== 'string') return null;
  const base: CommandBase = { v: PROTOCOL_VERSION, id, at, workoutId };
  switch (type) {
    case 'setValues': {
      const values = valuesOf(message.values);
      return isIndex(message.exercise) && isIndex(message.set) && values
        ? { ...base, type, exercise: message.exercise, set: message.set, values }
        : null;
    }
    case 'setDone':
      return isIndex(message.exercise) && isIndex(message.set) && typeof message.done === 'boolean'
        ? { ...base, type, exercise: message.exercise, set: message.set, done: message.done }
        : null;
    case 'addSet':
      return isIndex(message.exercise) ? { ...base, type, exercise: message.exercise } : null;
    case 'setRest':
      return isTime(message.of) && (message.endsAt === null || isTime(message.endsAt))
        ? { ...base, type, of: message.of, endsAt: message.endsAt }
        : null;
    default:
      return null;
  }
}

function setAt(session: Session, exercise: number, set: number): SessionSet | undefined {
  return session.exercises[exercise]?.sets[set];
}

/** The change a command makes, before it is recorded as applied. */
function change(session: Session, command: WatchCommand, at: number, now: number): Session {
  switch (command.type) {
    case 'setValues': {
      const set = setAt(session, command.exercise, command.set);
      // A change made on the phone after this one on the watch stays.
      if (!set || (set.valuesAt ?? 0) > at) return session;
      return setValues(session, command.exercise, command.set, command.values, at);
    }
    case 'setDone': {
      const set = setAt(session, command.exercise, command.set);
      if (!set || set.done === command.done || (set.doneChangedAt ?? 0) > at) return session;
      const next = toggleDone(session, command.exercise, command.set, at);
      // A tick older than the latest set leaves the rest that set started; a rest over is none.
      const rest = lastActivity(session) > at ? session.rest : next.rest;
      return { ...next, rest: rest && rest.endsAt > now ? rest : null };
    }
    case 'addSet': {
      const exercise = session.exercises[command.exercise];
      return exercise && exercise.sets.length < MAX_SETS
        ? addSet(session, command.exercise)
        : session;
    }
    case 'setRest': {
      // Only the rest the watch showed: one that has changed since is left as it is.
      const { rest } = session;
      if (!rest || rest.endsAt !== command.of) return session;
      return {
        ...session,
        rest:
          command.endsAt !== null && command.endsAt > now
            ? { ...rest, endsAt: command.endsAt }
            : null,
      };
    }
  }
}

/**
 * The workout with a command from the watch applied, once: a command for another workout, or one
 * already applied, changes nothing. Its time is at most `now`, so that a watch whose clock runs
 * ahead cannot outrank changes made on the phone after it.
 */
export function applyCommand(session: Session, command: WatchCommand, now = Date.now()): Session {
  const applied = session.watchCommands ?? [];
  if (command.workoutId !== workoutIdOf(session) || applied.includes(command.id)) {
    return session;
  }
  const next = change(session, command, Math.min(command.at, now), now);
  return { ...next, watchCommands: [...applied, command.id].slice(-KEPT_COMMANDS) };
}
