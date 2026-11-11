// The workout in progress (ADR 0020). It lives on the device until it is finished, so that a lost
// connection or a closed app loses nothing; only one workout runs at a time.
import { randomUUID } from 'expo-crypto';
import { useSyncExternalStore } from 'react';

import { toIsoDate } from '@/i18n/dates';
import { readVersioned, writeVersioned } from '@/lib/device-storage';
import { SET_LIMITS, type SetField, type SetKind } from '@/sets/fields';
import { MAX_SETS, missingFields, pickSetValues, type SetValues } from '@/sets/values';
import type { Workout, WorkoutTarget } from '@/workouts/workouts';

import type { Bests } from './records';

export type SessionSet = SetValues & {
  done: boolean;
  /** When it was done, as the end of a workout left open; missing in older workouts. */
  doneAt?: number;
  /** Whether the weight was filled in from an earlier set of the workout, not typed or from last time. */
  carried?: boolean;
  /**
   * When each of its values was last changed, and when it was last ticked or unticked, on the phone
   * or the watch: an older change that arrives late does not undo a newer one (ADR 0109).
   */
  valuesAt?: Partial<Record<keyof SetValues, number>>;
  doneChangedAt?: number;
};

/** The longest a workout can be, as log_workout() accepts it. */
export const MAX_WORKOUT_MS = 12 * 3600 * 1000;

export type SessionExercise = {
  exerciseId: string;
  target: WorkoutTarget;
  restSeconds: number;
  sets: SessionSet[];
  /** The sets of the exercise's latest log, shown as "last time". */
  last: SetValues[];
  /**
   * The exercise's records before the workout, which sets are compared with; missing in a workout
   * started before they were kept, or without a connection.
   */
  bests?: Bests;
};

/** A clock that counts up for a timed set, until it is stopped. */
export type SetClock = {
  exercise: number;
  set: number;
  startedAt: number;
};

export type Session = {
  /**
   * Sent with the log, so that the workout is saved once however often it is sent (a lost
   * response, a retry). Missing in workouts started before it was kept.
   */
  id?: string;
  userId: string;
  workoutId: number;
  /** The workout's name and type when it started, for showing it while it runs. */
  name: string | null;
  type: Workout['type'];
  startedAt: number;
  exercises: SessionExercise[];
  /** The exercise that is open. */
  current: number;
  /**
   * The rest after a set, until the time it ends; `byWatch` when the watch started or last changed
   * it, and so signals its end (ADR 0112).
   */
  rest: { endsAt: number; seconds: number; byWatch?: true } | null;
  clock: SetClock | null;
  /** What the workout had when it started; sets added on the way do not count. */
  planned: { exercises: number; sets: number };
  /**
   * The planned day the workout counts for instead of today, saved with the log (ADR 0028), as
   * YYYY-MM-DD: from that day to the day it started.
   */
  move?: { from: string; to: string };
  /** The ids of the latest commands from the watch it applied, so that each applies once (ADR 0109). */
  watchCommands?: string[];
  /** When the rest was last started, changed or ended by hand, which a late tick does not undo. */
  restChangedAt?: number;
  /**
   * The watch follows the workout, started there too or joined from it: it alone signals the end
   * of a rest (ADR 0112).
   */
  watchFollows?: boolean;
};

/** Sets of an exercise's latest log, in order. */
export type LastSets = Record<string, SetValues[]>;

/** Each exercise's records before the workout. */
export type ExerciseBests = Record<string, Bests>;

const KEY = 'session.current';
/** Raised when the session changes shape, so that an older one is dropped instead of misread. */
const VERSION = 2;

let loaded = false;
let session: Session | null = null;
const listeners = new Set<() => void>();

function load(): Session | null {
  return readVersioned<Session>(KEY, VERSION, 'session');
}

function store(value: Session | null) {
  writeVersioned(KEY, VERSION, 'session', value);
}

function current(): Session | null {
  if (!loaded) {
    session = load();
    loaded = true;
  }
  return session;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function set(value: Session | null) {
  session = value;
  loaded = true;
  store(value);
  for (const listener of listeners) {
    listener();
  }
}

/** The signed-in user's workout in progress, if there is one. */
export function useActiveSession(userId: string | undefined): Session | null {
  const value = useSyncExternalStore(subscribe, current);
  return value && value.userId === userId ? value : null;
}

/** Changes the workout in progress, if there is one. */
export function updateSession(change: (current: Session) => Session) {
  const value = current();
  if (value) {
    set(change(value));
  }
}

/**
 * How a workout ended: saved as a log, at the time it ended, or let go. A watch that followed it
 * saves its own workout to the health store, or leaves it out, by it (ADR 0113).
 */
export type HowEnded = { saved: true; endedAt: number } | { saved: false };

/** A workout that ended, and how. */
export type EndedSession = Pick<Session, 'id' | 'startedAt'> & HowEnded;

const ENDED_KEY = 'session.ended';
const ENDED_VERSION = 1;
/** How many ended workouts are kept, latest first: a watch that missed one still finds it. */
const ENDED_KEPT = 5;
let ended: EndedSession[] | undefined;

function endedSessions(): EndedSession[] {
  ended ??= readVersioned<EndedSession[]>(ENDED_KEY, ENDED_VERSION, 'ended') ?? [];
  return ended;
}

/** How the latest workouts ended, latest first. */
export function useEndedSessions(): EndedSession[] {
  return useSyncExternalStore(subscribe, endedSessions);
}

/** Ends the workout in progress: after it was saved, at the time it ended, or without saving it. */
export function endSession(how: HowEnded) {
  const value = current();
  if (value) {
    ended = [{ id: value.id, startedAt: value.startedAt, ...how }, ...endedSessions()].slice(
      0,
      ENDED_KEPT,
    );
    writeVersioned(ENDED_KEY, ENDED_VERSION, 'ended', ended);
  }
  set(null);
}

/** Forgets how the latest workouts ended, as when another user signs in on the device. */
export function forgetEndedSessions() {
  ended = [];
  writeVersioned(ENDED_KEY, ENDED_VERSION, 'ended', null);
}

/** For tests: forgets the session in memory, so that the next read loads it again. */
export function resetSessionStore() {
  loaded = false;
  session = null;
  ended = undefined;
}

/**
 * The values a set starts with: last time's, the set before it if there were fewer, or else the
 * target. They count only once the set is done. The time is left out: the clock measures it.
 */
function startingValues(target: WorkoutTarget, last: SetValues[], index: number): SetValues {
  const previous = last[index] ?? last[last.length - 1];
  if (previous) {
    return { ...previous, seconds: null };
  }
  if ('reps' in target) {
    return { weightKg: null, reps: target.reps.max, seconds: null, meters: null };
  }
  return { weightKg: null, reps: null, seconds: null, meters: target.meters };
}

/** Starts a workout, its sets filled in from last time, counting for a planned day when it moves. */
export function startSession(
  userId: string,
  workout: Workout,
  last: LastSets,
  {
    bests = {},
    now = Date.now(),
    move,
  }: { bests?: ExerciseBests; now?: number; move?: Session['move'] } = {},
): Session {
  const { exercises } = workout;
  const value: Session = {
    id: randomUUID(),
    userId,
    workoutId: workout.id,
    name: workout.name,
    type: workout.type,
    startedAt: now,
    exercises: exercises.map(({ exerciseId, target, restSeconds, sets }) => ({
      exerciseId,
      target,
      restSeconds,
      last: last[exerciseId] ?? [],
      bests: bests[exerciseId],
      sets: Array.from({ length: sets }, (_set, index) => ({
        ...startingValues(target, last[exerciseId] ?? [], index),
        done: false,
      })),
    })),
    current: 0,
    rest: null,
    clock: null,
    planned: {
      exercises: exercises.length,
      sets: exercises.reduce((total, exercise) => total + exercise.sets, 0),
    },
    ...(move ? { move } : {}),
  };
  set(value);
  return value;
}

function changeSet(
  value: Session,
  exercise: number,
  index: number,
  change: (set: SessionSet) => SessionSet,
): Session {
  return {
    ...value,
    exercises: value.exercises.map((item, i) =>
      i === exercise
        ? { ...item, sets: item.sets.map((s, j) => (j === index ? change(s) : s)) }
        : item,
    ),
  };
}

/**
 * Sets values of a set, for example what the user typed. A weight also fills the later sets of the
 * exercise that are not done and have none yet, since most sets use the same weight. The weight is
 * saved as it is typed, so the sets it filled follow every change, also when it is cleared: typing
 * 50 fills them with 50, not with the 5 typed first. A weight typed or from last time stays.
 */
export function setValues(
  value: Session,
  exercise: number,
  index: number,
  given: Partial<SetValues>,
  at?: number,
): Session {
  const set = value.exercises[exercise]?.sets[index];
  // A value changed after `at` stays (ADR 0109). A change made here is the latest, whatever the
  // clock says.
  const now = at ?? Math.max(Date.now(), ...Object.values(set?.valuesAt ?? {}));
  const values = Object.fromEntries(
    Object.entries(given).filter(([field]) => (set?.valuesAt?.[field as SetField] ?? 0) <= now),
  ) as Partial<SetValues>;
  if (Object.keys(values).length === 0) {
    return value;
  }
  const typedWeight = 'weightKg' in values;
  const weightKg = values.weightKg ?? null;
  const follow = (s: SessionSet): SessionSet => {
    if (s.done || (s.weightKg !== null && !s.carried)) {
      return s;
    }
    return weightKg === null
      ? { ...s, weightKg: null, carried: undefined }
      : { ...s, weightKg, carried: true };
  };
  return {
    ...value,
    exercises: value.exercises.map((item, i) =>
      i === exercise
        ? {
            ...item,
            sets: item.sets.map((s, j) =>
              j === index
                ? {
                    ...s,
                    ...values,
                    ...(typedWeight ? { carried: undefined } : {}),
                    valuesAt: {
                      ...s.valuesAt,
                      ...Object.fromEntries(Object.keys(values).map((field) => [field, now])),
                    },
                  }
                : j > index && typedWeight
                  ? follow(s)
                  : s,
            ),
          }
        : item,
    ),
  };
}

/** Whether every set of the exercise is done. */
export function isExerciseDone(exercise: SessionExercise): boolean {
  return exercise.sets.length > 0 && exercise.sets.every((s) => s.done);
}

/**
 * Marks a set done, or not done again, without the checks of markDone(), which the screens and the
 * watch use: for markDone(), stopClock() and tests. Done starts the exercise's rest, and when it
 * was the last set, opens the next exercise that is not done.
 */
export function toggleDoneUnchecked(
  value: Session,
  exercise: number,
  index: number,
  now = Date.now(),
): Session {
  const wasDone = value.exercises[exercise]?.sets[index]?.done ?? false;
  let next = changeSet(value, exercise, index, (s) => ({
    ...s,
    done: !wasDone,
    doneAt: wasDone ? undefined : now,
    doneChangedAt: now,
  }));
  // A set ticked or unticked ends the rest that was running: after a set there is only its own
  // rest, if its exercise has one, and a set unticked was most likely ticked by mistake.
  if (wasDone) {
    return { ...next, rest: null, restChangedAt: now };
  }
  const item = next.exercises[exercise];
  // The watch reckons the rest its tick starts the same way (targets/watch/SetView.swift).
  next = {
    ...next,
    restChangedAt: now,
    rest:
      item && item.restSeconds > 0
        ? { endsAt: now + item.restSeconds * 1000, seconds: item.restSeconds }
        : null,
  };
  if (item && isExerciseDone(item)) {
    const following = next.exercises.findIndex((e, i) => i > exercise && !isExerciseDone(e));
    if (following >= 0) {
      next = { ...next, current: following };
    }
  }
  return next;
}

/** Adds a set to an exercise, with the values of its last set but its time. */
export function addSet(value: Session, exercise: number): Session {
  return {
    ...value,
    exercises: value.exercises.map((item, i) => {
      if (i !== exercise || item.sets.length >= MAX_SETS) {
        return item;
      }
      const last = item.sets[item.sets.length - 1];
      const values = last
        ? { weightKg: last.weightKg, reps: last.reps, seconds: null, meters: last.meters }
        : startingValues(item.target, [], 0);
      return { ...item, sets: [...item.sets, { ...values, done: false }] };
    }),
  };
}

/** Starts the clock of a timed set; it counts up, so a set can run past its target time. */
export function startClock(
  value: Session,
  exercise: number,
  index: number,
  now = Date.now(),
): Session {
  return {
    ...value,
    clock: { exercise, set: index, startedAt: now },
    rest: null,
    restChangedAt: now,
  };
}

/** The seconds a clock has run; never below zero, as `now` may lag just behind its start. */
export function clockSeconds(clock: SetClock, now = Date.now()): number {
  return Math.max(0, Math.floor((now - clock.startedAt) / 1000));
}

/** Stops the clock and marks its set done with the time it ran. */
export function stopClock(value: Session, now = Date.now()): Session {
  const { clock } = value;
  if (!clock) {
    return value;
  }
  // Rounded down, as the clock shows it, and at most what a set can hold.
  const seconds = Math.min(
    SET_LIMITS.seconds,
    Math.max(1, Math.floor((now - clock.startedAt) / 1000)),
  );
  const next = setValues({ ...value, clock: null }, clock.exercise, clock.set, { seconds }, now);
  return toggleDoneUnchecked(next, clock.exercise, clock.set, now);
}

/**
 * When the workout was last worked on: the latest done set, at most as long after the start as a
 * workout can be. A workout without done sets has its start.
 */
export function lastActivity(value: Session): number {
  const latest = Math.max(
    value.startedAt,
    ...value.exercises.flatMap((exercise) =>
      exercise.sets.flatMap((set) => (set.done && set.doneAt !== undefined ? [set.doneAt] : [])),
    ),
  );
  return Math.min(latest, value.startedAt + MAX_WORKOUT_MS);
}

/** Whether a workout has been open longer than a workout can be, so it was left open. */
export function isLeftOpen(value: Session, now = Date.now()): boolean {
  return now - value.startedAt > MAX_WORKOUT_MS;
}

/** A rest made to end at another time, or none: a rest that is over is no rest. */
export function restUntil(
  rest: Session['rest'],
  endsAt: number | null,
  now = Date.now(),
): Session['rest'] {
  return rest && endsAt !== null && endsAt > now ? { ...rest, endsAt } : null;
}

/** Whether the set was ticked or unticked after `at`, which a change made then cannot undo. */
export function tickedSince(set: SessionSet, at: number): boolean {
  return (set.doneChangedAt ?? 0) > at;
}

/**
 * Marks a set done or not done at `at`, as far as it may be, on the phone or from the watch (ADR
 * 0109). A set is not done without what it needs. A set whose clock runs is done with the clock's
 * time, or, done before the clock started, with its own, the clock stopping. A change older than
 * the set's last tick or untick changes nothing, and one older than the latest set keeps the open
 * exercise and the rest that set started. A rest that is over by `now` is none.
 */
export function markDone(
  value: Session,
  exercise: number,
  index: number,
  done: boolean,
  kind: SetKind,
  options: { at?: number; now?: number; byWatch?: boolean } = {},
): Session {
  const set = value.exercises[exercise]?.sets[index];
  if (!set) {
    return value;
  }
  // A tick made here is the latest, whatever the clock says.
  const at =
    options.at ??
    Math.max(Date.now(), set.doneChangedAt ?? 0, lastActivity(value), value.restChangedAt ?? 0);
  const now = options.now ?? at;
  if (set.done === done || tickedSince(set, at)) {
    return value;
  }
  const { clock } = value;
  const clocked = done && clock?.exercise === exercise && clock.set === index;
  let next: Session;
  if (clocked && at >= clock.startedAt) {
    next = stopClock(value, at);
  } else if (done && missingFields(set, kind).length > 0) {
    return value;
  } else {
    next = toggleDoneUnchecked(clocked ? { ...value, clock: null } : value, exercise, index, at);
  }
  const older = lastActivity(value) > at;
  // A rest started, changed or ended after the tick stays as it is.
  const restOlder = older || (value.restChangedAt ?? 0) > at;
  // A rest the tick starts is the watch's to signal when the tick was made there (ADR 0112).
  const rest = restOlder ? value.rest : next.rest && restBy(next.rest, options.byWatch ?? false);
  return {
    ...next,
    current: older ? value.current : next.current,
    rest: restUntil(rest, rest?.endsAt ?? null, now),
    restChangedAt: restOlder ? value.restChangedAt : next.restChangedAt,
  };
}

/** The rest as started or last changed by the watch, or by the phone. */
export function restBy(rest: NonNullable<Session['rest']>, byWatch: boolean): Session['rest'] {
  const { byWatch: _, ...phone } = rest;
  return byWatch ? { ...phone, byWatch: true } : phone;
}

/**
 * Makes the rest end at another time, or ends it with null, as changed at `at` on the phone or
 * the watch, so that a tick made before then starts no rest again. A rest that is over by `now`
 * ends.
 */
export function setRestEnd(
  value: Session,
  endsAt: number | null,
  at: number,
  { now = at, byWatch = false }: { now?: number; byWatch?: boolean } = {},
): Session {
  const rest = restUntil(value.rest, endsAt, now);
  return {
    ...value,
    rest: rest && restBy(rest, byWatch),
    // Never back in time, as a watch's clock can run behind the phone's.
    restChangedAt: Math.max(value.restChangedAt ?? 0, at),
  };
}

/** Lengthens or shortens the rest; a rest that is over ends. */
export function changeRest(value: Session, seconds: number, now = Date.now()): Session {
  return value.rest ? setRestEnd(value, value.rest.endsAt + seconds * 1000, now) : value;
}

/** Ends the rest before its time. */
export function skipRest(value: Session, now = Date.now()): Session {
  return setRestEnd(value, null, now);
}

/** The sets that were done, the way log_workout() takes them. Exercises without any are left out. */
export function toLog(value: Session, finishedAt = Date.now()) {
  return {
    clientId: value.id,
    workoutId: value.workoutId,
    // What the workout had, so the history can say how much of it was done.
    plannedExercises: value.planned.exercises,
    plannedSets: value.planned.sets,
    startedAt: new Date(value.startedAt).toISOString(),
    // The device's day it started on, which the streak counts it for (ADR 0044).
    startedOn: toIsoDate(new Date(value.startedAt)),
    finishedAt: new Date(Math.max(finishedAt, value.startedAt + 1000)).toISOString(),
    exercises: value.exercises.map((exercise) => ({
      exerciseId: exercise.exerciseId,
      sets: exercise.sets
        .filter((s) => s.done)
        .map(({ doneAt, ...set }) => ({
          ...pickSetValues(set),
          // When the set was done, which the heart rate chart marks (ADR 0104).
          ...(doneAt !== undefined ? { doneAt: new Date(doneAt).toISOString() } : {}),
        })),
    })),
    ...(value.move ? { move: value.move } : {}),
  };
}

/** Sets done and planned, and the weight lifted, for the progress bar and the summary. */
export function sessionTotals(value: Session) {
  const sets = value.exercises.flatMap((exercise) => exercise.sets);
  const done = sets.filter((s) => s.done);
  return {
    done: done.length,
    planned: sets.length,
    kilograms: done.reduce((total, s) => total + (s.weightKg ?? 0) * (s.reps ?? 0), 0),
  };
}
