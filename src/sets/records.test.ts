import { renderHook } from '@/test/render';

import { useRecordFormat } from './records';

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
