import { useLocalSearchParams } from 'expo-router';

import { MealScreen } from '@/nutrition/meal-screen';
import type { Meal } from '@/nutrition/meals';

export default function MealEntries() {
  const { meal, day } = useLocalSearchParams<{ meal: Meal; day: string }>();
  return <MealScreen meal={meal} day={day} />;
}
