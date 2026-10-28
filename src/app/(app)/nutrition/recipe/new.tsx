import { useLocalSearchParams } from 'expo-router';

import type { Meal } from '@/nutrition/meals';
import { RecipeFormScreen } from '@/nutrition/recipe-form-screen';

export default function NewRecipe() {
  const { meal, day } = useLocalSearchParams<{ meal: Meal; day: string }>();
  return <RecipeFormScreen kind="new" meal={meal} day={day} />;
}
