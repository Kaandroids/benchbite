import {
  addSet,
  setValues,
  startClock,
  startSession,
  stopClock,
  toggleDoneUnchecked,
  type Session,
} from '@/sessions/session';
import { setKindOf } from '@/sets/fields';
import { testExercise, testWorkout } from '@/workouts/test-data';

import {
  applyCommand,
  crownOf,
  nextSetOf,
  parseCommand,
  PROTOCOL_VERSION,
  stateOf,
  workoutIdOf,
  type ExerciseOf,
  type MetricsOf,
  type ChangeCommand,
} from './protocol';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'workout-1' }));
jest.mock('expo-sqlite/kv-store', () => ({
  Storage: { getItemSync: () => null, setItemSync: () => undefined },
}));

const NOW = 1_800_000_000_000;
/** The exercises' metrics as before the library loads: what a set needs is read from its target. */
const noLibrary: MetricsOf = () => undefined;
/** The library's exercises: none known, as before it loads. */
const noExercises: ExerciseOf = () => undefined;
/** The workout named as the phone names it, and its exercises by the library. */
const names = (exerciseOf: ExerciseOf) => ({ exerciseOf, name: 'Full body' });
/** The bench press as the library has it: lifted, with a barbell. */
const withBench: ExerciseOf = (id) =>
  id === 'bench'
    ? { name: 'Bench press', metrics: ['weight', 'reps'], equipment: 'barbell' }
    : undefined;
const MINUTE = 60_000;

const PUSH = testWorkout(7, {
  exercises: [
    testExercise('bench', { sets: 4, restSeconds: 90 }),
    testExercise('row', { sets: 2, restSeconds: 60 }),
    testExercise('plank', { sets: 1, target: { seconds: 45, meters: null }, restSeconds: 0 }),
  ],
});

const start = () => startSession('user-a', PUSH, {}, { now: NOW });

let count = 0;
/** A command from the watch that changes the workout, made at `at`. */
function command(at: number, body: Record<string, unknown>): ChangeCommand {
  count += 1;
  const parsed = parseCommand({
    v: PROTOCOL_VERSION,
    id: `command-${count}`,
    at,
    workoutId: 'workout-1',
    ...body,
  });
  if (!parsed || parsed.type === 'finish') throw new Error('Not a command that changes it');
  return parsed;
}

const done = (at: number, set: number, value = true) =>
  command(at, { type: 'setDone', exercise: 0, set, done: value });
const weigh = (at: number, set: number, weightKg: number) =>
  command(at, { type: 'setValues', exercise: 0, set, values: { weightKg } });

const bench = (session: Session) => session.exercises[0]!.sets;

describe('parseCommand', () => {
  it('reads each kind of command', () => {
    expect(done(NOW, 0)).toMatchObject({ type: 'setDone', exercise: 0, set: 0, done: true });
    expect(weigh(NOW, 1, 80)).toMatchObject({ values: { weightKg: 80 } });
    expect(
      command(NOW, { type: 'setDone', exercise: 0, set: 1, done: true, values: { weightKg: 80 } }),
    ).toMatchObject({ values: { weightKg: 80 } });
    expect(command(NOW, { type: 'addSet', exercise: 1, sets: 3 })).toMatchObject({ sets: 3 });
    expect(command(NOW, { type: 'join' })).toMatchObject({ type: 'join' });
    expect(command(NOW, { type: 'open', exercise: 1 })).toMatchObject({ exercise: 1 });
    expect(
      parseCommand({ v: PROTOCOL_VERSION, id: 'f', at: NOW, workoutId: 'w', type: 'finish' }),
    ).toMatchObject({ type: 'finish' });
    expect(command(NOW, { type: 'setRest', of: NOW, endsAt: null })).toMatchObject({
      endsAt: null,
    });
  });

  it('drops what is not a command of this version', () => {
    const base = { v: PROTOCOL_VERSION, id: 'x', at: NOW, workoutId: 'workout-1' };
    for (const message of [
      null,
      'setDone',
      { ...base, v: 2, type: 'addSet', exercise: 0, sets: 3 },
      { ...base, id: '', type: 'addSet', exercise: 0, sets: 3 },
      { ...base, at: 'now', type: 'addSet', exercise: 0, sets: 3 },
      { ...base, type: 'end' },
      { ...base, type: 'addSet', exercise: -1, sets: 3 },
      { ...base, type: 'addSet', exercise: 0 },
      { ...base, type: 'addSet', exercise: 0, sets: 0 },
      { ...base, type: 'addSet', exercise: 1.5, sets: 3 },
      { ...base, type: 'setDone', exercise: 0, set: 0, done: 'yes' },
      { ...base, type: 'setValues', exercise: 0, set: 0, values: {} },
      { ...base, type: 'setValues', exercise: 0, set: 0, values: { notes: 'hi' } },
      { ...base, type: 'setValues', exercise: 0, set: 0, values: { constructor: null } },
      { ...base, type: 'setValues', exercise: 0, set: 0, values: { reps: '8' } },
      { ...base, id: 'x'.repeat(65), type: 'addSet', exercise: 0, sets: 3 },
      { ...base, type: 'setRest', of: NOW, endsAt: 'later' },
      { ...base, type: 'setDone', exercise: 0, set: 0, done: true, values: { kg: 80 } },
      { ...base, type: 'setDone', exercise: 0, set: 0, done: true, values: {} },
      { ...base, type: 'open' },
      { ...base, type: 'open', exercise: -1 },
    ]) {
      expect(parseCommand(message)).toBeNull();
    }
  });
});

it('keeps values as the phone keeps what is typed', () => {
  const values = (sent: Record<string, unknown>) => {
    const parsed = command(NOW, { type: 'setValues', exercise: 0, set: 0, values: sent });
    return parsed.type === 'setValues' ? parsed.values : null;
  };
  expect(values({ weightKg: 62.3, reps: 8.5 })).toEqual({ weightKg: 62.25, reps: 9 });
  // Nothing, or more than a set can hold, as when typed.
  expect(values({ reps: 0, seconds: -5 })).toEqual({ reps: null, seconds: null });
  expect(values({ weightKg: 5000 })).toEqual({ weightKg: 999.75 });
});

describe('stateOf', () => {
  it('gives the watch the workout with its exercises named', () => {
    const session = toggleDoneUnchecked(start(), 0, 0, NOW + MINUTE);
    const state = stateOf(session, names(withBench), 7, []);
    expect(state).toMatchObject({ v: PROTOCOL_VERSION, seq: 7 });
    expect(state.workout).toMatchObject({
      id: 'workout-1',
      current: 0,
      rest: { endsAt: NOW + MINUTE + 90_000, seconds: 90 },
      setsToSave: 1,
      applied: [],
      follows: false,
    });
    expect(state.workout?.exercises[0]).toMatchObject({ name: 'Bench press', restSeconds: 90 });
    // Only what the watch shows: no times of the phone's own.
    expect(state.workout?.exercises[0]?.sets[0]).toEqual({
      weightKg: null,
      reps: 12,
      seconds: null,
      meters: null,
      done: true,
      missing: [],
      text: '— × 12',
      lastText: null,
    });
  });

  it('counts the set the phone’s clock times among those finishing saves', () => {
    const running = startClock(start(), 0, 1, NOW + MINUTE);
    expect(stateOf(running, names(withBench), 1, []).workout?.setsToSave).toBe(1);
  });

  it('gives each exercise its fields and how the Crown turns them, and each set last time’s', () => {
    const last = { bench: [{ weightKg: 77.5, reps: 7, seconds: null, meters: null }] };
    const session = startSession('user-a', PUSH, last, { now: NOW });
    const state = stateOf(session, names(withBench), 1, []);
    const [bench, , plank] = state.workout!.exercises;
    expect(bench).toMatchObject({
      fields: ['weightKg', 'reps'],
      crown: {
        weightKg: { min: 2.5, max: 999.75, step: 2.5 },
        reps: { min: 1, max: 999, step: 1 },
      },
    });
    expect(bench?.sets.map((set) => set.lastText)).toEqual(['77.5 kg × 7', null, null, null]);
    expect(plank).toMatchObject({ fields: ['seconds'], crown: {} });
  });

  it('turns a weight added to the body down to none, and by the equipment’s step', () => {
    const pullUp = setKindOf(['reps'], { reps: { min: 8, max: 12 } });
    expect(crownOf(pullUp, 'dumbbell').weightKg).toEqual({ min: 0, max: 999.75, step: 2 });
  });

  it('says what each set still needs, as the phone does', () => {
    const state = stateOf(start(), names(withBench), 1, []);
    const [bench, , plank] = state.workout!.exercises;
    // A weight is needed before the bench press can be ticked, as on the phone.
    expect(bench?.sets[0]?.missing).toEqual(['weightKg']);
    // A timed set starts without a time, which the phone's clock measures.
    expect(plank?.sets[0]?.missing).toEqual(['seconds']);
  });

  it('names no exercise the library does not know', () => {
    const state = stateOf(start(), names(noExercises), 1, []);
    expect(state.workout?.exercises[0]?.name).toBeNull();
  });

  it('says how the latest workouts ended, by their ids', () => {
    const ended = [
      { id: 'workout-2', startedAt: NOW + MINUTE, saved: false as const },
      { id: undefined, startedAt: NOW, saved: true as const, endedAt: NOW + MINUTE },
    ];
    expect(stateOf(null, names(noExercises), 1, ended).ended).toEqual([
      { id: 'workout-2', saved: false },
      { id: `started-${NOW}`, saved: true, endedAt: NOW + MINUTE },
    ]);
  });

  it('says no workout runs', () => {
    expect(stateOf(null, names(noExercises), 1, []).workout).toBeNull();
  });

  it('names a workout started before ids were kept by its start', () => {
    const { id: _id, ...older } = start();
    expect(workoutIdOf(older)).toBe(`started-${NOW}`);
  });
});

describe('nextSetOf', () => {
  it('is the open exercise’s first set not done', () => {
    const session = toggleDoneUnchecked(start(), 0, 0, NOW);
    expect(nextSetOf(session)).toEqual({ exercise: 0, set: 1 });
    expect(stateOf(session, names(noExercises), 1, []).workout?.next).toEqual({
      exercise: 0,
      set: 1,
    });
  });

  it('goes on after the open exercise, then before it, when it is done', () => {
    // The rows are done while the bench press was left open, and the plank comes after them.
    let session = { ...start(), current: 1 };
    session = toggleDoneUnchecked(toggleDoneUnchecked(session, 1, 0, NOW), 1, 1, NOW);
    expect(nextSetOf(session)).toEqual({ exercise: 2, set: 0 });
    session = toggleDoneUnchecked(session, 2, 0, NOW);
    expect(nextSetOf(session)).toEqual({ exercise: 0, set: 0 });
  });

  it('is none when every set is done', () => {
    let session = start();
    session.exercises.forEach((exercise, e) =>
      exercise.sets.forEach((_, s) => {
        session = toggleDoneUnchecked(session, e, s, NOW);
      }),
    );
    expect(nextSetOf(session)).toBeNull();
  });
});

// Jest runs each test file as a module of Node's, which has it; the app's types leave Node out.
declare const __dirname: string;

describe('the protocol version', () => {
  it('is of the version the watch app speaks', () => {
    // targets/watch/Protocol.swift keeps the same version; a message of another one is dropped.
    // This guards the number only: a change of a message's shape is made on both sides by hand.
    const { readFileSync } = jest.requireActual<{
      readFileSync: (path: string, encoding: 'utf8') => string;
    }>('fs');
    const swift = readFileSync(`${__dirname}/../../targets/watch/Protocol.swift`, 'utf8');
    expect(Number(/let protocolVersion = (\d+)/.exec(swift)?.[1])).toBe(PROTOCOL_VERSION);
  });
});

describe('applyCommand', () => {
  it('ticks a set the watch ticked, with the rest from then', () => {
    const session = applyCommand(start(), done(NOW + MINUTE, 0), {
      metricsOf: noLibrary,
      now: NOW + MINUTE + 1000,
    });
    expect(bench(session)[0]).toMatchObject({ done: true, doneAt: NOW + MINUTE });
    expect(session.rest).toEqual({ endsAt: NOW + MINUTE + 90_000, seconds: 90 });
    expect(session.watchCommands).toHaveLength(1);
  });

  it('applies a command once, however often it arrives', () => {
    const tick = done(NOW + MINUTE, 0);
    const once = applyCommand(start(), tick, { metricsOf: noLibrary, now: NOW + MINUTE });
    // A second delivery would untick it, were the command a toggle.
    expect(applyCommand(once, tick, { metricsOf: noLibrary, now: NOW + MINUTE })).toBe(once);
  });

  it('drops a command for another workout', () => {
    const session = start();
    const other = { ...done(NOW + MINUTE, 0), workoutId: 'workout-0' };
    expect(applyCommand(session, other, { metricsOf: noLibrary, now: NOW + MINUTE })).toBe(session);
  });

  it('follows sets done in turn on the watch and the phone', () => {
    // Set 1 on the watch, set 2 on the phone, set 3 on the watch again, set 4 on the phone.
    let session = applyCommand(start(), done(NOW + MINUTE, 0), {
      metricsOf: noLibrary,
      now: NOW + MINUTE,
    });
    session = toggleDoneUnchecked(session, 0, 1, NOW + 3 * MINUTE);
    session = applyCommand(session, weigh(NOW + 5 * MINUTE, 2, 82.5), {
      metricsOf: noLibrary,
      now: NOW + 5 * MINUTE,
    });
    session = applyCommand(session, done(NOW + 6 * MINUTE, 2), {
      metricsOf: noLibrary,
      now: NOW + 6 * MINUTE,
    });
    session = toggleDoneUnchecked(session, 0, 3, NOW + 9 * MINUTE);
    expect(bench(session).map((set) => set.done)).toEqual([true, true, true, true]);
    expect(bench(session)[2]?.weightKg).toBe(82.5);
    // The bench press is done, so the row is open next.
    expect(session.current).toBe(1);
  });

  it('keeps the values the phone changed later, and takes the others from the watch', () => {
    // Reps changed on the watch at 10:00, out of reach; the weight typed on the phone at 10:01.
    let session = setValues(start(), 0, 0, { weightKg: 60 }, NOW + MINUTE);
    const both = command(NOW, {
      type: 'setValues',
      exercise: 0,
      set: 0,
      values: { weightKg: 50, reps: 6 },
    });
    session = applyCommand(session, both, { metricsOf: noLibrary, now: NOW + 2 * MINUTE });
    expect(bench(session)[0]).toMatchObject({ weightKg: 60, reps: 6 });
  });

  it('keeps a value typed on the phone after one sent late from the watch', () => {
    // Set on the watch at 10:02, out of reach; typed on the phone at 10:04; delivered at 10:05.
    let session = setValues(start(), 0, 1, { weightKg: 85 }, NOW + 4 * MINUTE);
    session = applyCommand(session, weigh(NOW + 2 * MINUTE, 1, 80), {
      metricsOf: noLibrary,
      now: NOW + 5 * MINUTE,
    });
    expect(bench(session)[1]?.weightKg).toBe(85);
    // The command still counts as applied, so that the watch stops waiting on it.
    expect(session.watchCommands).toHaveLength(1);
  });

  it('applies the watch’s ticks that waited, without undoing what the phone did since', () => {
    // Ticked on the watch at 10:01 and 10:03 while out of reach; set 1 unticked on the phone at
    // 10:04, as a mistake; both ticks delivered at 10:05.
    let session = toggleDoneUnchecked(start(), 0, 0, NOW);
    session = toggleDoneUnchecked(session, 0, 0, NOW + 4 * MINUTE);
    session = applyCommand(session, done(NOW + MINUTE, 0), {
      metricsOf: noLibrary,
      now: NOW + 5 * MINUTE,
    });
    session = applyCommand(session, done(NOW + 3 * MINUTE, 1), {
      metricsOf: noLibrary,
      now: NOW + 5 * MINUTE,
    });
    expect(bench(session).map((set) => set.done)).toEqual([false, true, false, false]);
  });

  it('starts no rest that would already be over', () => {
    const session = applyCommand(start(), done(NOW, 0), {
      metricsOf: noLibrary,
      now: NOW + 5 * MINUTE,
    });
    expect(bench(session)[0]?.done).toBe(true);
    expect(session.rest).toBeNull();
  });

  it('keeps the rest of a later set when an older tick arrives', () => {
    let session = toggleDoneUnchecked(start(), 0, 1, NOW + 3 * MINUTE);
    const rest = session.rest;
    session = applyCommand(session, done(NOW + 2 * MINUTE, 0), {
      metricsOf: noLibrary,
      now: NOW + 3 * MINUTE + 1000,
    });
    expect(bench(session)[0]?.done).toBe(true);
    expect(session.rest).toEqual(rest);
  });

  it('keeps a time from the future as the time it arrived', () => {
    // A command that says 10:10 arrives at 10:05; one made at 10:06 still applies after it.
    let session = applyCommand(start(), weigh(NOW + 10 * MINUTE, 0, 70), {
      metricsOf: noLibrary,
      now: NOW + 5 * MINUTE,
    });
    expect(bench(session)[0]?.valuesAt?.weightKg).toBe(NOW + 5 * MINUTE);
    session = applyCommand(session, weigh(NOW + 6 * MINUTE, 0, 72.5), {
      metricsOf: noLibrary,
      now: NOW + 6 * MINUTE,
    });
    expect(bench(session)[0]?.weightKg).toBe(72.5);
  });

  it('adds a set up to the number the watch showed, once', () => {
    // The row has 2 sets; the watch adds a third.
    const add = command(NOW, { type: 'addSet', exercise: 1, sets: 3 });
    let session = applyCommand(start(), add, { metricsOf: noLibrary, now: NOW });
    session = applyCommand(session, add, { metricsOf: noLibrary, now: NOW });
    expect(session.exercises[1]?.sets).toHaveLength(3);
    // Added on the phone meanwhile, out of reach: the watch's adds none more.
    const phoneAdded = addSet(start(), 1);
    const late = command(NOW, { type: 'addSet', exercise: 1, sets: 3 });
    expect(
      applyCommand(phoneAdded, late, { metricsOf: noLibrary, now: NOW }).exercises[1]?.sets,
    ).toHaveLength(3);
    const nowhere = command(NOW, { type: 'addSet', exercise: 9, sets: 1 });
    expect(applyCommand(start(), nowhere, { metricsOf: noLibrary, now: NOW }).exercises).toEqual(
      start().exercises,
    );
  });

  it('changes or skips the rest the watch showed, and no other', () => {
    const resting = toggleDoneUnchecked(start(), 0, 0, NOW);
    const endsAt = NOW + 90_000;
    const longer = applyCommand(
      resting,
      command(NOW + 10_000, { type: 'setRest', of: endsAt, endsAt: endsAt + 15_000 }),
      { metricsOf: noLibrary, now: NOW + 10_000 },
    );
    expect(longer.rest).toEqual({ endsAt: endsAt + 15_000, seconds: 90 });
    const skipped = applyCommand(
      resting,
      command(NOW + 10_000, { type: 'setRest', of: endsAt, endsAt: null }),
      { metricsOf: noLibrary, now: NOW + 10_000 },
    );
    expect(skipped.rest).toBeNull();
    // A rest that changed on the phone meanwhile stays as it is.
    const stale = applyCommand(
      resting,
      command(NOW + 10_000, { type: 'setRest', of: endsAt - 5000, endsAt: null }),
      { metricsOf: noLibrary, now: NOW + 10_000 },
    );
    expect(stale.rest).toEqual(resting.rest);
  });

  it('stops the phone’s clock on a set ticked on the watch, which then stays done', () => {
    const clocked = startClock(start(), 2, 0, NOW);
    const plank = command(NOW + 50_000, { type: 'setDone', exercise: 2, set: 0, done: true });
    const session = applyCommand(clocked, plank, { metricsOf: noLibrary, now: NOW + 51_000 });
    expect(session.clock).toBeNull();
    expect(session.exercises[2]?.sets[0]).toMatchObject({ done: true, seconds: 50 });
    // Finishing stops a running clock, which would otherwise untick the set.
    expect(stopClock(session, NOW + 60_000).exercises[2]?.sets[0]?.done).toBe(true);
  });

  it('keeps the watch’s time for a set ticked before the phone’s clock started on it', () => {
    // 60 s given and ticked on the watch at 10:00, out of reach; the clock started at 10:01.
    let session = startClock(start(), 2, 0, NOW + MINUTE);
    const plank = { type: 'setDone', exercise: 2, set: 0, done: true };
    session = applyCommand(
      session,
      command(NOW, { type: 'setValues', exercise: 2, set: 0, values: { seconds: 60 } }),
      { metricsOf: noLibrary, now: NOW + 90_000 },
    );
    session = applyCommand(session, command(NOW, plank), {
      metricsOf: noLibrary,
      now: NOW + 90_000,
    });
    expect(session.exercises[2]?.sets[0]).toMatchObject({ done: true, seconds: 60 });
    expect(session.clock).toBeNull();
  });

  it('ticks no set without what it needs, as the phone does not', () => {
    const lifted = { metricsOf: () => ['weight', 'reps'] as ('weight' | 'reps')[], now: NOW };
    // Without a weight, for an exercise that lifts one.
    let session = applyCommand(start(), done(NOW, 0), lifted);
    expect(bench(session)[0]?.done).toBe(false);
    session = applyCommand(session, weigh(NOW, 0, 60), lifted);
    session = applyCommand(session, done(NOW, 0), lifted);
    expect(bench(session)[0]?.done).toBe(true);
    // Without reps, which the log refuses.
    const noReps = setValues(start(), 0, 1, { reps: null }, NOW);
    expect(
      bench(applyCommand(noReps, done(NOW, 1), { metricsOf: noLibrary, now: NOW }))[1]?.done,
    ).toBe(false);
    // A timed set without its time.
    const plank = command(NOW, { type: 'setDone', exercise: 2, set: 0, done: true });
    expect(
      applyCommand(start(), plank, { metricsOf: noLibrary, now: NOW }).exercises[2]?.sets[0]?.done,
    ).toBe(false);
  });

  it('ticks a set with the values the watch edited for it', () => {
    const lifted = { metricsOf: () => ['weight', 'reps'] as ('weight' | 'reps')[], now: NOW };
    const edited = command(NOW, {
      type: 'setDone',
      exercise: 0,
      set: 0,
      done: true,
      values: { weightKg: 82.5, reps: 8 },
    });
    expect(bench(applyCommand(start(), edited, lifted))[0]).toMatchObject({
      weightKg: 82.5,
      reps: 8,
      done: true,
    });
  });

  it('sets a done set’s values from a later tick of the watch, the latest change', () => {
    const lifted = {
      metricsOf: () => ['weight', 'reps'] as ('weight' | 'reps')[],
      now: NOW + MINUTE,
    };
    // Ticked on the phone while the watch was out of reach, then changed and ticked there.
    const ticked = toggleDoneUnchecked(setValues(start(), 0, 0, { weightKg: 80 }, NOW), 0, 0, NOW);
    const later = command(NOW + MINUTE, {
      type: 'setDone',
      exercise: 0,
      set: 0,
      done: true,
      values: { weightKg: 85 },
    });
    expect(bench(applyCommand(ticked, later, lifted))[0]).toMatchObject({
      weightKg: 85,
      done: true,
    });
  });

  it('sets no values with a tick older than the set’s last untick', () => {
    const lifted = {
      metricsOf: () => ['weight', 'reps'] as ('weight' | 'reps')[],
      now: NOW + MINUTE,
    };
    let session = toggleDoneUnchecked(setValues(start(), 0, 0, { weightKg: 80 }, NOW), 0, 0, NOW);
    session = toggleDoneUnchecked(session, 0, 0, NOW + MINUTE);
    const older = command(NOW + 30_000, {
      type: 'setDone',
      exercise: 0,
      set: 0,
      done: true,
      values: { weightKg: 85 },
    });
    expect(bench(applyCommand(session, older, lifted))[0]).toMatchObject({
      weightKg: 80,
      done: false,
    });
  });

  it('keeps the rest changed at the later time, as a watch’s clock can run behind', () => {
    const session = toggleDoneUnchecked(start(), 0, 0, NOW + MINUTE);
    const skipped = applyCommand(
      session,
      command(NOW + 30_000, { type: 'setRest', of: session.rest!.endsAt, endsAt: null }),
      { metricsOf: noLibrary, now: NOW + MINUTE + 1000 },
    );
    expect(skipped.rest).toBeNull();
    expect(skipped.restChangedAt).toBe(NOW + MINUTE);
  });

  it('starts no rest again for an older tick once the watch changed the rest', () => {
    let session = toggleDoneUnchecked(start(), 0, 1, NOW + MINUTE);
    const endsAt = session.rest!.endsAt;
    session = applyCommand(
      session,
      command(NOW + 2 * MINUTE, { type: 'setRest', of: endsAt, endsAt: null }),
      { metricsOf: noLibrary, now: NOW + 2 * MINUTE },
    );
    session = applyCommand(session, done(NOW + MINUTE + 30_000, 0), {
      metricsOf: noLibrary,
      now: NOW + 2 * MINUTE,
    });
    expect(bench(session)[0]?.done).toBe(true);
    expect(session.rest).toBeNull();
  });

  it('keeps the open exercise when an older tick completes an earlier one', () => {
    // The bench press's last set ticked on the watch at 10:04, delivered after the plank was
    // opened on the phone at 10:05.
    let session = toggleDoneUnchecked(start(), 0, 0, NOW);
    session = toggleDoneUnchecked(session, 0, 1, NOW + MINUTE);
    session = toggleDoneUnchecked(session, 0, 2, NOW + 2 * MINUTE);
    session = { ...setValues(session, 2, 0, { seconds: 40 }, NOW + 5 * MINUTE), current: 2 };
    session = toggleDoneUnchecked(session, 2, 0, NOW + 5 * MINUTE);
    session = applyCommand(session, done(NOW + 4 * MINUTE, 3), {
      metricsOf: noLibrary,
      now: NOW + 6 * MINUTE,
    });
    expect(bench(session)[3]?.done).toBe(true);
    expect(session.current).toBe(2);
  });

  it('lets the watch follow the workout once it joins, however often it asks', () => {
    const join = command(NOW, { type: 'join' });
    const joined = applyCommand(start(), join, { metricsOf: noLibrary, now: NOW });
    expect(joined.watchFollows).toBe(true);
    expect(stateOf(joined, names(noExercises), 1, []).workout?.follows).toBe(true);
    expect(
      applyCommand(joined, command(NOW, { type: 'join' }), { metricsOf: noLibrary }).watchFollows,
    ).toBe(true);
  });

  it('opens the exercise picked on the watch, whose sets then come next', () => {
    const opened = applyCommand(start(), command(NOW, { type: 'open', exercise: 1 }), {
      metricsOf: noLibrary,
      now: NOW,
    });
    expect(opened.current).toBe(1);
    expect(nextSetOf(opened)).toEqual({ exercise: 1, set: 0 });
    // One the workout does not have, as after it was changed on the phone.
    const missing = command(NOW, { type: 'open', exercise: opened.exercises.length });
    expect(applyCommand(opened, missing, { metricsOf: noLibrary, now: NOW }).current).toBe(1);
  });

  it('keeps the exercise of a set ticked after a pick that waited', () => {
    // The pick was made at NOW, but the phone ticked a set of the open exercise since.
    const ticked = applyCommand(start(), done(NOW + MINUTE, 0), {
      metricsOf: noLibrary,
      now: NOW + MINUTE,
    });
    const late = command(NOW, { type: 'open', exercise: 1 });
    expect(
      applyCommand(ticked, late, { metricsOf: noLibrary, now: NOW + 2 * MINUTE }).current,
    ).toBe(0);
    // The last of picks made in turn counts.
    const picks = [2, 1].reduce(
      (session, exercise, i) =>
        applyCommand(session, command(NOW + 2 * MINUTE + i, { type: 'open', exercise }), {
          metricsOf: noLibrary,
          now: NOW + 3 * MINUTE,
        }),
      ticked,
    );
    expect(picks.current).toBe(1);
    // A newer pick that arrived first.
    const outOfOrder = [
      command(NOW + 3 * MINUTE, { type: 'open', exercise: 2 }),
      command(NOW + 2 * MINUTE, { type: 'open', exercise: 1 }),
    ].reduce(
      (session, pick) =>
        applyCommand(session, pick, { metricsOf: noLibrary, now: NOW + 4 * MINUTE }),
      ticked,
    );
    expect(outOfOrder.current).toBe(2);
  });

  it('keeps only the latest command ids', () => {
    let session = start();
    for (let i = 0; i < 60; i++) {
      session = applyCommand(session, weigh(NOW + i, 0, i), { metricsOf: noLibrary, now: NOW + i });
    }
    expect(session.watchCommands).toHaveLength(50);
  });
});
