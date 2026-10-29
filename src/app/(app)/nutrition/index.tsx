import { useLocalSearchParams } from 'expo-router';

import { NutritionScreen } from '@/nutrition/nutrition-screen';

export default function NutritionTab() {
  // A day to open, as from the streak's break; `at` tells each time it is sent apart.
  const { day, at } = useLocalSearchParams<{ day?: string; at?: string }>();
  return <NutritionScreen open={day && at ? { day, at } : undefined} />;
}
