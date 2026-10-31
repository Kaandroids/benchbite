import type { MealCard } from '@shared/coach/chat';

import { supabase } from '@/lib/supabase';
import { useDayEntries } from '@/nutrition/meals';
import { useDayTargets } from '@/nutrition/targets';
import { fireEvent, render, screen } from '@/test/render';

import { MealCardView } from './meal-card';
import type { MealCardState } from './meal-cards';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
jest.mock('@/nutrition/meals', () => ({
  ...jest.requireActual('@/nutrition/meals'),
  useDayEntries: jest.fn(),
}));
jest.mock('@/nutrition/targets', () => ({
  ...jest.requireActual('@/nutrition/targets'),
  useDayTargets: jest.fn(),
}));

const PIZZA = {
  name: 'Pizza Margherita',
  searchName: 'Pizza Margherita',
  grams: 150,
  confidence: 0.9,
  per100: { kcal: 266, proteinG: 11, carbsG: 33, fatG: 10 },
  estimated: false,
};
const SALAD = {
  name: 'Side salad',
  searchName: 'Salad, mixed',
  grams: 80,
  confidence: 0.6,
  per100: { kcal: 20, proteinG: 1, carbsG: 3, fatG: 0.2 },
  estimated: true,
};
const CARD: MealCard = { id: 51, day: '2026-10-30', meal: 'lunch', items: [PIZZA] };
const pending: MealCardState = { status: 'pending', kcal: null };

/** Lets the card's function answer with the card as `status`, or refuse with `code`. */
function answers(status: string | null, code?: string, kcal: number | null = 399) {
  jest.mocked(supabase.rpc).mockResolvedValue({
    data: status && { id: 51, status, kcal, food_ids: [] },
    error: code ? { code } : null,
  } as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useDayEntries).mockReturnValue({ data: [] } as never);
  jest.mocked(useDayTargets).mockReturnValue({ data: null } as never);
});

it('shows the meal, how sure Bite is, each food and the totals', async () => {
  await render(<MealCardView card={CARD} state={pending} />);

  expect(screen.getByRole('header')).toHaveTextContent('Lunch');
  expect(screen.getByText('Estimate · high confidence')).toBeOnTheScreen();
  expect(screen.getByLabelText('Pizza Margherita, 150 grams, 399 kcal')).toBeOnTheScreen();
  expect(screen.getByText('150 g · 399 kcal')).toBeOnTheScreen();
  expect(screen.getByLabelText('17 g Protein')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Add to lunch' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Edit' })).toBeOnTheScreen();
});

it('adds the meal and folds into a line with Undo, which undoes it', async () => {
  answers('logged');
  await render(<MealCardView card={CARD} state={pending} />);

  await fireEvent.press(screen.getByRole('button', { name: 'Add to lunch' }));

  // Grams as Bite gave them are not sent.
  expect(supabase.rpc).toHaveBeenCalledWith('log_coach_meal_card', { card_id: 51 });
  expect(await screen.findByText('Added to lunch · 399 kcal')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Add to lunch' })).not.toBeOnTheScreen();

  answers('undone');
  await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));

  expect(supabase.rpc).toHaveBeenLastCalledWith('undo_coach_meal_card', { card_id: 51 });
  expect(await screen.findByText('Undone')).toBeOnTheScreen();
  expect(screen.queryByRole('button')).not.toBeOnTheScreen();
});

it('changes the grams of the only food with Edit, and adds the meal with them', async () => {
  answers('logged', undefined, 266);
  await render(<MealCardView card={CARD} state={pending} />);

  await fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
  await fireEvent.changeText(screen.getByLabelText('Grams'), '100');
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

  expect(screen.getByText('100 g · 266 kcal')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Add to lunch' }));
  expect(supabase.rpc).toHaveBeenCalledWith('log_coach_meal_card', { card_id: 51, grams: [100] });
  expect(await screen.findByText('Added to lunch · 266 kcal')).toBeOnTheScreen();
});

it('lets each food of a meal of more than one be changed', async () => {
  await render(<MealCardView card={{ ...CARD, items: [PIZZA, SALAD] }} state={pending} />);

  await fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
  await fireEvent.press(screen.getByRole('button', { name: /^Side salad, 80 grams/ }));
  await fireEvent.changeText(screen.getByLabelText('Grams'), '40');
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

  expect(screen.getByRole('button', { name: /^Side salad, 40 grams, 8 kcal/ })).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
  expect(
    screen.getByLabelText('Side salad, 40 grams, 8 kcal, estimated, not found in the library'),
  ).toBeOnTheScreen();
});

it('shows a card added earlier as its line, with what it added', async () => {
  await render(<MealCardView card={CARD} state={{ status: 'logged', kcal: 412.5 }} />);

  expect(screen.getByText('Added to lunch · 413 kcal')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Undo' })).toBeOnTheScreen();
});

it('shows a card undone earlier as undone', async () => {
  await render(<MealCardView card={CARD} state={{ status: 'undone', kcal: 399 }} />);

  expect(screen.getByText('Undone')).toBeOnTheScreen();
  expect(screen.queryByRole('button')).not.toBeOnTheScreen();
});

it('no longer offers Undo once the meal changed since it was added', async () => {
  answers(null, 'BB035');
  await render(<MealCardView card={CARD} state={{ status: 'logged', kcal: 399 }} />);

  await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));

  expect(await screen.findByText('This changed since — ask Bite again')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeOnTheScreen();
  expect(screen.getByText('Added to lunch · 399 kcal')).toBeOnTheScreen();
});

it.each([
  ['BB036', 'This is out of date'],
  ['BB020', 'That day can no longer be changed'],
])('offers nothing for a meal refused with %s', async (code, line) => {
  answers(null, code);
  await render(<MealCardView card={CARD} state={pending} />);

  await fireEvent.press(screen.getByRole('button', { name: 'Add to lunch' }));

  expect(await screen.findByText(line)).toBeOnTheScreen();
  expect(screen.queryByRole('button')).not.toBeOnTheScreen();
});

it('offers Add again after a request that failed', async () => {
  jest.mocked(supabase.rpc).mockRejectedValue(new Error('Network request failed'));
  await render(<MealCardView card={CARD} state={pending} />);

  await fireEvent.press(screen.getByRole('button', { name: 'Add to lunch' }));

  expect(await screen.findByText("That didn't work. Try again.")).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Add to lunch' })).toBeOnTheScreen();
});

it('waits for where the card stands before it may be added', async () => {
  await render(<MealCardView card={CARD} waiting />);

  expect(screen.getByRole('button', { name: 'Add to lunch' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled();
});
