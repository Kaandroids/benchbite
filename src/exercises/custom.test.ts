import { supabase } from '@/lib/supabase';
import { act, createTestQueryClient, renderHook } from '@/test/render';

import {
  emptyForm,
  isComplete,
  setCreatedExercise,
  takeCreatedExercise,
  toExercise,
  useCreateExercise,
  type CustomExerciseForm,
} from './custom';

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('./photos', () => ({
  uploadPhoto: jest.fn((uri: string) => Promise.resolve(`u/${uri}`)),
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
