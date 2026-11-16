import { describeSet, parseTime, setKindOf, weightStepOf } from './fields';

const reps = { reps: { min: 8, max: 12 } };
const time = { seconds: 45, meters: null };

describe('setKindOf', () => {
  it('logs weight and reps, the weight added for bodyweight exercises', () => {
    expect(setKindOf(['weight', 'reps'], reps)).toEqual({
      fields: ['weightKg', 'reps'],
      timed: false,
      addedWeight: false,
    });
    expect(setKindOf(['reps'], reps).addedWeight).toBe(true);
  });

  it('logs a time, or a distance and a time, with a clock', () => {
    expect(setKindOf(['duration'], time)).toEqual({
      fields: ['seconds'],
      timed: true,
      addedWeight: false,
    });
    expect(setKindOf(['distance', 'duration'], time).fields).toEqual(['meters', 'seconds']);
  });

  it('logs a distance alone, with a tick, for an exercise that records no time', () => {
    // A carry: the database takes no time for it (#625).
    expect(setKindOf(['weight', 'distance'], time)).toEqual({
      fields: ['meters'],
      timed: false,
      addedWeight: false,
    });
  });

  it('follows the target while the library is not loaded', () => {
    expect(setKindOf(undefined, reps).fields).toEqual(['weightKg', 'reps']);
    expect(setKindOf(undefined, { seconds: null, meters: 2000 }).fields).toEqual([
      'meters',
      'seconds',
    ]);
  });
});

describe('describeSet', () => {
  const values = { weightKg: null, reps: null, seconds: null, meters: null };
  // German numbers, so that the language's own is seen to be used.
  const words = {
    number: (value: number) => String(value).replace('.', ','),
    reps: (count: number) => `${count} Wdh.`,
  };
  const lifted = setKindOf(['weight', 'reps'], reps);
  it('describes each kind of set', () => {
    expect(describeSet({ ...values, weightKg: 77.5, reps: 8 }, lifted, words)).toBe('77,5 kg × 8');
    expect(describeSet({ ...values, seconds: 50 }, setKindOf(['duration'], time), words)).toBe(
      '0:50',
    );
    expect(
      describeSet(
        { ...values, meters: 2000, seconds: 492 },
        setKindOf(['distance', 'duration'], time),
        words,
      ),
    ).toBe('2000 m · 8:12');
  });

  it('leaves out a value the set does not have', () => {
    expect(describeSet({ ...values, reps: 14 }, setKindOf(['reps'], reps), words)).toBe('14 Wdh.');
    expect(describeSet({ ...values, weightKg: 80 }, lifted, words)).toBe('80 kg');
    expect(describeSet(values, lifted, words)).toBe('');
    expect(describeSet(values, setKindOf(['duration'], time), words)).toBe('');
  });
});

it('steps a weight as its equipment goes up', () => {
  expect(weightStepOf('dumbbell')).toBe(2);
  expect(weightStepOf('kettlebells')).toBe(4);
  expect(weightStepOf('barbell')).toBe(2.5);
  expect(weightStepOf(undefined)).toBe(2.5);
});

describe('parseTime', () => {
  it('reads minutes and seconds, or seconds', () => {
    expect(parseTime('1:30')).toBe(90);
    expect(parseTime(' 45 ')).toBe(45);
    expect(parseTime('90')).toBe(90);
    expect(parseTime('0:00')).toBeNull();
    expect(parseTime('abc')).toBeNull();
  });

  it('reads more than two digits as a clock', () => {
    expect(parseTime('130')).toBe(90);
    expect(parseTime('1111')).toBe(11 * 60 + 11);
    expect(parseTime('0045')).toBe(45);
  });

  it('reads at most a day', () => {
    expect(parseTime('9999999')).toBe(86_400);
    expect(parseTime('2000:00')).toBe(86_400);
  });
});
