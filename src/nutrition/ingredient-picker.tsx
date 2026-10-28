import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, FlatList, Modal, StyleSheet, View } from 'react-native';

import { allLoaded } from '@/components/load-state';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Note } from '@/components/ui/note';
import { Screen } from '@/components/ui/screen';
import { SearchField } from '@/components/ui/search-field';
import { useNumberFormat } from '@/i18n/units';
import { useTheme } from '@/theme';

import { AmountForm } from './amount-form';
import { FoodLoadState } from './food-load-state';
import { FoodRow, useRowLabels } from './food-row';
import {
  quickAmountOf,
  refKey,
  useFood,
  useFoodSearch,
  useSettledQuery,
  type Amount,
  type FoodResult,
} from './foods';
import { useFavouriteFoods, useMyFoods } from './quick-foods';
import { EmptyList } from './quick-foods-view';
import type { Ingredient } from './recipes';
import { SearchResults } from './search-results';

type IngredientPickerProps = {
  /** The recipe's name, in the title, or empty while it has none. */
  recipeName: string;
  /** An ingredient to change the amount of, rather than finding new ones. */
  changing?: Ingredient;
  /** Whether the recipe holds as many ingredients as it may, so that no more go in. */
  full: boolean;
  onPick: (ingredient: Ingredient) => void;
  onClose: () => void;
};

/**
 * Finds foods to put in a recipe, in a screen of its own over the form: before anything is typed
 * the favourites and one's own foods, then search. + adds a food's default portion, and a food
 * opens its amount. Recipes are not offered, as a recipe holds foods only. With `changing`, it
 * opens at that ingredient's amount.
 */
export function IngredientPicker({
  recipeName,
  changing,
  full,
  onPick,
  onClose,
}: IngredientPickerProps) {
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      {changing ? (
        <IngredientAmount
          food={changing.food}
          initial={changing}
          submitLabel="saveAmount"
          onBack={onClose}
          onPick={(ingredient) => {
            onPick(ingredient);
            onClose();
          }}
        />
      ) : (
        <IngredientSearch recipeName={recipeName} full={full} onPick={onPick} onClose={onClose} />
      )}
    </Modal>
  );
}

type Tab = 'favourites' | 'mine';

/** A food that can go into a recipe: a library food or one of one's own. */
type IngredientFood = FoodResult & { ref: Ingredient['food'] };

const isIngredient = (food: FoodResult): food is IngredientFood => food.ref.kind !== 'recipe';

function IngredientSearch({
  recipeName,
  full,
  onPick,
  onClose,
}: Omit<IngredientPickerProps, 'changing'>) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const rowLabels = useRowLabels();
  const [query, setQuery] = useState('');
  const typed = query.trim();
  const term = useSettledQuery(typed);
  // A recipe holds foods only, so search leaves recipes out.
  const search = useFoodSearch(term, { recipes: false });
  const [tab, setTab] = useState<Tab>('favourites');
  const favourites = useFavouriteFoods();
  const mine = useMyFoods();
  // The foods added from here, which show a check instead of their +.
  const [added, setAdded] = useState<string[]>([]);
  const [opened, setOpened] = useState<Ingredient['food'] | null>(null);

  const add = (ingredient: Ingredient) => {
    if (full) {
      return;
    }
    onPick(ingredient);
    setAdded((current) => [...current, refKey(ingredient.food)]);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    AccessibilityInfo.announceForAccessibility(
      t('nutrition.recipe.added', { name: ingredient.name }),
    );
  };

  if (opened) {
    return (
      <IngredientAmount
        food={opened}
        submitLabel="addToRecipe"
        onBack={() => setOpened(null)}
        onPick={(ingredient) => {
          add(ingredient);
          setOpened(null);
        }}
      />
    );
  }

  const row = (food: FoodResult, index: number) => {
    if (!isIngredient(food)) {
      return null;
    }
    const amount = quickAmountOf(food);
    const { portion, detail } = rowLabels(food, amount);
    return (
      <FoodRow
        food={food}
        detail={detail}
        addLabel={t('nutrition.search.quickAdd', { portion, name: food.name })}
        added={added.includes(refKey(food.ref))}
        // Nothing more goes in once the recipe is full.
        adding={full}
        first={index === 0}
        onOpen={() => setOpened(food.ref)}
        onAdd={() => add({ food: food.ref, name: food.name, per100g: food.per100g, ...amount })}
      />
    );
  };

  // Before anything is typed: the favourites and one's own foods, without recipes.
  const lists: Record<Tab, { query: typeof mine; foods: IngredientFood[]; empty: string[] }> = {
    favourites: {
      query: favourites,
      foods: (favourites.data ?? []).filter(isIngredient),
      empty: [t('nutrition.quick.noFavourites'), t('nutrition.quick.noFavouritesText')],
    },
    mine: {
      query: mine,
      foods: (mine.data ?? []).filter(isIngredient),
      empty: [t('nutrition.quick.noMine'), t('nutrition.quick.noMineText')],
    },
  };
  const list = lists[tab];

  return (
    <Screen
      onBack={onClose}
      title={
        recipeName.trim()
          ? t('nutrition.recipe.addTo', { name: recipeName.trim() })
          : t('nutrition.recipe.addToNew')
      }
      footer={<Button label={t('common.done')} onPress={onClose} />}
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
        {full ? <Note tone="warning">{t('nutrition.recipe.full')}</Note> : null}
      </View>
      {typed.length === 0 ? (
        <FlatList
          data={list.query.isError ? [] : list.foods}
          keyExtractor={(food) => refKey(food.ref)}
          renderItem={({ item, index }) => row(item, index)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xl }}
          ListHeaderComponent={
            <View
              accessibilityRole="tablist"
              accessibilityLabel={t('nutrition.quick.tabs')}
              style={[styles.chips, { gap: spacing.sm, paddingBottom: spacing.md }]}
            >
              {(Object.keys(lists) as Tab[]).map((value) => (
                <Chip
                  key={value}
                  label={t(`nutrition.quick.${value}`)}
                  selected={tab === value}
                  onPress={() => setTab(value)}
                />
              ))}
            </View>
          }
          ListEmptyComponent={
            <EmptyList
              query={list.query}
              icon={tab === 'favourites' ? 'star' : 'edit'}
              title={list.empty[0]!}
              message={list.empty[1]!}
            />
          }
        />
      ) : (
        <SearchResults
          typed={typed}
          term={term}
          search={search}
          hint={t('nutrition.recipe.searchHint')}
          renderRow={row}
        />
      )}
    </Screen>
  );
}

/** How much of a food goes into the recipe, in its portions or grams. */
function IngredientAmount({
  food: ref,
  initial,
  submitLabel,
  onBack,
  onPick,
}: {
  food: Ingredient['food'];
  initial?: Amount;
  submitLabel: 'addToRecipe' | 'saveAmount';
  onBack: () => void;
  onPick: (ingredient: Ingredient) => void;
}) {
  const { t } = useTranslation();
  const { format } = useNumberFormat();
  const food = useFood(ref);
  if (allLoaded([food]) && food.data) {
    const { name, per100g } = food.data;
    return (
      <AmountForm
        title={name}
        subtitle={t('nutrition.amount.per100g', { calories: format(per100g.calories) })}
        onBack={onBack}
        per100g={per100g}
        portions={food.data.portions}
        initial={initial}
        eatenCalories={0}
        // A recipe is not a day: what the day would come to does not apply.
        targetCalories={null}
        submitLabel={t(`nutrition.recipe.${submitLabel}`)}
        submitting={false}
        onSubmit={(amount) => onPick({ food: ref, name, per100g, ...amount })}
      />
    );
  }
  return <FoodLoadState gone={food.data === null} queries={[food]} onBack={onBack} />;
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
