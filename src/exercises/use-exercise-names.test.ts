import i18n from '@/i18n';
import { supabase } from '@/lib/supabase';
import { act, renderHook, waitFor } from '@/test/render';

import { useExerciseNames } from './use-exercise-names';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

const EXERCISES = [
  {
    id: 'squat',
    name: 'Squat',
    exercise_translations: [{ language: 'de', name: 'Kniebeuge' }],
  },
  { id: 'row', name: 'Barbell row', exercise_translations: [] },
];

const select = jest.fn();
const where = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  where.mockResolvedValue({ data: EXERCISES, error: null });
  select.mockReturnValue({ in: where });
  jest.mocked(supabase.from).mockReturnValue({ select } as never);
});

afterEach(async () => {
  await act(() => i18n.changeLanguage('en'));
});

describe('useExerciseNames', () => {
  it('loads each exercise once and names them in English', async () => {
    const { result } = await renderHook(() => useExerciseNames(['squat', 'row', 'squat']));
    await waitFor(() => expect(result.current).toEqual({ squat: 'Squat', row: 'Barbell row' }));
    expect(supabase.from).toHaveBeenCalledWith('exercises');
    expect(where).toHaveBeenCalledWith('id', ['squat', 'row']);
  });

  it('uses the translation for the app language, falling back to English', async () => {
    await act(() => i18n.changeLanguage('de'));
    const { result } = await renderHook(() => useExerciseNames(['squat', 'row']));
    await waitFor(() => expect(result.current).toEqual({ squat: 'Kniebeuge', row: 'Barbell row' }));
  });

  it('does not load the same ids again when the list is new', async () => {
    const { rerender, result } = await renderHook(
      ({ ids }: { ids: string[] }) => useExerciseNames(ids),
      { initialProps: { ids: ['squat', 'row'] } },
    );
    await waitFor(() => expect(result.current).toHaveProperty('squat'));
    await rerender({ ids: ['squat', 'row'] });
    expect(where).toHaveBeenCalledTimes(1);
  });

  it('loads nothing without ids', async () => {
    const { result } = await renderHook(() => useExerciseNames([]));
    expect(supabase.from).not.toHaveBeenCalled();
    expect(result.current).toEqual({});
  });

  it('stays empty when loading fails', async () => {
    where.mockResolvedValue({ data: null, error: new Error('offline') });
    const { result } = await renderHook(() => useExerciseNames(['squat']));
    await waitFor(() => expect(where).toHaveBeenCalled());
    expect(result.current).toEqual({});
  });
});
