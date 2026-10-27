import { useLocalSearchParams } from 'expo-router';

import { AmountScreen } from '@/nutrition/amount-screen';
import { refOf } from '@/nutrition/foods';
import type { Meal } from '@/nutrition/meals';

export default function FoodAmount() {
  const { id, meal, day } = useLocalSearchParams<{ id: string; meal: Meal; day: string }>();
  return <AmountScreen food={refOf(id)} meal={meal} day={day} />;
}
