import type { LibraryExercise } from '@/exercises/library';
import { act, renderHook } from '@/test/render';

import {
  addExercises,
  clearDraft,
  defaultTarget,
  startDraft,
  updateDraft,
  useDraft,
} from './draft';

const exercise = (id: string, metrics: LibraryExercise['metrics']): LibraryExercise => ({
  id,
  name: id,
  searchText: id,
  metrics,
  primaryMuscles: [],
  secondaryMuscles: [],
  equipment: null,
  level: 'beginner',
  category: 'strength',
  imagePaths: [],
  custom: false,
  archived: false,
});

afterEach(() => clearDraft());

describe('defaultTarget', () => {
  it('starts with reps, a distance or a time, from what the exercise records', () => {
    expect(defaultTarget(['weight', 'reps'])).toEqual({ reps: { min: 8, max: 12 } });
    expect(defaultTarget(['distance', 'duration'])).toEqual({ seconds: null, meters: 1000 });
    expect(defaultTarget(['duration'])).toEqual({ seconds: 30, meters: null });
  });
});

describe('the draft', () => {
  it('is empty until a workout is edited', async () => {
    const { result } = await renderHook(() => useDraft());
    expect(result.current).toBeNull();
  });

  it('holds the workout with a key for each exercise', async () => {
    const { result } = await renderHook(() => useDraft());
    await act(() =>
      startDraft({
        id: 3,
        name: 'Arms',
        weekdays: [],
        exercises: [
          { exerciseId: 'curl', sets: 3, target: { reps: { min: 8, max: 12 } }, restSeconds: 60 },
          { exerciseId: 'curl', sets: 2, target: { reps: { min: 8, max: 12 } }, restSeconds: 60 },
        ],
      }),
    );
    expect(result.current?.name).toBe('Arms');
    const [first, second] = result.current?.exercises ?? [];
    expect(first?.key).not.toBe(second?.key);
  });

  it('adds exercises at the end with their defaults', async () => {
    const { result } = await renderHook(() => useDraft());
    await act(() => startDraft({ name: '', weekdays: [], exercises: [] }));
    await act(() =>
      addExercises([exercise('row', ['distance', 'duration']), exercise('plank', ['duration'])]),
    );
    expect(result.current?.exercises.map(({ key: _key, ...rest }) => rest)).toEqual([
      { exerciseId: 'row', sets: 1, target: { seconds: null, meters: 1000 }, restSeconds: 0 },
      { exerciseId: 'plank', sets: 3, target: { seconds: 30, meters: null }, restSeconds: 90 },
    ]);
  });

  it('changes and clears', async () => {
    const { result } = await renderHook(() => useDraft());
    await act(() => startDraft({ name: '', weekdays: [], exercises: [] }));
    await act(() => updateDraft((current) => ({ ...current, name: 'Legs' })));
    expect(result.current?.name).toBe('Legs');
    await act(() => clearDraft());
    expect(result.current).toBeNull();
  });
});
