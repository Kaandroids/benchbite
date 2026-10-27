import { useLocalSearchParams } from 'expo-router';

import { AmountScreen } from '@/nutrition/amount-screen';
import type { Meal } from '@/nutrition/meals';

export default function FoodAmount() {
  const { id, meal, day } = useLocalSearchParams<{ id: string; meal: Meal; day: string }>();
  return <AmountScreen foodId={id} meal={meal} day={day} />;
}
