import { supabase } from '@/lib/supabase';
import { act, createTestQueryClient, renderHook } from '@/test/render';

import {
  emptyForm,
  formOf,
  isComplete,
  setCreatedExercise,
  takeCreatedExercise,
  toExercise,
  useArchiveExercise,
  useCreateExercise,
  useEditExercise,
  type CustomExerciseForm,
} from './custom';
import { removePhotos } from './photos';

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('./photos', () => ({
  isUserPhoto: (path: string) => path.startsWith('0000000a-'),
  uploadPhoto: jest.fn((uri: string) => Promise.resolve(`u/${uri}`)),
  removePhotos: jest.fn(() => Promise.resolve()),
}));

const HIP: CustomExerciseForm = {
  ...emptyForm(' Hip thrust '),
  logKind: 'weightReps',
  primaryMuscles: ['glutes'],
  secondaryMuscles: ['hamstrings', 'glutes'],
  equipment: 'machine',
  instructions: ['Sit on the bench. ', '  '],
};

beforeEach(() => jest.clearAllMocks());

describe('isComplete', () => {
  it('needs a name, a way of logging and a main muscle', () => {
    expect(isComplete(HIP)).toBe(true);
    expect(isComplete({ ...HIP, name: ' ' })).toBe(false);
    expect(isComplete({ ...HIP, logKind: null })).toBe(false);
    expect(isComplete({ ...HIP, primaryMuscles: [] })).toBe(false);
  });
});

describe('toExercise', () => {
  it('tidies the form as the database takes it', () => {
    expect(toExercise(HIP)).toEqual({
      name: 'Hip thrust',
      metrics: ['weight', 'reps'],
      primaryMuscles: ['glutes'],
      secondaryMuscles: ['hamstrings'],
      equipment: 'machine',
      level: 'beginner',
      instructions: ['Sit on the bench.'],
      imagePaths: [],
    });
    expect(toExercise({ ...HIP, logKind: 'distanceTime' }).metrics).toEqual([
      'distance',
      'duration',
    ]);
  });
});

describe('useCreateExercise', () => {
  it('uploads the photos first and names them in the exercise', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({ data: 'custom-2', error: null } as never);
    const { result } = await renderHook(() => useCreateExercise(), {
      queryClient: createTestQueryClient(),
    });
    await act(async () => {
      await result.current.mutateAsync({ ...HIP, photos: [null, 'end.jpg'] });
    });
    expect(supabase.rpc).toHaveBeenCalledWith('create_exercise', {
      exercise: expect.objectContaining({ imagePaths: ['u/end.jpg'] }),
    });
  });

  it('creates the exercise, loads the library again and gives it back as listed', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({ data: 'custom-1', error: null } as never);
    const queryClient = createTestQueryClient();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const { result } = await renderHook(() => useCreateExercise(), { queryClient });
    let created: Awaited<ReturnType<typeof result.current.mutateAsync>> | undefined;
    await act(async () => {
      created = await result.current.mutateAsync(HIP);
    });
    expect(supabase.rpc).toHaveBeenCalledWith('create_exercise', { exercise: toExercise(HIP) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['exercises'] });
    expect(created).toMatchObject({
      id: 'custom-1',
      name: 'Hip thrust',
      custom: true,
      archived: false,
      category: 'strength',
    });
  });
});

describe('the exercise just created', () => {
  it('is handed back once', () => {
    setCreatedExercise({ id: 'custom-1' } as never);
    expect(takeCreatedExercise()).toEqual({ id: 'custom-1' });
    expect(takeCreatedExercise()).toBeNull();
  });
});

const OLD = '0000000a-0000-0000-0000-000000000000/old.jpg';
const KEPT = '0000000a-0000-0000-0000-000000000000/kept.jpg';

describe('formOf', () => {
  it('fills the form with what an exercise has', () => {
    expect(
      formOf(
        {
          id: 'custom-1',
          name: 'Hip thrust',
          searchText: '',
          metrics: ['distance', 'duration'],
          primaryMuscles: ['glutes'],
          secondaryMuscles: [],
          equipment: null,
          level: 'expert',
          category: 'cardio',
          imagePaths: [OLD],
          custom: true,
          archived: false,
        },
        ['Drive up.'],
      ),
    ).toMatchObject({ logKind: 'distanceTime', level: 'expert', photos: [OLD, null] });
  });
});

describe('useEditExercise', () => {
  it('uploads new photos, keeps the ones it has and removes the dropped ones', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never);
    const { result } = await renderHook(() => useEditExercise('custom-1'), {
      queryClient: createTestQueryClient(),
    });
    await act(async () => {
      await result.current.mutateAsync({
        form: { ...HIP, photos: [KEPT, 'file://new.jpg'] },
        before: [OLD, KEPT],
      });
    });
    expect(supabase.rpc).toHaveBeenCalledWith('edit_exercise', {
      exercise_id: 'custom-1',
      exercise: expect.objectContaining({ imagePaths: [KEPT, 'u/file://new.jpg'] }),
    });
    expect(removePhotos).toHaveBeenCalledWith([OLD]);
  });
});

describe('useArchiveExercise', () => {
  it('archives an exercise or brings it back', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never);
    const { result } = await renderHook(() => useArchiveExercise('custom-1'), {
      queryClient: createTestQueryClient(),
    });
    await act(async () => {
      await result.current.mutateAsync(true);
    });
    expect(supabase.rpc).toHaveBeenCalledWith('archive_exercise', {
      exercise_id: 'custom-1',
      archived: true,
    });
  });
});
