import { supabase } from '@/lib/supabase';
import { act, createTestQueryClient, renderHook, waitFor } from '@/test/render';

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
  useKindLock,
  type CustomExerciseForm,
} from './custom';
import { removePhotos, uploadPhoto } from './photos';

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));
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
    // The end alone stays second.
    expect(supabase.rpc).toHaveBeenCalledWith('create_exercise', {
      exercise: expect.objectContaining({ imagePaths: [null, 'u/end.jpg'] }),
    });
  });

  it('leaves out a missing end', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({ data: 'custom-2', error: null } as never);
    const { result } = await renderHook(() => useCreateExercise(), {
      queryClient: createTestQueryClient(),
    });
    await act(async () => {
      await result.current.mutateAsync({ ...HIP, photos: ['start.jpg', null] });
    });
    expect(supabase.rpc).toHaveBeenCalledWith('create_exercise', {
      exercise: expect.objectContaining({ imagePaths: ['u/start.jpg'] }),
    });
  });

  it('removes the photos it uploaded when the save fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest
      .mocked(supabase.rpc)
      .mockResolvedValue({ data: null, error: new Error('offline') } as never);
    const { result } = await renderHook(() => useCreateExercise(), {
      queryClient: createTestQueryClient(),
    });
    await act(async () => {
      await expect(
        result.current.mutateAsync({ ...HIP, photos: ['start.jpg', 'end.jpg'] }),
      ).rejects.toThrow('offline');
    });
    expect(removePhotos).toHaveBeenCalledWith(['u/start.jpg', 'u/end.jpg']);
    warn.mockRestore();
  });

  it('removes the photos it uploaded when another upload fails', async () => {
    jest
      .mocked(uploadPhoto)
      .mockResolvedValueOnce('u/start.jpg')
      .mockRejectedValueOnce(new Error('offline'));
    const { result } = await renderHook(() => useCreateExercise(), {
      queryClient: createTestQueryClient(),
    });
    await act(async () => {
      await expect(
        result.current.mutateAsync({ ...HIP, photos: ['start.jpg', 'end.jpg'] }),
      ).rejects.toThrow('offline');
    });
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(removePhotos).toHaveBeenCalledWith(['u/start.jpg']);
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

describe('useKindLock', () => {
  const counts = (used: Record<string, number>) =>
    jest.mocked(supabase.from).mockImplementation(
      (table) =>
        ({
          select: () => ({ eq: () => Promise.resolve({ count: used[table] ?? 0, error: null }) }),
        }) as never,
    );
  const lock = async () => {
    const { result } = await renderHook(() => useKindLock('custom-1'), {
      queryClient: createTestQueryClient(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    return result.current.data;
  };

  it('locks what an exercise records once it is logged or a workout has it', async () => {
    counts({});
    expect(await lock()).toBeNull();
    counts({ workout_exercises: 1 });
    expect(await lock()).toBe('inWorkout');
    counts({ workout_exercises: 1, logged_sets: 3 });
    expect(await lock()).toBe('logged');
  });
});
