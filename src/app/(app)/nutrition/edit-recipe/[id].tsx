import { useLocalSearchParams } from 'expo-router';

import type { Meal } from '@/nutrition/meals';
import { RecipeFormScreen } from '@/nutrition/recipe-form-screen';

export default function EditRecipe() {
  const { id, meal, day } = useLocalSearchParams<{ id: string; meal: Meal; day: string }>();
  return <RecipeFormScreen kind="edit" id={Number(id)} meal={meal} day={day} />;
}
