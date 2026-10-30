import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { mealPhotos, releaseMealPhotos } from '@/nutrition/meal-photo-handover';
import { MealPhotoScreen } from '@/nutrition/meal-photo-screen';
import type { Meal } from '@/nutrition/meals';

export default function MealPhoto() {
  const {
    meal,
    day,
    photos: key,
  } = useLocalSearchParams<{
    meal: Meal;
    day: string;
    photos: string;
  }>();
  // The photos the add screen handed over by this key; a link's key finds none (ADR 0060).
  const [photos] = useState(() => mealPhotos(key));
  useEffect(() => () => releaseMealPhotos(key), [key]);
  if (photos.length === 0) {
    return <Redirect href="/nutrition" />;
  }
  return <MealPhotoScreen meal={meal} day={day} photos={photos} />;
}
