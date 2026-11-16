// The protocol's messages as the phone sends them and the watch sends them back, kept as fixtures
// in src/watch/fixtures (#541). This test checks the phone's side: its state is the fixtures', and
// it takes the watch's commands. `pnpm check:watch` checks the watch's side: it reads every field of
// the state, and its commands are the fixtures'. Write the state's fixtures again with
// `pnpm watch:fixtures` after changing the protocol on purpose.
import { startClock, startSession, toggleDoneUnchecked } from '@/sessions/session';
import { describeSet, type SetKind } from '@/sets/fields';
import type { SetValues } from '@/sets/values';
import { testExercise, testWorkout } from '@/workouts/test-data';

import commands from './fixtures/commands.json';
import stateEnded from './fixtures/state-ended.json';
import stateUnderWay from './fixtures/state-under-way.json';
import { parseCommand, stateOf, type ExerciseOf } from './protocol';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'workout-1' }));
jest.mock('expo-sqlite/kv-store', () => ({
  Storage: { getItemSync: () => null, setItemSync: () => undefined },
}));

const WRITE = process.env.WATCH_FIXTURES === 'write';

/** Writes a fixture beside this test, through Node's fs, which the app's types leave out. */
function writeFixture(file: string, value: unknown) {
  const fs = jest.requireActual<{ writeFileSync: (path: string, data: string) => void }>('fs');
  const dir = (expect.getState().testPath ?? '').replace(/[^/]+$/, '');
  fs.writeFileSync(`${dir}fixtures/${file}`, `${JSON.stringify(value, null, 2)}\n`);
}
const NOW = 1_800_000_000_000;

const LIBRARY: Record<string, ReturnType<ExerciseOf>> = {
  bench: { name: 'Bench press', metrics: ['weight', 'reps'], equipment: 'barbell' },
  row: { name: 'Bent over row', metrics: ['weight', 'reps'], equipment: 'barbell' },
  plank: { name: 'Plank', metrics: ['duration'], equipment: 'body only' },
  drag: { name: 'Backward drag', metrics: ['weight', 'distance'], equipment: 'other' },
};
const WORDS = { number: String, reps: (count: number) => `${count} reps` };
const names = {
  exerciseOf: (id: string) => LIBRARY[id],
  name: 'Full body',
  language: 'en',
  describe: (values: SetValues, kind: SetKind) => describeSet(values, kind, WORDS),
};

/**
 * A workout under way: a superset of bench press and row with set targets, its first set done and
 * its rest running; a plank with a target time, its clock running; and a carry.
 */
function underWay() {
  const workout = testWorkout(7, {
    exercises: [
      testExercise('bench', { sets: 3, restSeconds: 90, superset: 1 }),
      testExercise('row', { sets: 2, restSeconds: 90, superset: 1 }),
      testExercise('plank', { sets: 2, target: { seconds: 45, meters: null }, restSeconds: 60 }),
      testExercise('drag', { sets: 1, target: { seconds: null, meters: 50 }, restSeconds: 0 }),
    ],
  });
  const last = { bench: [{ weightKg: 80, reps: 8, seconds: null, meters: null }] };
  const targets = {
    0: { exerciseId: 'bench', sets: [{ weightKg: 82.5, reps: 8, seconds: null }] },
    2: { exerciseId: 'plank', sets: [{ weightKg: null, reps: null, seconds: 50 }] },
  };
  let session = startSession('user-a', workout, last, { now: NOW, targets, watchFollows: true });
  session = toggleDoneUnchecked(session, 0, 0, NOW + 60_000);
  session = startClock(session, 2, 0, NOW + 90_000);
  return session;
}

const STATES = {
  'under-way': [stateUnderWay, () => stateOf(underWay(), names, 12, [])],
  ended: [
    stateEnded,
    () =>
      stateOf(null, names, 13, [
        {
          id: 'workout-1',
          startedAt: NOW,
          saved: true,
          endedAt: NOW + 3_600_000,
          setsSaved: 7,
          setCount: 8,
          records: 2,
        },
        { id: 'workout-0', startedAt: NOW - 86_400_000, saved: false },
      ]),
  ],
} as const;

describe('the state the phone sends the watch', () => {
  it.each(Object.entries(STATES))('is the fixture %s', (name, [fixture, state]) => {
    // As JSON, which drops what JSON does not hold, such as a key whose value is undefined.
    const sent: unknown = JSON.parse(JSON.stringify(state()));
    if (WRITE) {
      writeFixture(`state-${name}.json`, sent);
      return;
    }
    expect(sent).toEqual(fixture);
  });
});

describe('the commands the watch sends', () => {
  it('cover every kind the watch makes', () => {
    expect(commands.map((item) => item.name).sort()).toEqual(
      [
        'finish',
        'join',
        'open',
        'setDone',
        'setDoneWithValues',
        'setRest',
        'skipRest',
        'startClock',
      ].sort(),
    );
  });

  it.each(commands.map((item) => [item.name, item.command] as const))(
    'take %s as the phone parses it',
    (_name, command) => {
      // Every field the watch sent, as the phone reads it.
      expect(parseCommand(command)).toMatchObject(command as object);
    },
  );
});
