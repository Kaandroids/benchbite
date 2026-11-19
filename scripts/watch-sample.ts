// Prints a sample for the Apple Watch app to show without a phone, for the README's screenshots
// (docs/media/README.md): a workout like the demo account's Upper body, at a set, in a rest, or
// saved. Its values are kept by hand; `pnpm check:watch` checks that the watch reads them.
// A debug build of the watch app takes it at launch (targets/watch/Sample.swift):
//
//   SIMCTL_CHILD_BENCHBITE_SAMPLE="$(node scripts/watch-sample.ts set)" \
//     xcrun simctl launch <watch simulator id> <the watch app's bundle id>
//
// Its times are counted from now, so that the workout's clock and the rest run as they would.
const SCENES = ['set', 'rest', 'summary'] as const;
type Scene = (typeof SCENES)[number];

const scene = process.argv[2] as Scene | undefined;
if (!scene || !SCENES.includes(scene)) {
  console.error(`Usage: node scripts/watch-sample.ts <${SCENES.join('|')}>`);
  process.exit(1);
}

const now = Date.now();
const MINUTE = 60_000;
const WORKOUT_ID = 'sample-workout';

/** How the Crown turns a weight and a count of reps, as the phone sends them. */
const CROWN = {
  weightKg: { min: 2.5, max: 999.75, step: 2.5, fine: 0.5 },
  reps: { min: 1, max: 999, step: 1 },
};

/** A set of a weight and reps, with what was lifted last time beside it. */
function set(weightKg: number, reps: number, done: boolean, lastText: string | null = null) {
  return {
    weightKg,
    reps,
    seconds: null,
    meters: null,
    done,
    missing: [],
    text: `${weightKg} kg × ${reps}`,
    lastText,
    targetSeconds: null,
    timedByClock: false,
  };
}

/** An exercise of sets of a weight and reps: `done` of them are ticked. */
function exercise(exerciseId: string, name: string, kg: number, reps: number, done: number) {
  return {
    exerciseId,
    name,
    target: { reps: { min: 8, max: 12 } },
    fields: ['weightKg', 'reps'],
    crown: CROWN,
    restSeconds: 90,
    superset: null,
    sets: [0, 1, 2].map((index) => set(kg, reps, index < done, `${kg - 2.5} kg × ${reps}`)),
  };
}

/**
 * The workout a quarter of an hour in: two sets of the bench press done, the third next, after a
 * rest in that scene. The one saved started long enough ago for all its sets.
 */
function workout(scene: Scene) {
  return {
    id: WORKOUT_ID,
    name: 'Upper body',
    startedAt: now - (scene === 'summary' ? 52 : 14) * MINUTE,
    current: 0,
    next: { exercise: 0, set: 2 },
    rest: scene === 'rest' ? { endsAt: now + 78_000, seconds: 90 } : null,
    clock: null,
    setsToSave: 2,
    exercises: [
      exercise('bench', 'Bench press', 82.5, 8, 2),
      exercise('row', 'Barbell row', 70, 10, 0),
      exercise('press', 'Overhead press', 45, 8, 0),
      exercise('pulldown', 'Lat pulldown', 62.5, 10, 0),
    ],
    applied: [],
    follows: true,
  };
}

const state = (seq: number, content: object) => ({ v: 1, seq, language: 'en', ...content });
const underWay = state(1, { ended: [], workout: workout(scene) });
/** The phone saved it: every set, two of them records. */
const saved = state(2, {
  ended: [{ id: WORKOUT_ID, saved: true, endedAt: now, setsSaved: 12, setCount: 12, records: 2 }],
  workout: null,
});

const sample =
  scene === 'summary'
    ? { states: [underWay, saved], averageBpm: 131, kcal: 412 }
    : { states: [underWay], bpm: scene === 'rest' ? 141 : 128 };

console.log(JSON.stringify(sample));
