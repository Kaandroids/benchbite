import { useLocalSearchParams } from 'expo-router';

import { MealPhotoScreen } from '@/nutrition/meal-photo-screen';
import type { Meal } from '@/nutrition/meals';
import { photosParam } from '@/nutrition/meal-estimate';

export default function MealPhoto() {
  const { meal, day, photos } = useLocalSearchParams<{ meal: Meal; day: string; photos: string }>();
  return <MealPhotoScreen meal={meal} day={day} photos={photosParam.parse(photos)} />;
}
