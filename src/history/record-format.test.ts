import { setKindOf } from '@/sessions/fields';

import type { ProgressPoint } from './exercise-history';
import { metricsOf, pointsOf } from './record-format';

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
