import { renderHook } from '@/test/render';
import type { WeekSession } from '@/workouts/workouts';

import { useReminderText } from './reminder-text';

const session = (name: string, exercises: number, estimatedMinutes: number): WeekSession => ({
  workoutId: 1,
  weekday: 4,
  name,
  type: null,
  exercises: Array.from({ length: exercises }, () => ({
    exerciseId: 'bench',
    primaryMuscles: [],
    imagePath: null,
    sets: 3,
    target: { reps: { min: 8, max: 12 } },
    restSeconds: 90,
  })),
  estimatedMinutes,
});

describe('useReminderText', () => {
  it("names a day's workout and its size", async () => {
    const { result } = await renderHook(() => useReminderText());
    expect(result.current({ date: '2026-10-22', sessions: [session('Push', 6, 45)] })).toEqual({
      date: '2026-10-22',
      title: 'Today: Push',
      body: "6 exercises, about 45 min. You've got this!",
    });
    expect(result.current({ date: '2026-10-22', sessions: [session('Plank', 1, 10)] }).body).toBe(
      "1 exercise, about 10 min. You've got this!",
    );
  });

  it('names every workout of a day with several, and how long they take in all', async () => {
    const { result } = await renderHook(() => useReminderText());
    expect(
      result.current({
        date: '2026-10-22',
        sessions: [session('Push', 6, 45), session('Cardio', 1, 30)],
      }),
    ).toEqual({
      date: '2026-10-22',
      title: 'Today: Push, Cardio',
      body: "2 workouts, about 75 min in all. You've got this!",
    });
  });

  it('counts no time for a workout without exercises yet, and says when none has any', async () => {
    const { result } = await renderHook(() => useReminderText());
    expect(result.current({ date: '2026-10-22', sessions: [session('Home', 0, 5)] }).body).toBe(
      'No exercises yet. Add some before you start.',
    );
    expect(
      result.current({
        date: '2026-10-22',
        sessions: [session('Push', 6, 45), session('Home', 0, 5)],
      }).body,
    ).toBe("2 workouts, about 45 min in all. You've got this!");
  });
});
