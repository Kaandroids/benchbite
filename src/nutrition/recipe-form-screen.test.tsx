import { router } from 'expo-router';

import { fireEvent, render, screen, waitFor } from '@/test/render';

import { useFood, useFoodSearch, type Food, type FoodResult } from './foods';
import { RecipeFormScreen } from './recipe-form-screen';
import { useDeleteRecipe, useRecipe, useSaveRecipe, type Ingredient, type Recipe } from './recipes';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() },
}));
jest.mock('./foods', () => ({
  ...jest.requireActual('./foods'),
  useFood: jest.fn(),
  useFoodSearch: jest.fn(),
  // Typing settles at once here.
  useSettledQuery: (query: string) => query,
}));
jest.mock('./recipes', () => ({
  ...jest.requireActual('./recipes'),
  useRecipe: jest.fn(),
  useSaveRecipe: jest.fn(),
  useDeleteRecipe: jest.fn(),
}));

const LENTILS: FoodResult = {
  ref: { kind: 'library', id: 'H801000' },
  name: 'Red lentils, dry',
  per100g: { calories: 337, proteinG: 24, carbsG: 50, fatG: 1.5 },
  portion: { unit: 'cup', grams: 200 },
};

const ONION: Food = {
  ref: { kind: 'library', id: 'G480000' },
  name: 'Onion',
  per100g: { calories: 28, proteinG: 1.2, carbsG: 5, fatG: 0.2 },
  portions: [{ unit: 'piece', grams: 110 }],
};

const SOUP: FoodResult = {
  ref: { kind: 'recipe', id: 9 },
  name: 'Lentil soup',
  per100g: { calories: 68, proteinG: 4, carbsG: 9, fatG: 1.5 },
  portion: { unit: 'bowl', grams: 400 },
};

const save = jest.fn();
const remove = jest.fn();

const mutation = (mutateAsync: jest.Mock, state = {}) =>
  ({ mutateAsync, isPending: false, isError: false, error: null, ...state }) as never;

const loaded = <T,>(data: T) =>
  ({ data, isPending: false, isError: false, isFetching: false, refetch: jest.fn() }) as never;

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useSaveRecipe).mockReturnValue(mutation(save));
  jest.mocked(useDeleteRecipe).mockReturnValue(mutation(remove));
  jest.mocked(useFoodSearch).mockReturnValue({
    data: [LENTILS, SOUP],
    isError: false,
    isFetching: false,
    isPlaceholderData: false,
  } as never);
  jest.mocked(useFood).mockReturnValue(loaded(ONION));
});

const saveButton = () => screen.getByRole('button', { name: 'Save recipe' });

async function searchFor(text: string) {
  await fireEvent.press(screen.getByRole('button', { name: 'Add ingredient' }));
  await fireEvent.changeText(screen.getByLabelText('Search foods'), text);
}

describe('RecipeFormScreen, new', () => {
  it('saves a recipe from its ingredients and servings, then opens it to log a serving', async () => {
    save.mockResolvedValue(3);
    await render(<RecipeFormScreen kind="new" meal="lunch" day="2026-10-28" />);
    expect(saveButton()).toBeDisabled();

    await fireEvent.changeText(screen.getByLabelText('Name'), ' Lentil soup ');
    await searchFor('lent');
    // Recipes are not offered as ingredients.
    expect(screen.queryByText('Lentil soup')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Add 1 cup of Red lentils, dry'));
    expect(screen.queryByLabelText('Add 1 cup of Red lentils, dry')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));

    expect(screen.getByText('INGREDIENTS · 1')).toBeTruthy();
    expect(screen.getByText('1 cup · 200 g')).toBeTruthy();
    // 674 kcal in 4 bowls of 50 g.
    expect(screen.getByText('1 bowl: 169 kcal · 50 g · P 12 · C 25 · F 0.8')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Fewer servings' }));
    expect(screen.getByText('1 bowl: 225 kcal · 67 g · P 16 · C 33.3 · F 1')).toBeTruthy();

    await fireEvent.press(saveButton());
    expect(save).toHaveBeenCalledWith({
      values: {
        name: 'Lentil soup',
        servings: 3,
        servingUnit: 'bowl',
        ingredients: [
          {
            food: LENTILS.ref,
            name: 'Red lentils, dry',
            per100g: LENTILS.per100g,
            grams: 200,
            portion: { unit: 'cup', count: 1 },
          },
        ],
      },
    });
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        pathname: '/nutrition/food/[id]',
        params: { id: 'recipe-3', meal: 'lunch', day: '2026-10-28' },
      }),
    );
  });

  it('adds an amount picked for a food, and changes or removes an ingredient', async () => {
    await render(<RecipeFormScreen kind="new" meal="lunch" day="2026-10-28" />);
    await searchFor('onio');
    await fireEvent.press(screen.getByText('Red lentils, dry'));
    // The amount of the food opens; useFood gives the onion here.
    await fireEvent.press(screen.getByRole('button', { name: 'More' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Add to recipe' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByText('1.5 pieces · 165 g')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Change the amount of Onion' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Less' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('1 piece · 110 g')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Remove Onion' }));
    expect(screen.getByText('INGREDIENTS · 0')).toBeTruthy();
  });

  it('says when a serving weighs more than an entry holds, and keeps Save off', async () => {
    const pot = (id: string, name: string): FoodResult => ({
      ...LENTILS,
      ref: { kind: 'library', id },
      name,
      portion: { unit: 'cup', grams: 3000 },
    });
    jest.mocked(useFoodSearch).mockReturnValue({
      data: [pot('A', 'Beans'), pot('B', 'Tomatoes')],
      isError: false,
      isFetching: false,
      isPlaceholderData: false,
    } as never);
    await render(<RecipeFormScreen kind="new" meal="lunch" day="2026-10-28" />);
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Chili');
    await searchFor('pot');
    await fireEvent.press(screen.getByLabelText('Add 1 cup of Beans'));
    await fireEvent.press(screen.getByLabelText('Add 1 cup of Tomatoes'));
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    for (let servings = 4; servings > 1; servings -= 1) {
      await fireEvent.press(screen.getByRole('button', { name: 'Fewer servings' }));
    }
    expect(
      screen.getByText(
        'One serving weighs 6,000 g, more than the 5,000 g an entry holds. Make more servings.',
      ),
    ).toBeTruthy();
    expect(saveButton()).toBeDisabled();
  });

  it('says when the name is taken', async () => {
    jest
      .mocked(useSaveRecipe)
      .mockReturnValue(mutation(save, { isError: true, error: { code: '23505' } }));
    await render(<RecipeFormScreen kind="new" meal="lunch" day="2026-10-28" />);
    expect(screen.getByText('You already have a recipe with this name.')).toBeTruthy();
  });
});

describe('RecipeFormScreen, edit', () => {
  const ingredient: Ingredient = {
    food: { kind: 'library', id: 'H801000' },
    name: 'Red lentils, dry',
    per100g: LENTILS.per100g,
    grams: 250,
    portion: null,
  };
  const recipe: Recipe = {
    id: 9,
    name: 'Lentil soup',
    servings: 4,
    servingUnit: 'bowl',
    ingredients: [ingredient],
  };

  it('changes a recipe and goes back', async () => {
    save.mockResolvedValue(9);
    jest.mocked(useRecipe).mockReturnValue(loaded(recipe));
    await render(<RecipeFormScreen kind="edit" id={9} meal="lunch" day="2026-10-28" />);
    expect(screen.getByDisplayValue('Lentil soup')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'More servings' }));
    await fireEvent.press(saveButton());
    expect(save).toHaveBeenCalledWith({ id: 9, values: { ...recipe, servings: 5 } });
    await waitFor(() => expect(router.back).toHaveBeenCalled());
  });

  it('deletes a recipe and goes back to the add screen', async () => {
    remove.mockResolvedValue(undefined);
    jest.mocked(useRecipe).mockReturnValue(loaded(recipe));
    await render(<RecipeFormScreen kind="edit" id={9} meal="lunch" day="2026-10-28" />);
    await fireEvent.press(screen.getByRole('button', { name: 'Delete recipe' }));
    expect(remove).toHaveBeenCalledWith(9);
    await waitFor(() =>
      expect(router.dismissTo).toHaveBeenCalledWith({
        pathname: '/nutrition/add',
        params: { meal: 'lunch', day: '2026-10-28' },
      }),
    );
  });
});
