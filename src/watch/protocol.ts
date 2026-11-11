// What the phone and the watch say to each other about the workout in progress (ADR 0109). The
// phone keeps the workout and sends the watch its state; the watch sends commands, each saying what
// a set or the rest should be, never what to toggle, so that one that arrives twice or late does
// no harm.
import type { LibraryExercise } from '@/exercises/library';
import {
  addSet,
  markDone,
  setRestEnd,
  setValues,
  tickedSince,
  type EndedSession,
  type HowEnded,
  type Session,
} from '@/sessions/session';
import {
  describeSet,
  SET_LIMITS,
  setKindOf,
  setValueOf,
  weightStepOf,
  type SetField,
  type SetKind,
} from '@/sets/fields';
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
  /** Last time's set of the same number, described the same way; none when there was none. */
  lastText: string | null;
};

/** How the Crown turns a value: from `min` to `max`, by `step`. */
export type CrownRange = { min: number; max: number; step: number };

export type WatchExercise = {
  exerciseId: string;
  /** In the user's language, as the phone shows it; none when the library does not know it. */
  name: string | null;
  target: WorkoutTarget;
  /** What its sets record, as the phone shows them (setKindOf), in the order it shows them. */
  fields: SetField[];
  /**
   * The values the watch changes with the Crown, and how; none for sets measured by time, which
   * the phone's clock measures.
   */
  crown: Partial<Record<SetField, CrownRange>>;
  restSeconds: number;
  sets: WatchSet[];
};

export type WatchWorkout = {
  /** The workout's id: a command for another workout is dropped. */
  id: string;
  name: string | null;
  startedAt: number;
  current: number;
  /** The set to do next, as nextSetOf() finds it; none when every set is done. */
  next: { exercise: number; set: number } | null;
  rest: { endsAt: number; seconds: number } | null;
  exercises: WatchExercise[];
  /** The latest commands the phone applied, so that the watch stops showing them as waiting. */
  applied: string[];
  /**
   * The watch follows it, measuring it and signalling its rests while it can (ADR 0113, ADR 0114);
   * else it offers to join (ADR 0112).
   */
  follows: boolean;
};

/**
 * How a workout ended, by its id: saved as a log, at the time it ended, or let go. The watch that
 * followed it saves its own workout to the health store, or leaves it out (ADR 0113).
 */
export type WatchEnded = { id: string } & HowEnded;

/** The phone's state for the watch; none when no workout runs. */
export type WatchState = {
  v: typeof PROTOCOL_VERSION;
  /** Grows with each state, so that the watch drops one older than what it has. */
  seq: number;
  workout: WatchWorkout | null;
  /** How the latest workouts ended, latest first, so that a watch that missed one finds it. */
  ended: WatchEnded[];
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
    /** With the values the watch showed for the set, which are set first, when it was edited there. */
    | {
        type: 'setDone';
        exercise: number;
        set: number;
        done: boolean;
        values?: Partial<SetValues>;
      }
    /** Adds a set while the exercise has fewer than `sets`, the number the watch then showed. */
    | { type: 'addSet'; exercise: number; sets: number }
    /** The rest the watch showed, `of` its end, made to end at `endsAt`, or skipped with null. */
    | { type: 'setRest'; of: number; endsAt: number | null }
    /** The watch follows the workout from now on. */
    | { type: 'join' }
    /** Opens the exercise, picked from the watch's list, whose sets come next (ADR 0117). */
    | { type: 'open'; exercise: number }
  );

/** The workout's id; one started before ids were kept is named by its start. */
export function workoutIdOf(session: Pick<Session, 'id' | 'startedAt'>): string {
  return session.id ?? `started-${session.startedAt}`;
}

/**
 * How the Crown turns a lifted set's values: the weight by what its equipment goes up by, down to
 * none only when it is added to the body, and the reps by one; each up to what a set can hold.
 */
export function crownOf(
  kind: SetKind,
  equipment: LibraryExercise['equipment'] | undefined,
): Partial<Record<SetField, CrownRange>> {
  if (kind.timed) return {};
  const step = weightStepOf(equipment);
  return {
    weightKg: { min: kind.addedWeight ? 0 : step, max: SET_LIMITS.weightKg, step },
    reps: { min: 1, max: SET_LIMITS.reps, step: 1 },
  };
}

/**
 * The set to do next: the open exercise's first set not done, else the first one of the
 * exercises after it, then of those before it, as one can be left open while another is done.
 */
export function nextSetOf(session: Session): { exercise: number; set: number } | null {
  const count = session.exercises.length;
  for (let step = 0; step < count; step++) {
    const exercise = (session.current + step) % count;
    const set = session.exercises[exercise]!.sets.findIndex((s) => !s.done);
    if (set >= 0) {
      return { exercise, set };
    }
  }
  return null;
}

/** The library's exercise of an id, as far as the watch needs it; none where it is not loaded. */
export type ExerciseOf = (
  exerciseId: string,
) => Pick<LibraryExercise, 'name' | 'metrics' | 'equipment'> | undefined;

/**
 * The state for the watch: the workout named as the phone names it, its exercises named and each
 * set judged by the library's exercise as the phone judges it, with its text as the phone shows it.
 */
export function stateOf(
  session: Session | null,
  { exerciseOf, name }: { exerciseOf: ExerciseOf; name: string | null },
  seq: number,
  ended: EndedSession[],
): WatchState {
  return {
    v: PROTOCOL_VERSION,
    seq,
    ended: ended.map(({ id, startedAt, ...how }) => ({
      id: workoutIdOf({ id, startedAt }),
      ...how,
    })),
    workout: session && {
      id: workoutIdOf(session),
      name,
      startedAt: session.startedAt,
      current: session.current,
      next: nextSetOf(session),
      rest: session.rest,
      exercises: session.exercises.map((exercise) => {
        const known = exerciseOf(exercise.exerciseId);
        const kind = setKindOf(known?.metrics, exercise.target);
        return {
          exerciseId: exercise.exerciseId,
          name: known?.name ?? null,
          target: exercise.target,
          fields: kind.fields,
          crown: crownOf(kind, known?.equipment),
          restSeconds: exercise.restSeconds,
          sets: exercise.sets.map((set, index) => {
            const last = exercise.last[index];
            return {
              ...pickSetValues(set),
              done: set.done,
              missing: set.done ? [] : missingFields(set, kind),
              text: describeSet(set, kind),
              lastText: last ? describeSet(last, kind) : null,
            };
          }),
        };
      }),
      applied: session.watchCommands ?? [],
      follows: session.watchFollows ?? false,
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
    case 'setDone': {
      const { exercise, set, done } = message;
      if (!isIndex(exercise) || !isIndex(set) || typeof done !== 'boolean') return null;
      if (message.values === undefined) return { ...base, type, exercise, set, done };
      const values = valuesOf(message.values);
      return values ? { ...base, type, exercise, set, done, values } : null;
    }
    case 'addSet':
      return isIndex(message.exercise) && isIndex(message.sets) && message.sets > 0
        ? { ...base, type, exercise: message.exercise, sets: message.sets }
        : null;
    case 'setRest':
      return isTime(message.of) && (message.endsAt === null || isTime(message.endsAt))
        ? { ...base, type, of: message.of, endsAt: message.endsAt }
        : null;
    case 'join':
      return { ...base, type };
    case 'open':
      return isIndex(message.exercise) ? { ...base, type, exercise: message.exercise } : null;
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
      const set = item?.sets[command.set];
      // The values go with the tick: a tick older than the set's last tick or untick sets none.
      // Otherwise each is the latest change of its value, even for a set already ticked.
      if (!item || !set || tickedSince(set, at)) return session;
      const kind = setKindOf(metricsOf(item.exerciseId), item.target);
      const edited = command.values
        ? setValues(session, command.exercise, command.set, command.values, at)
        : session;
      return markDone(edited, command.exercise, command.set, command.done, kind, { at, now });
    }
    case 'addSet': {
      // Up to the sets the watch showed after adding one, so that one added meanwhile counts.
      const sets = session.exercises[command.exercise]?.sets.length;
      return sets !== undefined && sets < command.sets
        ? addSet(session, command.exercise)
        : session;
    }
    case 'join':
      return { ...session, watchFollows: true };
    case 'open':
      return command.exercise < session.exercises.length
        ? { ...session, current: command.exercise }
        : session;
    case 'setRest':
      // Only the rest the watch showed: one that has changed since is left as it is.
      return session.rest?.endsAt === command.of
        ? setRestEnd(session, command.endsAt, at, now)
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
