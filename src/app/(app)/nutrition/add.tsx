import { useLocalSearchParams } from 'expo-router';

import { FoodSearchScreen } from '@/nutrition/food-search-screen';
import type { Meal } from '@/nutrition/meals';

export default function AddFood() {
  const { meal, day } = useLocalSearchParams<{ meal: Meal; day: string }>();
  return <FoodSearchScreen meal={meal} day={day} />;
}
