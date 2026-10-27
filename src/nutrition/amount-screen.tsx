import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { allLoaded, LoadState } from '@/components/load-state';
import { MessageView } from '@/components/ui/message-view';
import { PillButton } from '@/components/ui/pill-button';
import { Screen } from '@/components/ui/screen';
import { useNumberFormat } from '@/i18n/units';

import { AddEntryError } from './add-entry-error';
import { AmountForm } from './amount-form';
import { useAddEntry } from './entries';
import { useFood, type FoodRef } from './foods';
import { totalOf, useDayEntries, type Meal } from './meals';
import { useNutritionTargets } from './targets';

type AmountScreenProps = {
  food: FoodRef;
  /** The meal the food goes to: the one the search was opened for. */
  meal: Meal;
  /** YYYY-MM-DD. */
  day: string;
};

/** Picks how much of a food was eaten for a meal, showing what that adds to the day. */
export function AmountScreen({ food: ref, meal, day }: AmountScreenProps) {
  const { t } = useTranslation();
  const { format } = useNumberFormat();
  const food = useFood(ref);
  const addEntry = useAddEntry();
  const entries = useDayEntries(day);
  const targets = useNutritionTargets();
  const queries = [food, entries, targets];

  if (allLoaded(queries) && food.data) {
    return (
      <AmountForm
        // A fresh form when the food's portions change while it shows, such as after editing it,
        // so that it does not keep a portion that is gone or a count beyond the new maximum.
        key={food.data.portions.map(({ unit, grams }) => `${unit}:${grams}`).join()}
        title={food.data.name}
        subtitle={t('nutrition.amount.per100g', { calories: format(food.data.per100g.calories) })}
        action={
          // Only a food of one's own can be changed.
          ref.kind === 'custom' ? (
            <PillButton
              label={t('nutrition.food.editButton')}
              onPress={() =>
                router.push({
                  pathname: '/nutrition/edit-food/[id]',
                  params: { id: String(ref.id), meal, day },
                })
              }
            />
          ) : undefined
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
      />
    );
  }
  return (
    <Screen onBack={() => router.back()}>
      {food.data === null ? (
        <MessageView
          icon="meal"
          title={t('nutrition.foodNotFound.title')}
          message={t('nutrition.foodNotFound.message')}
        />
      ) : (
        <LoadState queries={queries} />
      )}
    </Screen>
  );
}
