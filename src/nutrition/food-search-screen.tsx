import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Note } from '@/components/ui/note';
import { RoundIconButton } from '@/components/ui/round-icon-button';
import { Screen } from '@/components/ui/screen';
import { SearchField } from '@/components/ui/search-field';
import { Toast } from '@/components/ui/toast';
import { useNumberFormat } from '@/i18n/units';
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
import { useAddEntry, useUndoEstimate } from './entries';
import { FoodRow, useRowLabels } from './food-row';
import { takeLoggedEstimate, type HandedEstimate } from './logged-estimate';
import { photosParam } from './meal-estimate';
import { MealPhotoSheet } from './meal-photo-sheet';
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
 * in the top bar, the camera beside the search logs a meal from photos (#299), and Done at the
 * bottom goes back to the day.
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
  const { format } = useNumberFormat();
  const undoEstimate = useUndoEstimate();
  const [photoSheet, setPhotoSheet] = useState(false);
  // The meal logged last from photos, which the toast offers to undo.
  const [logged, setLogged] = useState<HandedEstimate | null>(null);

  // A meal logged on the photo screen comes back here, its foods shown as added.
  useFocusEffect(
    useCallback(() => {
      const estimate = takeLoggedEstimate(meal, day);
      if (estimate) {
        setLogged(estimate);
        setAdded((current) => [...current, ...estimate.foods.map(refKey)]);
      }
    }, [meal, day]),
  );
  const hideToast = useCallback(() => setLogged(null), []);

  const undo = (estimate: HandedEstimate) =>
    undoEstimate.mutate(estimate, {
      onSuccess: () => {
        // Each food once: one also added by hand keeps its check.
        const keys = estimate.foods.map(refKey);
        setAdded((current) =>
          current.filter((key) => {
            const index = keys.indexOf(key);
            if (index === -1) return true;
            keys.splice(index, 1);
            return false;
          }),
        );
      },
    });

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
      footer={
        <View style={{ gap: spacing.md }}>
          {logged ? (
            <Toast
              // A new toast for each meal, so that its time and announcement start again.
              key={logged.entryIds.join()}
              message={t('nutrition.photo.added', {
                count: logged.count,
                calories: format(logged.calories),
              })}
              action={{ label: t('nutrition.meal.undo'), onPress: () => undo(logged) }}
              onHide={hideToast}
            />
          ) : null}
          <Button label={t('common.done')} onPress={() => router.back()} />
        </View>
      }
      scrolls={false}
    >
      <View style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.sm, gap: spacing.sm }}>
        <View style={[styles.searchRow, { gap: spacing.sm }]}>
          <View style={styles.search}>
            <SearchField
              label={t('nutrition.search.placeholder')}
              value={query}
              onChangeText={setQuery}
              autoFocus
              maxLength={50}
            />
          </View>
          <RoundIconButton
            icon="camera"
            color="primary"
            background="iconBackground"
            size={48}
            label={t('nutrition.photo.camera')}
            onPress={() => setPhotoSheet(true)}
          />
        </View>
        {addEntry.isError ? <AddEntryError error={addEntry.error} /> : null}
        {undoEstimate.isError ? <Note tone="danger">{t('nutrition.photo.undoError')}</Note> : null}
      </View>
      {body}
      {photoSheet ? (
        <MealPhotoSheet
          onPick={(photos) =>
            router.push({
              pathname: '/nutrition/photo',
              params: { meal, day, photos: photosParam.format(photos) },
            })
          }
          onClose={() => setPhotoSheet(false)}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  search: {
    flex: 1,
  },
  action: {
    width: 44,
    alignItems: 'center',
  },
});
