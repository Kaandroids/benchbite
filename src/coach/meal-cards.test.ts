import type { MealCard } from '@shared/coach/chat';

import { supabase } from '@/lib/supabase';
import { act, createTestQueryClient, renderHook, waitFor } from '@/test/render';

import { messageMealCards, useMealCardAction, useMealCardStates } from './meal-cards';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));

const CARD: MealCard = {
  id: 51,
  day: '2026-10-30',
  meal: 'lunch',
  items: [
    {
      name: 'Pizza',
      searchName: 'Pizza',
      grams: 150,
      confidence: 0.9,
      per100: { kcal: 266, proteinG: 11, carbsG: 33, fatG: 10 },
      estimated: true,
    },
  ],
};

/** Lets coach_meal_cards answer with `rows`. */
function cardRows(rows: { id: number; status: string; kcal: number | null }[]) {
  const inIds = jest.fn().mockResolvedValue({ data: rows, error: null });
  jest.mocked(supabase.from).mockReturnValue({ select: () => ({ in: inIds }) } as never);
  return inIds;
}

beforeEach(() => jest.clearAllMocks());

it("reads the cards out of a stored message's tool results, in order", () => {
  expect(
    messageMealCards([
      { type: 'toolResult', name: 'log_meal_card', result: { mealCard: CARD } },
      { type: 'toolResult', name: 'get_meal_log', result: { meals: [] } },
      { type: 'text', text: 'A pizza!' },
    ]),
  ).toEqual([CARD]);
  expect(messageMealCards(null)).toEqual([]);
});

it('reads where the cards stand in one request, and keeps what Add changed', async () => {
  const inIds = cardRows([
    { id: 51, status: 'pending', kcal: null },
    { id: 52, status: 'undone', kcal: 120 },
  ]);
  const queryClient = createTestQueryClient();
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
  const { result } = await renderHook(
    () => ({ states: useMealCardStates([52, 51]), act: useMealCardAction(CARD) }),
    { queryClient },
  );
  await waitFor(() => expect(result.current.states.isSuccess).toBe(true));
  expect(supabase.from).toHaveBeenCalledWith('coach_meal_cards');
  expect(inIds).toHaveBeenCalledTimes(1);
  expect(inIds).toHaveBeenCalledWith('id', [52, 51]);
  expect(result.current.states.data?.get(52)).toEqual({ status: 'undone', kcal: 120 });

  // As the database has it once logged, with an own food it saved.
  cardRows([
    { id: 51, status: 'logged', kcal: 399 },
    { id: 52, status: 'undone', kcal: 120 },
  ]);
  jest.mocked(supabase.rpc).mockResolvedValue({
    data: { id: 51, status: 'logged', kcal: 399, food_ids: [3] },
    error: null,
  } as never);
  await act(() => result.current.act.mutateAsync({ action: 'log', grams: [100] }));

  expect(supabase.rpc).toHaveBeenCalledWith('log_coach_meal_card', { card_id: 51, grams: [100] });
  await waitFor(() =>
    expect(result.current.states.data?.get(51)).toEqual({ status: 'logged', kcal: 399 }),
  );
  // The day's totals, as Today and Nutrition show them, and the foods load again.
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['meal-entries', '2026-10-30'] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['streak'] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['my-foods'] });
});

it('loads where the cards stand again when one was added elsewhere', async () => {
  jest.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { code: 'BB036' } } as never);
  const queryClient = createTestQueryClient();
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
  const { result } = await renderHook(() => useMealCardAction(CARD), { queryClient });

  await expect(act(() => result.current.mutateAsync({ action: 'undo' }))).rejects.toEqual({
    code: 'BB036',
  });

  expect(supabase.rpc).toHaveBeenCalledWith('undo_coach_meal_card', { card_id: 51 });
  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['coach-meal-cards'] }));
  expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['meal-entries', '2026-10-30'] });
});
