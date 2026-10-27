import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { allLoaded, LoadState } from '@/components/load-state';
import { BackBar } from '@/components/ui/back-bar';
import { MessageView } from '@/components/ui/message-view';
import { useNumberFormat } from '@/i18n/units';
import { useTheme } from '@/theme';

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
  const { colors, spacing } = useTheme();
  const { format } = useNumberFormat();
  const food = useFood(ref);
  const addEntry = useAddEntry();
  const entries = useDayEntries(day);
  const targets = useNutritionTargets();
  const queries = [food, entries, targets];

  let content;
  if (food.data === null) {
    content = (
      <MessageView
        icon="meal"
        title={t('nutrition.amount.notFound.title')}
        message={t('nutrition.amount.notFound.message')}
      />
    );
  } else if (allLoaded(queries) && food.data) {
    content = (
      <AmountForm
        title={food.data.name}
        subtitle={t('nutrition.amount.per100g', { calories: format(food.data.per100g.calories) })}
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
  } else {
    content = (
      <View style={[styles.flex, { padding: spacing.xl }]}>
        <LoadState queries={queries} />
      </View>
    );
  }

  return (
    <SafeAreaView
      style={[styles.flex, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      <BackBar />
      {content}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});
