import { describeSet, parseTime, setKindOf } from './fields';

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
  it('describes each kind of set', () => {
    expect(
      describeSet({ ...values, weightKg: 80, reps: 8 }, setKindOf(['weight', 'reps'], reps)),
    ).toBe('80 kg × 8');
    expect(describeSet({ ...values, reps: 14 }, setKindOf(['reps'], reps))).toBe('— × 14');
    expect(describeSet({ ...values, seconds: 50 }, setKindOf(['duration'], time))).toBe('0:50');
    expect(
      describeSet(
        { ...values, meters: 2000, seconds: 492 },
        setKindOf(['distance', 'duration'], time),
      ),
    ).toBe('2000 m · 8:12');
  });
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
