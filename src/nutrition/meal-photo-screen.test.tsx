import { router } from 'expo-router';

import { useAiAccess } from '@/ai/access';
import { act, fireEvent, render, screen, within } from '@/test/render';

import { useLogEstimate } from './entries';
import { takeLoggedEstimate } from './logged-estimate';
import { EstimateFailure, estimateMeal, type EstimateItem } from './meal-estimate';
import { MealPhotoScreen } from './meal-photo-screen';
import { useDayEntries } from './meals';
import { useDayTargets } from './targets';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('@/ai/access', () => ({
  ...jest.requireActual('@/ai/access'),
  useAiAccess: jest.fn(),
}));
jest.mock('./meal-estimate', () => ({
  ...jest.requireActual('./meal-estimate'),
  estimateMeal: jest.fn(),
}));
jest.mock('./entries', () => ({ useLogEstimate: jest.fn() }));
jest.mock('./meals', () => ({ ...jest.requireActual('./meals'), useDayEntries: jest.fn() }));
jest.mock('./targets', () => ({ useDayTargets: jest.fn() }));

const EGGS: EstimateItem = {
  name: 'Scrambled eggs',
  searchName: 'Egg, scrambled',
  grams: 120,
  confidence: 0.8,
  food: { ref: { kind: 'library', id: 'E111200' }, name: 'Egg, scrambled' },
  per100: { kcal: 150, proteinG: 10, carbsG: 1, fatG: 11 },
  estimated: false,
};

const JUICE: EstimateItem = {
  name: 'Orange juice',
  searchName: 'Orange juice',
  grams: 200,
  confidence: 0.6,
  per100: { kcal: 45, proteinG: 0.7, carbsG: 10, fatG: 0.2 },
  estimated: true,
};

const mutate = jest.fn();

/** An estimate that waits until `answer` is called with what it gives. */
function pendingEstimate() {
  let answer: (value: unknown) => void = () => {};
  let fail: (error: unknown) => void = () => {};
  jest.mocked(estimateMeal).mockImplementationOnce(
    () =>
      new Promise((resolve, reject) => {
        answer = resolve as never;
        fail = reject;
      }),
  );
  return {
    answer: (value: unknown) => act(async () => answer(value)),
    fail: (error: unknown) => act(async () => fail(error)),
  };
}

async function showEstimate(items = [EGGS, JUICE]) {
  jest.mocked(estimateMeal).mockResolvedValueOnce({ isFood: true, items });
  await render(<MealPhotoScreen meal="breakfast" day="2026-10-30" photos={['file://a.jpg']} />);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(useLogEstimate)
    .mockReturnValue({ mutate, isPending: false, isError: false } as never);
  jest.mocked(useDayEntries).mockReturnValue({ data: [] } as never);
  jest.mocked(useDayTargets).mockReturnValue({ data: { calories: 2000 } } as never);
  jest.mocked(useAiAccess).mockReturnValue({ data: undefined } as never);
});

describe('MealPhotoScreen', () => {
  it('shows Bite looking at the photos, and cancels without logging', async () => {
    pendingEstimate();
    await render(
      <MealPhotoScreen
        meal="breakfast"
        day="2026-10-30"
        photos={['file://a.jpg', 'file://b.jpg']}
      />,
    );

    expect(screen.getByText('Breakfast from a photo')).toBeTruthy();
    expect(screen.getByText('Bite is looking at your meal…')).toBeTruthy();
    expect(screen.getByLabelText('Photo 2')).toBeTruthy();
    expect(estimateMeal).toHaveBeenCalledWith(
      { photos: ['file://a.jpg', 'file://b.jpg'], language: 'en', meal: 'breakfast' },
      expect.any(AbortSignal),
    );
    const signal = jest.mocked(estimateMeal).mock.calls[0]![1]!;

    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));

    expect(signal.aborted).toBe(true);
    expect(router.back).toHaveBeenCalled();
    expect(mutate).not.toHaveBeenCalled();
  });

  it('shows each food with its grams and calories, and the totals', async () => {
    await showEstimate();

    // Bite is fairly sure of the eggs, which are most of the calories, and less of the juice.
    expect(screen.getByText('Estimate · medium confidence')).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: 'Scrambled eggs, 120 grams, 180 kcal, change the amount',
      }),
    ).toBeTruthy();
    const juice = screen.getByRole('button', {
      name: 'Orange juice, 200 grams, 90 kcal, estimated, not found in the library, change the amount',
    });
    expect(within(juice).getByText('Estimated')).toBeTruthy();
    // 180 + 90 kcal; 12 + 1.4 g protein; 1.2 + 20 g carbs; 13.2 + 0.4 g fat.
    expect(screen.getByLabelText('270 kcal')).toBeTruthy();
    expect(screen.getByLabelText('13 g Protein')).toBeTruthy();
    expect(screen.getByLabelText('21 g Carbs')).toBeTruthy();
    expect(screen.getByLabelText('14 g Fat')).toBeTruthy();
  });

  it('changes the grams of a food in the amount form', async () => {
    await showEstimate();
    await fireEvent.press(screen.getByRole('button', { name: /^Scrambled eggs, 120 grams/ }));
    await fireEvent.changeText(screen.getByLabelText('Grams'), '60');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('button', { name: /^Scrambled eggs, 60 grams, 90 kcal/ })).toBeTruthy();
    expect(screen.getByLabelText('180 kcal')).toBeTruthy();
  });

  it('estimates again only once a note says what is off', async () => {
    await showEstimate();
    const again = screen.getByRole('button', { name: 'Estimate again' });
    expect(again).toBeDisabled();

    const pending = pendingEstimate();
    await fireEvent.changeText(screen.getByLabelText('Something off?'), ' Half the juice ');
    await fireEvent.press(screen.getByRole('button', { name: 'Estimate again' }));

    expect(estimateMeal).toHaveBeenLastCalledWith(
      {
        photos: ['file://a.jpg'],
        language: 'en',
        meal: 'breakfast',
        correction: {
          note: 'Half the juice',
          previous: [
            { name: 'Scrambled eggs', grams: 120 },
            { name: 'Orange juice', grams: 200 },
          ],
        },
      },
      expect.any(AbortSignal),
    );
    expect(screen.getByText('Bite is looking at your meal…')).toBeTruthy();
    await pending.answer({ isFood: true, items: [EGGS, { ...JUICE, grams: 100 }] });
    expect(screen.getByRole('button', { name: /^Orange juice, 100 grams/ })).toBeTruthy();
  });

  it('logs found foods by their reference and the rest by their search name', async () => {
    await showEstimate();
    await fireEvent.press(screen.getByRole('button', { name: 'Add to breakfast' }));

    expect(mutate).toHaveBeenCalledWith(
      {
        day: '2026-10-30',
        meal: 'breakfast',
        entries: [
          { food: { kind: 'library', id: 'E111200' }, grams: 120 },
          {
            name: 'Orange juice',
            grams: 200,
            per100g: { calories: 45, proteinG: 0.7, carbsG: 10, fatG: 0.2 },
          },
        ],
      },
      expect.anything(),
    );

    const logged = {
      day: '2026-10-30',
      entryIds: [1, 2],
      foods: [EGGS.food!.ref, { kind: 'custom', id: 9 }],
      createdFoodIds: [9],
    };
    await act(async () => mutate.mock.calls[0][1].onSuccess(logged));
    expect(router.back).toHaveBeenCalled();
    expect(takeLoggedEstimate('breakfast', '2026-10-30')).toEqual({
      ...logged,
      meal: 'breakfast',
      count: 2,
      calories: 270,
    });
  });

  it('says when the photos show no meal, and takes another one', async () => {
    jest.mocked(estimateMeal).mockResolvedValueOnce({
      isFood: false,
      items: [],
      note: 'Bite sees a laptop on a desk.',
    });
    await render(<MealPhotoScreen meal="lunch" day="2026-10-30" photos={['file://a.jpg']} />);

    expect(screen.getByText('This doesn’t look like a meal')).toBeTruthy();
    expect(
      screen.getByText(
        'Bite sees a laptop on a desk. Take a photo of the plate from above, with all of it in view.',
      ),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try another photo' }));
    expect(screen.getByText('Up to 3 photos of the same meal')).toBeTruthy();
  });

  it('offers to try again after a failure', async () => {
    const first = pendingEstimate();
    await render(<MealPhotoScreen meal="lunch" day="2026-10-30" photos={['file://a.jpg']} />);
    await first.fail(new EstimateFailure('unavailable'));

    expect(screen.getByText('Bite couldn’t look at your meal')).toBeTruthy();
    jest.mocked(estimateMeal).mockResolvedValueOnce({ isFood: true, items: [EGGS] });
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(estimateMeal).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Estimate · high confidence')).toBeTruthy();
  });

  it('tells why Bite cannot be used now, as the chat does', async () => {
    const first = pendingEstimate();
    await render(<MealPhotoScreen meal="lunch" day="2026-10-30" photos={['file://a.jpg']} />);
    await first.fail(new EstimateFailure('account_required'));

    expect(screen.getByText('Bite needs an account')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Create an account' }));
    expect(router.push).toHaveBeenCalledWith('/account/create');
  });
});
