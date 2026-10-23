import { setKindOf } from './fields';
import { newRecords, oneRepMax, recordValues } from './records';

const weighted = setKindOf(['weight', 'reps'], { reps: { min: 8, max: 12 } });
const bodyweight = setKindOf(['reps'], { reps: { min: 8, max: 12 } });
const held = setKindOf(['duration'], { seconds: 45, meters: null });
const rowed = setKindOf(['distance', 'duration'], { seconds: null, meters: 2000 });

const lift = (weightKg: number | null, reps: number, done = true) => ({
  weightKg,
  reps,
  seconds: null,
  meters: null,
  done,
});
const hold = (seconds: number) => ({
  weightKg: null,
  reps: null,
  seconds,
  meters: null,
  done: true,
});

describe('oneRepMax', () => {
  it("estimates with Epley's formula, as the database does", () => {
    expect(oneRepMax(85, 7)).toBe(104.8);
    expect(oneRepMax(70, 10)).toBe(93.3);
    expect(oneRepMax(100, 1)).toBe(100);
  });
});

describe('recordValues', () => {
  it('follows what the exercise records', () => {
    expect(recordValues(lift(80, 8), weighted)).toEqual({
      heaviest: 80,
      one_rep_max: 101.3,
      best_set: 640,
      most_reps: 8,
    });
    expect(recordValues(lift(null, 20), bodyweight)).toEqual({ most_reps: 20 });
    expect(recordValues(lift(10, 12), bodyweight)).toEqual({ heaviest: 10, most_reps: 12 });
    expect(recordValues(hold(75), held)).toEqual({ longest_time: 75 });
    expect(recordValues({ weightKg: null, reps: null, seconds: 440, meters: 2000 }, rowed)).toEqual(
      { longest_distance: 2000, best_pace: 220 },
    );
  });
});

describe('newRecords', () => {
  const bests = { heaviest: 80, one_rep_max: 101.3, best_set: 640, most_reps: 10 };

  it('marks the done sets that beat the bests and every set before them', () => {
    const { bySet, records } = newRecords(
      [lift(80, 8), lift(85, 7), lift(85, 8), lift(90, 2, false)],
      weighted,
      bests,
    );
    expect(bySet).toEqual(
      new Map([
        [1, ['heaviest', 'one_rep_max']],
        [2, ['one_rep_max', 'best_set']],
      ]),
    );
    // The best of each kind, not every set that beat the old one.
    expect(records.map((record) => [record.kind, record.value])).toEqual([
      ['heaviest', 85],
      ['one_rep_max', 107.7],
      ['best_set', 680],
    ]);
  });

  it('does not count equalling a record', () => {
    expect(newRecords([lift(80, 8)], weighted, bests).records).toEqual([]);
  });

  it('notices nothing without bests, as for an exercise never logged', () => {
    expect(newRecords([lift(200, 20)], weighted, undefined).records).toEqual([]);
    expect(newRecords([lift(200, 20)], weighted, { most_reps: 10 }).records).toEqual([
      { kind: 'most_reps', value: 20, set: lift(200, 20) },
    ]);
  });

  it('counts the most time in a workout from all its done sets', () => {
    const { bySet, records } = newRecords([hold(60), hold(70)], held, {
      longest_time: 75,
      most_time: 120,
    });
    expect(bySet.size).toBe(0);
    expect(records).toEqual([
      {
        kind: 'most_time',
        value: 130,
        set: { weightKg: null, reps: null, seconds: 130, meters: null },
      },
    ]);
  });

  it('counts a lower pace as better', () => {
    const row = (seconds: number) => ({
      weightKg: null,
      reps: null,
      seconds,
      meters: 1000,
      done: true,
    });
    expect(
      newRecords([row(230), row(215)], rowed, { best_pace: 220, longest_distance: 2000 }).bySet,
    ).toEqual(new Map([[1, ['best_pace']]]));
  });
});
