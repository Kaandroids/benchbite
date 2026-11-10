// What the phone and the watch say to each other about the workout in progress (ADR 0109). The
// phone keeps the workout and sends the watch its state; the watch sends commands, each saying what
// a set or the rest should be, never what to toggle, so that one that arrives twice or late does
// no harm.
import type { LibraryExercise } from '@/exercises/library';
import { addSet, markDone, restUntil, setValues, type Session } from '@/sessions/session';
import { describeSet, setKindOf, setValueOf, type SetField } from '@/sets/fields';
import { EMPTY_SET, missingFields, pickSetValues, type SetValues } from '@/sets/values';
import type { WorkoutTarget } from '@/workouts/workouts';

/** Raised when a message changes shape; each side drops a message of another version. */
export const PROTOCOL_VERSION = 1;

/** How many applied command ids the workout keeps and sends back: far more than wait at once. */
const KEPT_COMMANDS = 50;
/** The longest command id taken: a UUID is 36 characters. */
const MAX_ID_LENGTH = 64;

export type WatchSet = SetValues & {
  done: boolean;
  /** What it still needs before it can be ticked, as markDone() asks; none when it can be. */
  missing: SetField[];
  /** As the phone describes it: "80 kg × 8", "0:50" or "2000 m · 8:12". */
  text: string;
};

export type WatchExercise = {
  exerciseId: string;
  /** In the user's language, as the phone shows it. */
  name: string;
  target: WorkoutTarget;
  /** What its sets record, as the phone shows them (setKindOf). */
  fields: SetField[];
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
    /** Adds a set while the exercise has fewer than `sets`, the number the watch then showed. */
    | { type: 'addSet'; exercise: number; sets: number }
    /** The rest the watch showed, `of` its end, made to end at `endsAt`, or skipped with null. */
    | { type: 'setRest'; of: number; endsAt: number | null }
  );

/** The workout's id; one started before ids were kept is named by its start. */
export function workoutIdOf(session: Session): string {
  return session.id ?? `started-${session.startedAt}`;
}

/**
 * The state for the watch: its exercises named by `name`, and each set judged by `metricsOf` as
 * the phone judges it, with its text as the phone shows it.
 */
export function stateOf(
  session: Session | null,
  { name, metricsOf }: { name: (exerciseId: string) => string; metricsOf: MetricsOf },
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
      exercises: session.exercises.map((exercise) => {
        const kind = setKindOf(metricsOf(exercise.exerciseId), exercise.target);
        return {
          exerciseId: exercise.exerciseId,
          name: name(exercise.exerciseId),
          target: exercise.target,
          fields: kind.fields,
          restSeconds: exercise.restSeconds,
          sets: exercise.sets.map((set) => ({
            ...pickSetValues(set),
            done: set.done,
            missing: set.done ? [] : missingFields(set, kind),
            text: describeSet(set, kind),
          })),
          last: exercise.last,
        };
      }),
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

/**
 * A set's values as a watch sent them, kept as the phone keeps what is typed: only a set's own
 * fields, each none or a number made a value a set can hold.
 */
function valuesOf(value: unknown): Partial<SetValues> | null {
  if (!isRecord(value)) return null;
  const values: Partial<SetValues> = {};
  for (const [field, given] of Object.entries(value)) {
    if (!Object.hasOwn(EMPTY_SET, field)) return null;
    if (given !== null && typeof given !== 'number') return null;
    values[field as SetField] = given === null ? null : setValueOf(field as SetField, given);
  }
  return Object.keys(values).length > 0 ? values : null;
}

/** A command from the watch, or null for anything that is not one of this version. */
export function parseCommand(message: unknown): WatchCommand | null {
  if (!isRecord(message) || message.v !== PROTOCOL_VERSION) return null;
  const { id, at, workoutId, type } = message;
  if (typeof id !== 'string' || !id || id.length > MAX_ID_LENGTH) return null;
  if (!isTime(at) || typeof workoutId !== 'string') return null;
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
      return isIndex(message.exercise) && isIndex(message.sets) && message.sets > 0
        ? { ...base, type, exercise: message.exercise, sets: message.sets }
        : null;
    case 'setRest':
      return isTime(message.of) && (message.endsAt === null || isTime(message.endsAt))
        ? { ...base, type, of: message.of, endsAt: message.endsAt }
        : null;
    default:
      return null;
  }
}

/** An exercise's metrics, which say what its sets need; none where the library is not loaded. */
export type MetricsOf = (exerciseId: string) => LibraryExercise['metrics'] | undefined;

/** The change a command makes, before it is recorded as applied. */
function change(
  session: Session,
  command: WatchCommand,
  at: number,
  now: number,
  metricsOf: MetricsOf,
): Session {
  switch (command.type) {
    case 'setValues':
      // A value changed on the phone after this change on the watch stays; the others change.
      return setValues(session, command.exercise, command.set, command.values, at);
    case 'setDone': {
      const item = session.exercises[command.exercise];
      if (!item) return session;
      const kind = setKindOf(metricsOf(item.exerciseId), item.target);
      return markDone(session, command.exercise, command.set, command.done, kind, { at, now });
    }
    case 'addSet': {
      // Up to the sets the watch showed after adding one, so that one added meanwhile counts.
      const sets = session.exercises[command.exercise]?.sets.length;
      return sets !== undefined && sets < command.sets
        ? addSet(session, command.exercise)
        : session;
    }
    case 'setRest':
      // Only the rest the watch showed: one that has changed since is left as it is.
      return session.rest?.endsAt === command.of
        ? { ...session, rest: restUntil(session.rest, command.endsAt, now) }
        : session;
  }
}

/**
 * The workout with a command from the watch applied, once: a command for another workout, or one
 * already applied, changes nothing. Its time is at most `now`, so that a watch whose clock runs
 * ahead cannot outrank changes made on the phone after it.
 */
export function applyCommand(
  session: Session,
  command: WatchCommand,
  { now = Date.now(), metricsOf }: { now?: number; metricsOf: MetricsOf },
): Session {
  const applied = session.watchCommands ?? [];
  if (command.workoutId !== workoutIdOf(session) || applied.includes(command.id)) {
    return session;
  }
  const next = change(session, command, Math.min(command.at, now), now, metricsOf);
  return { ...next, watchCommands: [...applied, command.id].slice(-KEPT_COMMANDS) };
}
