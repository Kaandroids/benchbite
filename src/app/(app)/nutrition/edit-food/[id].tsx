import { useLocalSearchParams } from 'expo-router';

import { FoodFormScreen } from '@/nutrition/food-form-screen';
import type { Meal } from '@/nutrition/meals';

export default function EditFood() {
  const { id, meal, day } = useLocalSearchParams<{ id: string; meal: Meal; day: string }>();
  return <FoodFormScreen kind="edit" id={Number(id)} meal={meal} day={day} />;
}
