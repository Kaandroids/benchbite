import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { RoundIconButton } from '@/components/ui/round-icon-button';
import { Screen } from '@/components/ui/screen';
import { SearchField } from '@/components/ui/search-field';
import { useTheme } from '@/theme';

import { AddEntryError } from './add-entry-error';
import {
  quickAmountOf,
  useFoodSearch,
  useSettledQuery,
  refKey,
  type Amount,
  type FoodResult,
} from './foods';
import { useAddEntry } from './entries';
import { FoodRow, useRowLabels } from './food-row';
import type { Meal } from './meals';
import { useFavouriteKeys } from './quick-foods';
import { QuickFoods, type QuickFoodRow } from './quick-foods-view';
import { SearchResults } from './search-results';

type FoodSearchScreenProps = {
  meal: Meal;
  /** The day the food is added to, YYYY-MM-DD. */
  day: string;
};

/**
 * Finds a food to add to a meal. Before anything is typed it offers the meal's frequent foods,
 * the favourites and one's own foods (ADR 0037). A food opens the amount screen, or its + adds it
 * at once: a frequent food as it was logged last, others by their default portion. New food is
 * in the top bar, and Done at the bottom goes back to the day.
 */
export function FoodSearchScreen({ meal, day }: FoodSearchScreenProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const rowLabels = useRowLabels();
  const [query, setQuery] = useState('');
  const typed = query.trim();
  const term = useSettledQuery(typed);
  const search = useFoodSearch(term);
  const addEntry = useAddEntry();
  const favourites = useFavouriteKeys();
  // The foods added from here, which show a check instead of their +, and the ones being saved,
  // whose + waits so that a double tap does not add them twice.
  const [added, setAdded] = useState<string[]>([]);
  const [saving, setSaving] = useState<string[]>([]);

  // Handled per call: callbacks passed to mutate() run only for the latest one.
  const quickAdd = (food: FoodResult, amount: Amount) => {
    const key = refKey(food.ref);
    setSaving((current) => [...current, key]);
    addEntry
      .mutateAsync({ day, meal, food: food.ref, ...amount })
      .then(() => {
        setAdded((current) => [...current, key]);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        AccessibilityInfo.announceForAccessibility(
          t('nutrition.search.added', { name: food.name }),
        );
      })
      // The mutation's error is shown above the results.
      .catch(() => {})
      .finally(() => setSaving((current) => current.filter((id) => id !== key)));
  };

  const row = ({ food, index, amount = quickAmountOf(food), times }: QuickFoodRow) => {
    const key = refKey(food.ref);
    const { portion, detail } = rowLabels(food, amount);
    return (
      <FoodRow
        key={key}
        food={food}
        detail={
          times === undefined
            ? detail
            : `${detail} · ${t('nutrition.quick.times', { count: times })}`
        }
        addLabel={t('nutrition.search.quickAdd', { portion, name: food.name })}
        favourite={favourites.has(key)}
        added={added.includes(key)}
        adding={saving.includes(key)}
        first={index === 0}
        onOpen={() =>
          router.push({ pathname: '/nutrition/food/[id]', params: { id: key, meal, day } })
        }
        onAdd={() => quickAdd(food, amount)}
      />
    );
  };

  const body =
    typed.length === 0 ? (
      <QuickFoods meal={meal} day={day} renderRow={row} />
    ) : (
      <SearchResults
        typed={typed}
        term={term}
        search={search}
        hint={t('nutrition.search.hint')}
        renderRow={(food, index) => row({ food, index })}
      />
    );
  return (
    <Screen
      // Back, not close: what was added stays.
      onBack={() => router.back()}
      title={t(`nutrition.addTo.${meal}`)}
      action={
        // As wide as the back button, so that the title stays in the middle.
        <View style={styles.action}>
          <RoundIconButton
            icon="plus"
            color="primary"
            background="iconBackground"
            size={36}
            label={t('nutrition.food.create')}
            onPress={() =>
              router.push({ pathname: '/nutrition/new-food', params: { meal, day, name: typed } })
            }
          />
        </View>
      }
      // Foods are saved as they are added; Done ends the screen, where a screen's main button is,
      // so that nothing else there is taken for it.
      footer={<Button label={t('common.done')} onPress={() => router.back()} />}
      scrolls={false}
    >
      <View style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.sm, gap: spacing.sm }}>
        <SearchField
          label={t('nutrition.search.placeholder')}
          value={query}
          onChangeText={setQuery}
          autoFocus
          maxLength={50}
        />
        {addEntry.isError ? <AddEntryError error={addEntry.error} /> : null}
      </View>
      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  action: {
    width: 44,
    alignItems: 'center',
  },
});
