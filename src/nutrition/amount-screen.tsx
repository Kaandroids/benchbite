import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { allLoaded } from '@/components/load-state';
import { Card } from '@/components/ui/card';
import { PillButton } from '@/components/ui/pill-button';
import { Text } from '@/components/ui/text';
import { useNumberFormat } from '@/i18n/units';
import { useTheme } from '@/theme';

import { AddEntryError } from './add-entry-error';
import { AmountForm } from './amount-form';
import { useAddEntry } from './entries';
import { FavouriteButton } from './favourite-star';
import { FoodLoadState } from './food-load-state';
import { useFood, type FoodRef } from './foods';
import { totalOf, useDayEntries, type Meal } from './meals';
import { usePortionLabel } from './portion-label';
import { useRecipe } from './recipes';
import { useNutritionTargets } from './targets';

/** What differs by the kind of food: the line under its name, and where it is edited, if at all. */
const KINDS = {
  library: { subtitle: 'nutrition.amount.per100g', edit: null },
  custom: { subtitle: 'nutrition.amount.per100g', edit: '/nutrition/edit-food/[id]' },
  recipe: { subtitle: 'nutrition.recipe.subtitle', edit: '/nutrition/edit-recipe/[id]' },
} as const;

type AmountScreenProps = {
  food: FoodRef;
  /** The meal the food goes to: the one the search was opened for. */
  meal: Meal;
  /** YYYY-MM-DD. */
  day: string;
};

/**
 * Picks how much of a food was eaten for a meal, showing what that adds to the day. The star in
 * the top bar keeps the food in the favourites. A recipe is picked by the serving, and shows what
 * is in it.
 */
export function AmountScreen({ food: ref, meal, day }: AmountScreenProps) {
  const { t } = useTranslation();
  const { format } = useNumberFormat();
  const { spacing } = useTheme();
  const food = useFood(ref);
  const addEntry = useAddEntry();
  const entries = useDayEntries(day);
  const targets = useNutritionTargets();
  const queries = [food, entries, targets];

  const kind = KINDS[ref.kind];

  if (allLoaded(queries) && food.data) {
    return (
      <AmountForm
        // A fresh form when the food's portions change while it shows, such as after editing it,
        // so that it does not keep a portion that is gone or a count beyond the new maximum.
        key={food.data.portions.map(({ unit, grams }) => `${unit}:${grams}`).join()}
        title={food.data.name}
        subtitle={t(kind.subtitle, { calories: format(food.data.per100g.calories) })}
        action={
          <View style={[styles.actions, { gap: spacing.xs }]}>
            <FavouriteButton food={ref} name={food.data.name} />
            {/* Only a food or recipe of one's own can be changed. */}
            {kind.edit ? (
              <PillButton
                label={t('nutrition.food.editButton')}
                onPress={() =>
                  router.push({
                    pathname: kind.edit,
                    params: { id: String(ref.id), meal, day },
                  })
                }
              />
            ) : null}
          </View>
        }
        per100g={food.data.per100g}
        portions={food.data.portions}
        eatenCalories={totalOf(entries.data ?? []).calories}
        targetCalories={targets.data?.calories ?? null}
        submitLabel={t(`nutrition.addTo.${meal}`)}
        submitting={addEntry.isPending}
        error={addEntry.isError ? <AddEntryError error={addEntry.error} /> : undefined}
        onSubmit={(amount) =>
          addEntry.mutate(
            { day, meal, food: ref, ...amount },
            { onSuccess: () => router.dismissTo('/nutrition') },
          )
        }
      >
        {ref.kind === 'recipe' ? <RecipeContents id={ref.id} /> : null}
      </AmountForm>
    );
  }
  return <FoodLoadState gone={food.data === null} queries={queries} />;
}

/** What a recipe is made of, and how many servings, under the amount of it. */
function RecipeContents({ id }: { id: number }) {
  const { t } = useTranslation();
  const { format } = useNumberFormat();
  const portionLabel = usePortionLabel();
  const recipe = useRecipe(id);
  if (!recipe.data) {
    return null;
  }
  const { servings, servingUnit, ingredients } = recipe.data;
  return (
    <Card>
      <Text variant="captionStrong" color="textMuted">
        {t('nutrition.recipe.inIt', { portion: portionLabel(servingUnit, servings) })}
      </Text>
      <Text variant="bodyStrong">
        {ingredients
          .map((ingredient) =>
            t('nutrition.recipe.ingredient', {
              name: ingredient.name,
              amount: t('nutrition.amount.inGrams', { grams: format(ingredient.grams) }),
            }),
          )
          .join(' · ')}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
