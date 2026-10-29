import { renderHook } from '@/test/render';

import { useRecordFormat, useRecordGainFormat, useRecordKindLabel } from './records';

const set = { weightKg: 80, reps: 8, seconds: null, meters: null };

describe('useRecordFormat', () => {
  it("writes each kind of record's value with its unit", async () => {
    const { result } = await renderHook(() => useRecordFormat());
    const format = result.current;
    expect(format({ kind: 'heaviest', value: 82.5, set })).toBe('82.5 kg');
    expect(format({ kind: 'one_rep_max', value: 99.6, set })).toBe('100 kg');
    expect(format({ kind: 'best_set', value: 640, set })).toBe('80 kg × 8');
    expect(format({ kind: 'most_reps', value: 12, set })).toBe('12');
    expect(format({ kind: 'longest_time', value: 75, set })).toBe('1:15');
    expect(format({ kind: 'longest_distance', value: 400, set })).toBe('400 m');
    expect(format({ kind: 'best_pace', value: 220.4, set })).toBe('3:40 /km');
  });
});

describe('useRecordGainFormat', () => {
  it('writes how much a record beat the best before it', async () => {
    const { result } = await renderHook(() => useRecordGainFormat());
    const gain = result.current;
    expect(gain({ kind: 'heaviest', value: 82.5, previous: 80 })).toBe('+2.5 kg');
    expect(gain({ kind: 'one_rep_max', value: 99.2, previous: 98.7 })).toBe('+0.5 kg');
    // 80 kg × 8 over 85 kg × 7: more volume, though lighter.
    expect(gain({ kind: 'best_set', value: 640, previous: 595 })).toBe('+45 kg volume');
    expect(gain({ kind: 'most_reps', value: 12, previous: 10 })).toBe('+2');
    expect(gain({ kind: 'longest_time', value: 130, previous: 105 })).toBe('+0:25');
    expect(gain({ kind: 'longest_distance', value: 2500, previous: 2000 })).toBe('+500 m');
    // A lower pace is faster.
    expect(gain({ kind: 'best_pace', value: 220, previous: 240 })).toBe('−0:20 /km');
  });
});

describe('useRecordKindLabel', () => {
  it('names the heaviest of an exercise that adds weight as weight added', async () => {
    const { result } = await renderHook(() => useRecordKindLabel());
    expect(result.current('heaviest', false)).toBe('Heaviest');
    expect(result.current('heaviest', true)).toBe('Heaviest added');
    expect(result.current('one_rep_max', true)).toBe('Est. 1RM');
  });
});
