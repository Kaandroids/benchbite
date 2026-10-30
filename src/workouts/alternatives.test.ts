import { supabase } from '@/lib/supabase';
import { act, createTestQueryClient, renderHook, waitFor } from '@/test/render';

import {
  alternativesKey,
  fetchAlternatives,
  useAddAlternative,
  useAlternativeError,
  useAlternativeName,
  useDeleteAlternative,
  useRenameAlternative,
  useReorderAlternatives,
  useSwitchAlternative,
  type WorkoutAlternative,
} from './alternatives';
import { WORKOUTS_KEY } from './workouts';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
jest.mock('@/i18n/dates', () => ({
  ...jest.requireActual<typeof import('@/i18n/dates')>('@/i18n/dates'),
  deviceToday: () => '2026-10-30',
}));

const order = jest.fn();
const eq = jest.fn(() => ({ order }));
const select = jest.fn(() => ({ eq }));

const alternative = (id: number, position: number, more: Partial<WorkoutAlternative> = {}) => ({
  id,
  position,
  name: null,
  inUse: false,
  exerciseCount: 2,
  ...more,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(supabase.from).mockReturnValue({ select } as never);
  jest.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never);
});

describe('fetchAlternatives', () => {
  it('returns the alternatives in order, counting the exercises of those not in use', async () => {
    order.mockResolvedValue({
      data: [
        { id: 3, position: 1, name: 'Gym', in_use: true, exercises: null },
        { id: 5, position: 2, name: null, in_use: false, exercises: [{}, {}, {}] },
      ],
      error: null,
    });
    await expect(fetchAlternatives(7)).resolves.toEqual([
      { id: 3, position: 1, name: 'Gym', inUse: true, exerciseCount: null },
      { id: 5, position: 2, name: null, inUse: false, exerciseCount: 3 },
    ]);
    expect(supabase.from).toHaveBeenCalledWith('workout_alternatives');
    expect(eq).toHaveBeenCalledWith('workout_id', 7);
    expect(order).toHaveBeenCalledWith('position');
  });

  it('throws what the database refused', async () => {
    const error = new Error('denied');
    order.mockResolvedValue({ data: null, error });
    await expect(fetchAlternatives(7)).rejects.toBe(error);
  });
});

it('names an unnamed alternative by its place', async () => {
  const { result } = await renderHook(() => useAlternativeName());
  expect(result.current({ name: null, position: 2 })).toBe('Alternative 2');
  expect(result.current({ name: 'Home', position: 2 })).toBe('Home');
});

it('tells the refusals apart, with the cap from the limits', async () => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(['workout-limits'], { alternatives: 5 });
  const { result } = await renderHook(() => useAlternativeError(), { queryClient });
  expect(result.current({ code: 'BB041' }, 'add')).toBe('A workout can have up to 5 alternatives.');
  expect(result.current({ code: 'BB042' }, 'delete')).toBe(
    "The one in use can't be deleted. Switch to another first.",
  );
  expect(result.current({ code: 'P0002' }, 'rename')).toBe('This alternative no longer exists.');
  expect(result.current(new Error('offline'), 'switch')).toBe(
    "We couldn't switch to it. Try again.",
  );
});

it('puts an alternative in use from today and loads the plan again', async () => {
  const queryClient = createTestQueryClient();
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
  const { result } = await renderHook(() => useSwitchAlternative(), { queryClient });
  await act(() => result.current.mutateAsync(5));
  expect(supabase.rpc).toHaveBeenCalledWith('use_workout_alternative', {
    alternative_id: 5,
    today: '2026-10-30',
  });
  // The workouts, which the alternatives are under, and the moves.
  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: WORKOUTS_KEY }));
  expect(alternativesKey(7).slice(0, WORKOUTS_KEY.length)).toEqual(WORKOUTS_KEY);
});

it('adds an unnamed copy of the one in use and gives its id', async () => {
  jest.mocked(supabase.rpc).mockResolvedValue({ data: 9, error: null } as never);
  const { result } = await renderHook(() => useAddAlternative(7));
  await expect(act(() => result.current.mutateAsync())).resolves.toBe(9);
  expect(supabase.rpc).toHaveBeenCalledWith('add_workout_alternative', {
    workout_id: 7,
    today: '2026-10-30',
  });
});

it('renames and deletes an alternative, and throws a refusal', async () => {
  const { result } = await renderHook(() => ({
    rename: useRenameAlternative(7),
    remove: useDeleteAlternative(7),
  }));
  await act(() => result.current.rename.mutateAsync({ id: 5, name: 'Home' }));
  expect(supabase.rpc).toHaveBeenCalledWith('rename_workout_alternative', {
    alternative_id: 5,
    name: 'Home',
  });

  const refused = { code: 'BB042' };
  jest.mocked(supabase.rpc).mockResolvedValue({ data: null, error: refused } as never);
  await expect(act(() => result.current.remove.mutateAsync(3))).rejects.toBe(refused);
  expect(supabase.rpc).toHaveBeenCalledWith('delete_workout_alternative', { alternative_id: 3 });
});

describe('useReorderAlternatives', () => {
  const list = [
    alternative(3, 1, { inUse: true, exerciseCount: null }),
    alternative(5, 2),
    alternative(6, 3),
  ];

  it('takes the new order at once and saves it', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(alternativesKey(7), list);
    let resolve: (value: unknown) => void = () => {};
    jest.mocked(supabase.rpc).mockReturnValue(new Promise((r) => (resolve = r)) as never);
    const { result } = await renderHook(() => useReorderAlternatives(7), { queryClient });
    await act(async () => {
      result.current.mutate([6, 3, 5]);
    });
    await waitFor(() =>
      expect(
        queryClient.getQueryData<WorkoutAlternative[]>(alternativesKey(7))?.map((a) => a.id),
      ).toEqual([6, 3, 5]),
    );
    expect(supabase.rpc).toHaveBeenCalledWith('reorder_workout_alternatives', {
      workout_id: 7,
      alternative_ids: [6, 3, 5],
    });
    await act(async () => resolve({ data: null, error: null }));
  });

  it('puts the order back when saving fails', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(alternativesKey(7), list);
    jest.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { code: '22023' } } as never);
    const { result } = await renderHook(() => useReorderAlternatives(7), { queryClient });
    await act(async () => {
      await result.current.mutateAsync([6, 3, 5]).catch(() => {});
    });
    expect(queryClient.getQueryData(alternativesKey(7))).toEqual(list);
  });

  it('keeps a later order while it waits, and loads the list again once it is saved', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(alternativesKey(7), list);
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const resolves: ((value: unknown) => void)[] = [];
    jest
      .mocked(supabase.rpc)
      .mockImplementation(() => new Promise((r) => resolves.push(r)) as never);
    const { result } = await renderHook(() => useReorderAlternatives(7), { queryClient });
    const ids = () =>
      queryClient.getQueryData<WorkoutAlternative[]>(alternativesKey(7))?.map((a) => a.id);
    await act(async () => {
      result.current.mutate([5, 3, 6]);
      result.current.mutate([5, 6, 3]);
    });
    await waitFor(() => expect(ids()).toEqual([5, 6, 3]));
    // The first fails while the second waits: the list keeps the second's order.
    await act(async () => resolves[0]?.({ data: null, error: { code: '22023' } }));
    await waitFor(() => expect(resolves).toHaveLength(2));
    expect(ids()).toEqual([5, 6, 3]);
    expect(invalidate).not.toHaveBeenCalled();
    await act(async () => resolves[1]?.({ data: null, error: null }));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: alternativesKey(7) }));
    expect(invalidate).toHaveBeenCalledTimes(1);
  });
});
