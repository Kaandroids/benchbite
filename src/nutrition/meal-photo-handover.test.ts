import {
  handOverLoggedEstimate,
  handOverMealPhotos,
  mealPhotos,
  releaseMealPhotos,
  takeLoggedEstimate,
} from './meal-photo-handover';

describe('the meal photos handed to the photo screen', () => {
  it('are found by the key they were handed over with, until released', () => {
    const key = handOverMealPhotos(['file:///cache/a.jpg']);
    expect(mealPhotos(key)).toEqual(['file:///cache/a.jpg']);
    // A link cannot name photos the app did not take or choose.
    expect(mealPhotos('guessed')).toEqual([]);
    expect(mealPhotos(undefined)).toEqual([]);

    releaseMealPhotos(key);
    expect(mealPhotos(key)).toEqual([]);
  });
});

describe('the meal logged from photos', () => {
  const LOGGED = {
    meal: 'lunch' as const,
    day: '2026-10-30',
    entryIds: [1],
    foods: [],
    createdFoodIds: [],
    calories: 120,
  };

  it('goes to the add screen of its meal and day, once', () => {
    handOverLoggedEstimate(LOGGED);
    expect(takeLoggedEstimate('dinner', '2026-10-30')).toBeNull();
    expect(takeLoggedEstimate('lunch', '2026-10-30')).toEqual(LOGGED);
    expect(takeLoggedEstimate('lunch', '2026-10-30')).toBeNull();
  });
});
