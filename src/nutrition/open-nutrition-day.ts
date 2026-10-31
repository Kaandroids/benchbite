import { router } from 'expo-router';

/** Opens the Nutrition tab on a day, given as YYYY-MM-DD. */
export function openNutritionDay(day: string) {
  // A new navigation each time, so that Nutrition opens on the day even if it shows another or
  // was opened on the same day before.
  router.navigate({ pathname: '/nutrition', params: { day, at: String(Date.now()) } });
}
