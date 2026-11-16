import type { SetKind } from './fields';
import { missingFields, recordedValues } from './values';

describe('missingFields', () => {
  const values = { weightKg: null, reps: null, seconds: null, meters: null };

  it('needs the reps, and a weight unless it is added to the body', () => {
    const lifted = { fields: ['weightKg', 'reps'] as const, timed: false, addedWeight: false };
    expect(missingFields(values, { ...lifted, fields: [...lifted.fields] })).toEqual([
      'weightKg',
      'reps',
    ]);
    expect(
      missingFields(
        { ...values, reps: 10 },
        { ...lifted, fields: [...lifted.fields], addedWeight: true },
      ),
    ).toEqual([]);
  });

  it('needs a time or a distance', () => {
    const kind = {
      fields: ['meters' as const, 'seconds' as const],
      timed: true,
      addedWeight: false,
    };
    expect(missingFields(values, kind)).toEqual(['meters', 'seconds']);
    expect(missingFields({ ...values, meters: 2000 }, kind)).toEqual([]);
  });
});

describe('a carry, which records a distance and no time (#625)', () => {
  const carry: SetKind = { fields: ['meters'], timed: false, addedWeight: false };
  const values = { weightKg: null, reps: null, seconds: null, meters: null };

  it('needs its distance, which a time does not stand in for', () => {
    expect(missingFields({ ...values, seconds: 37 }, carry)).toEqual(['meters']);
    expect(missingFields({ ...values, meters: 50 }, carry)).toEqual([]);
  });

  it('keeps only the values it records', () => {
    expect(recordedValues({ ...values, seconds: 37, meters: 50 }, carry)).toEqual({
      ...values,
      meters: 50,
    });
  });
});
