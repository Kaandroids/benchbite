import { router } from 'expo-router';

import { fireEvent, render, screen, waitFor } from '@/test/render';

import { useCreateFood, useDeleteFood, useUpdateFood } from './custom-foods';
import { FoodFormScreen } from './food-form-screen';
import { useFood } from './foods';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() },
}));
jest.mock('./foods', () => ({ ...jest.requireActual('./foods'), useFood: jest.fn() }));
jest.mock('./custom-foods', () => ({
  useCreateFood: jest.fn(),
  useUpdateFood: jest.fn(),
  useDeleteFood: jest.fn(),
}));

const create = jest.fn();
const update = jest.fn();
const remove = jest.fn();

const mutation = (mutateAsync: jest.Mock, state = {}) =>
  ({ mutateAsync, isPending: false, isError: false, error: null, ...state }) as never;

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useCreateFood).mockReturnValue(mutation(create));
  jest.mocked(useUpdateFood).mockReturnValue(mutation(update));
  jest.mocked(useDeleteFood).mockReturnValue(mutation(remove));
});

const save = () => screen.getByRole('button', { name: 'Save' });

async function fillIn(values: Record<string, string>) {
  for (const [label, text] of Object.entries(values)) {
    await fireEvent.changeText(screen.getByLabelText(label), text);
  }
}

describe('FoodFormScreen, a new food', () => {
  it('starts from the search, and saves only once every value is in', async () => {
    await render(<FoodFormScreen kind="new" meal="snack" day="2026-10-27" name="protein yog" />);
    expect(screen.getByLabelText('Name').props.value).toBe('protein yog');
    expect(save()).toBeDisabled();

    await fillIn({ Calories: '70', Protein: '10', Carbs: '6,5' });
    expect(save()).toBeDisabled();
    await fillIn({ Fat: '0.3' });
    expect(save()).toBeEnabled();
    expect(screen.getByText('Matches the calories you entered.')).toBeTruthy();
  });

  it('saves the food and opens it to log an amount', async () => {
    create.mockResolvedValue(12);
    await render(<FoodFormScreen kind="new" meal="snack" day="2026-10-27" />);
    await fillIn({
      Name: 'Protein yoghurt',
      Calories: '70',
      Protein: '10',
      Carbs: '6.5',
      Fat: '0.3',
    });
    await fireEvent.press(save());
    expect(create).toHaveBeenCalledWith({
      name: 'Protein yoghurt',
      per100g: { calories: 70, proteinG: 10, carbsG: 6.5, fatG: 0.3 },
      portion: null,
    });
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        pathname: '/nutrition/food/[id]',
        params: { id: 'custom-12', meal: 'snack', day: '2026-10-27' },
      }),
    );
  });

  it('takes a portion: a unit picked from a list, and the grams typed in', async () => {
    create.mockResolvedValue(12);
    await render(<FoodFormScreen kind="new" meal="snack" day="2026-10-27" />);
    await fillIn({
      Name: 'Protein yoghurt',
      Calories: '70',
      Protein: '10',
      Carbs: '6.5',
      Fat: '0.3',
    });
    expect(screen.getByLabelText('Grams in Choose')).not.toBeEnabled();

    await fireEvent.press(screen.getByLabelText('Unit of a portion: Choose'));
    expect(screen.getByText('What is one portion?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Cup'));
    await fillIn({ 'Grams in 1 cup': '200' });
    expect(screen.getByText('1 cup adds 140 kcal · P 20 · C 13 · F 0.6')).toBeTruthy();

    await fireEvent.press(save());
    expect(create).toHaveBeenCalledWith({
      name: 'Protein yoghurt',
      per100g: { calories: 70, proteinG: 10, carbsG: 6.5, fatG: 0.3 },
      portion: { unit: 'cup', grams: 200 },
    });
  });

  it('leaves the portion out again', async () => {
    await render(<FoodFormScreen kind="new" meal="snack" day="2026-10-27" />);
    await fireEvent.press(screen.getByLabelText('Unit of a portion: Choose'));
    await fireEvent.press(screen.getByText('Cup'));
    await fireEvent.press(screen.getByLabelText('Unit of a portion: Cup'));
    await fireEvent.press(screen.getByText('No portion, grams only'));
    expect(screen.getByLabelText('Unit of a portion: Choose')).toBeTruthy();
  });

  it('says when the values cannot be right, or the macros do not add up', async () => {
    await render(<FoodFormScreen kind="new" meal="snack" day="2026-10-27" />);
    await fillIn({ Name: 'Odd', Calories: '400', Protein: '60', Carbs: '50', Fat: '1' });
    expect(
      screen.getByText(
        'Per 100 g, protein, carbs and fat add up to more than 100 g. Check the values.',
      ),
    ).toBeTruthy();
    expect(save()).toBeDisabled();
    await fillIn({ Protein: '1', Carbs: '1' });
    expect(
      screen.getByText(
        'Protein, carbs and fat make 17 kcal, but you entered 400 kcal. Check the values against the label.',
      ),
    ).toBeTruthy();
  });

  it('says when a food with the name exists', async () => {
    jest
      .mocked(useCreateFood)
      .mockReturnValue(mutation(create, { isError: true, error: { code: '23505' } }));
    await render(<FoodFormScreen kind="new" meal="snack" day="2026-10-27" />);
    expect(screen.getByText('You already have a food with this name.')).toBeTruthy();
  });
});

describe('FoodFormScreen, a food of one’s own', () => {
  beforeEach(() => {
    jest.mocked(useFood).mockReturnValue({
      data: {
        ref: { kind: 'custom', id: 12 },
        name: 'Protein yoghurt',
        per100g: { calories: 70, proteinG: 10, carbsG: 6.5, fatG: 0.3 },
        portions: [{ unit: 'serving', grams: 200 }],
      },
      isPending: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
    } as never);
  });

  it('changes the food and goes back', async () => {
    update.mockResolvedValue(undefined);
    await render(<FoodFormScreen kind="edit" id={12} meal="snack" day="2026-10-27" />);
    expect(screen.getByText('Edit food')).toBeTruthy();
    await fillIn({ Calories: '72' });
    await fireEvent.press(save());
    expect(update).toHaveBeenCalledWith({
      id: 12,
      values: {
        name: 'Protein yoghurt',
        per100g: { calories: 72, proteinG: 10, carbsG: 6.5, fatG: 0.3 },
        portion: { unit: 'serving', grams: 200 },
      },
    });
    await waitFor(() => expect(router.back).toHaveBeenCalled());
  });

  it('deletes the food and goes back to the search', async () => {
    remove.mockResolvedValue(undefined);
    await render(<FoodFormScreen kind="edit" id={12} meal="snack" day="2026-10-27" />);
    await fireEvent.press(screen.getByText('Delete food'));
    expect(remove).toHaveBeenCalledWith(12);
    await waitFor(() =>
      expect(router.dismissTo).toHaveBeenCalledWith({
        pathname: '/nutrition/add',
        params: { meal: 'snack', day: '2026-10-27' },
      }),
    );
  });
});
