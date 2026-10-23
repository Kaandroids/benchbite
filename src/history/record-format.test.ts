import { setKindOf } from '@/sessions/fields';
import { renderHook } from '@/test/render';

import type { ProgressPoint } from './exercise-history';
import { metricsOf, pointsOf, scaleOf, useMetricFormat } from './record-format';

const target = { reps: { min: 8, max: 12 } };

describe('metricsOf', () => {
  it('follows what the exercise records', () => {
    expect(metricsOf(setKindOf(['weight', 'reps'], target))).toEqual([
      'heaviest',
      'oneRepMax',
      'volume',
    ]);
    expect(metricsOf(setKindOf(['reps'], target))).toEqual(['mostReps', 'totalReps']);
    expect(metricsOf(setKindOf(['duration'], target))).toEqual(['longest', 'totalTime']);
    expect(metricsOf(setKindOf(['distance', 'duration'], target))).toEqual(['distance', 'pace']);
  });
});

describe('pointsOf', () => {
  const point = (logId: number, heaviestKg: number | null): ProgressPoint => ({
    logId,
    startedAt: new Date(2026, 9, logId),
    heaviestKg,
    oneRepMaxKg: null,
    volumeKg: null,
    mostReps: 10,
    totalReps: 20,
    longestSeconds: null,
    totalSeconds: null,
    longestMeters: null,
    bestPace: null,
  });

  it('keeps the workouts with a value, oldest first', () => {
    expect(pointsOf([point(1, 70), point(2, null), point(3, 75)], 'heaviest')).toEqual([
      { date: new Date(2026, 9, 1), value: 70 },
      { date: new Date(2026, 9, 3), value: 75 },
    ]);
  });
});

describe('scaleOf', () => {
  it('steps counts by whole numbers and times by round times', () => {
    expect(scaleOf('heaviest')).toBe('decimal');
    expect(scaleOf('mostReps')).toBe('whole');
    expect(scaleOf('pace')).toBe('time');
  });
});

describe('useMetricFormat', () => {
  it('shows the estimated one-rep max in whole kilograms, as on the records', async () => {
    const { result } = await renderHook(() => useMetricFormat());
    expect(result.current.value('oneRepMax', 103.3)).toBe('103 kg');
    expect(result.current.value('heaviest', 72.5)).toBe('72.5 kg');
    expect(result.current.value('pace', 220)).toBe('3:40 /km');
    expect(result.current.tick('longest', 90)).toBe('1:30');
  });
});
