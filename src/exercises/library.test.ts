import i18n from '@/i18n';
import { supabase } from '@/lib/supabase';
import { act, renderHook, waitFor } from '@/test/render';

import { fetchLibrary, filterExercises, useExerciseLibrary, type LibraryExercise } from './library';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

const row = (id: string, name: string, more: object = {}) => ({
  id,
  name,
  metrics: ['weight', 'reps'],
  primary_muscles: ['chest'],
  secondary_muscles: [],
  equipment: 'barbell',
  level: 'beginner',
  category: 'strength',
  image_paths: [`${id}/0.webp`, `${id}/1.webp`],
  exercise_translations: [],
  ...more,
});

const order = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(supabase.from).mockReturnValue({ select: () => ({ order }) } as never);
});

afterEach(async () => {
  await act(() => i18n.changeLanguage('en'));
});

describe('fetchLibrary', () => {
  it('names the exercises in the language, falling back to English, sorted by that name', async () => {
    order.mockResolvedValue({
      data: [
        row('squat', 'Barbell Squat', {
          exercise_translations: [{ language: 'de', name: 'Kniebeuge' }],
        }),
        row('row', 'Barbell Row'),
      ],
      error: null,
    });
    const library = await fetchLibrary('de');
    expect(library.map((exercise) => [exercise.name, exercise.englishName])).toEqual([
      ['Barbell Row', 'Barbell Row'],
      ['Kniebeuge', 'Barbell Squat'],
    ]);
    expect(library[1]).toMatchObject({
      id: 'squat',
      metrics: ['weight', 'reps'],
      primaryMuscles: ['chest'],
      imagePaths: ['squat/0.webp', 'squat/1.webp'],
    });
  });

  it('fails with the error the database returns', async () => {
    const error = { code: '500', message: 'boom' };
    order.mockResolvedValue({ data: null, error });
    await expect(fetchLibrary('en')).rejects.toBe(error);
  });
});

describe('useExerciseLibrary', () => {
  it('loads the library in the app language', async () => {
    order.mockResolvedValue({ data: [row('squat', 'Barbell Squat')], error: null });
    const { result } = await renderHook(() => useExerciseLibrary());
    await waitFor(() => expect(result.current.data).toHaveLength(1));
  });
});

describe('filterExercises', () => {
  const exercise = (name: string, more: Partial<LibraryExercise> = {}): LibraryExercise => ({
    id: name,
    name,
    englishName: name,
    metrics: ['weight', 'reps'],
    primaryMuscles: ['chest'],
    secondaryMuscles: [],
    equipment: null,
    level: 'beginner',
    category: 'strength',
    imagePaths: [],
    ...more,
  });
  const library = [
    exercise('Bench Press'),
    exercise('Şınav', { englishName: 'Pushups' }),
    exercise('Lat Pulldown', { primaryMuscles: ['lats'] }),
    exercise('Rowing', { primaryMuscles: ['quadriceps'], category: 'cardio' }),
  ];
  const names = (query: string, filter: Parameters<typeof filterExercises>[2] = null) =>
    filterExercises(library, query, filter, 'tr').map((item) => item.name);

  it('finds every word of the query, ignoring case and accents', () => {
    expect(names('press bench')).toEqual(['Bench Press']);
    expect(names('sinav')).toEqual(['Şınav']);
  });

  it('finds exercises by their English name too', () => {
    expect(names('push')).toEqual(['Şınav']);
  });

  it('keeps the exercises of a muscle group, or cardio', () => {
    expect(names('', 'back')).toEqual(['Lat Pulldown']);
    expect(names('', 'cardio')).toEqual(['Rowing']);
  });

  it('keeps everything without a query or a filter', () => {
    expect(names('')).toHaveLength(4);
  });
});
