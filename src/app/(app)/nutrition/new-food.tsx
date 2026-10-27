import { useLocalSearchParams } from 'expo-router';

import { FoodFormScreen } from '@/nutrition/food-form-screen';
import type { Meal } from '@/nutrition/meals';

export default function NewFood() {
  const { meal, day, name } = useLocalSearchParams<{ meal: Meal; day: string; name?: string }>();
  return <FoodFormScreen kind="new" meal={meal} day={day} name={name} />;
}
