import { router } from 'expo-router';

import { act, fireEvent, render, screen, waitFor } from '@/test/render';

import { useRemoveEntry, useUpdateEntry } from './entries';
import { EntryScreen } from './entry-screen';
import { useFood } from './foods';
import { useDayEntries, type LoggedEntry } from './meals';
import { takeRemovedEntry } from './removed-entry';
import { useNutritionTargets } from './targets';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
const mockIsFocused = jest.fn(() => true);
jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
  useNavigation: () => ({ isFocused: mockIsFocused }),
}));
jest.mock('./meals', () => ({ ...jest.requireActual('./meals'), useDayEntries: jest.fn() }));
jest.mock('./foods', () => ({ ...jest.requireActual('./foods'), useFood: jest.fn() }));
jest.mock('./targets', () => ({ useNutritionTargets: jest.fn() }));
jest.mock('./entries', () => ({
  ...jest.requireActual('./entries'),
  useUpdateEntry: jest.fn(),
  useRemoveEntry: jest.fn(),
}));

const loaded = <T,>(data: T) =>
  ({ data, isPending: false, isError: false, isFetching: false, refetch: jest.fn() }) as never;

const BANANA: LoggedEntry = {
  id: 5,
  day: '2026-10-27',
  meal: 'breakfast',
  foodId: 'F503100',
  name: 'Banana',
  grams: 180,
  portion: { unit: 'piece', count: 1.5 },
  // The values it was logged with, which differ from the library's now.
  per100g: { calories: 100, proteinG: 1, carbsG: 20, fatG: 0 },
  calories: 180,
  proteinG: 1.8,
  carbsG: 36,
  fatG: 0,
};

const update = jest.fn();
const remove = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockIsFocused.mockReturnValue(true);
  jest
    .mocked(useDayEntries)
    .mockReturnValue(loaded([BANANA, { ...BANANA, id: 6, calories: 500, name: 'Oat flakes' }]));
  jest.mocked(useFood).mockReturnValue(
    loaded({
      id: 'F503100',
      name: 'Banana',
      per100g: { calories: 97, proteinG: 1.2, carbsG: 20, fatG: 0.2 },
      portions: [{ unit: 'piece', grams: 120 }],
    }),
  );
  jest
    .mocked(useNutritionTargets)
    .mockReturnValue(loaded({ calories: 2320, proteinG: 180, carbsG: 256, fatG: 64 }));
  jest
    .mocked(useUpdateEntry)
    .mockReturnValue({ mutateAsync: update, isPending: false, isError: false } as never);
  jest
    .mocked(useRemoveEntry)
    .mockReturnValue({ mutateAsync: remove, isPending: false, isError: false } as never);
});

describe('EntryScreen', () => {
  it('starts from the entry, counted by the values it was logged with', async () => {
    await render(<EntryScreen id={5} day="2026-10-27" />);
    expect(screen.getByText('Banana')).toBeTruthy();
    expect(screen.getByText('In breakfast · 100 kcal per 100 g')).toBeTruthy();
    expect(screen.getByText('1.5')).toBeTruthy();
    expect(screen.getByText('180 kcal')).toBeTruthy();
    expect(screen.getByText('The day would be 680 of 2,320 kcal.')).toBeTruthy();
    expect(screen.getByText('Was 180 kcal. It stays in this meal.')).toBeTruthy();
  });

  it('saves a changed amount and goes back', async () => {
    update.mockResolvedValue(undefined);
    await render(<EntryScreen id={5} day="2026-10-27" />);
    await fireEvent.press(screen.getByLabelText('More'));
    await fireEvent.press(screen.getByText('Save'));
    expect(update).toHaveBeenCalledWith({
      id: 5,
      day: '2026-10-27',
      amount: { grams: 240, portion: { unit: 'piece', count: 2 } },
    });
    await waitFor(() => expect(router.back).toHaveBeenCalled());
  });

  it('removes the entry and hands it to the meal screen to undo', async () => {
    remove.mockResolvedValue(undefined);
    await render(<EntryScreen id={5} day="2026-10-27" />);
    await fireEvent.press(screen.getByLabelText('Remove this entry'));
    expect(remove).toHaveBeenCalledWith(BANANA);
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(takeRemovedEntry('breakfast', '2026-10-27')).toBe(BANANA);
  });

  it('does nothing more once the user went back while the removal ran', async () => {
    let finish = () => {};
    remove.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    await render(<EntryScreen id={5} day="2026-10-27" />);
    await fireEvent.press(screen.getByLabelText('Remove this entry'));
    mockIsFocused.mockReturnValue(false);
    await act(async () => finish());
    expect(router.back).not.toHaveBeenCalled();
    expect(takeRemovedEntry('breakfast', '2026-10-27')).toBeNull();
  });

  it('keeps grams only for a food taken out of the library', async () => {
    jest.mocked(useFood).mockReturnValue(loaded(null));
    await render(<EntryScreen id={5} day="2026-10-27" />);
    expect(screen.getByLabelText('Grams').props.value).toBe('180');
  });

  it('says when the entry is gone', async () => {
    await render(<EntryScreen id={99} day="2026-10-27" />);
    expect(screen.getByText('Entry not found')).toBeTruthy();
    expect(screen.queryByLabelText('Remove this entry')).toBeNull();
  });
});
