import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, ActivityIndicator, FlatList, Modal, View } from 'react-native';

import { allLoaded } from '@/components/load-state';
import { Button } from '@/components/ui/button';
import { Note } from '@/components/ui/note';
import { Screen } from '@/components/ui/screen';
import { SearchField } from '@/components/ui/search-field';
import { Text } from '@/components/ui/text';
import { useNumberFormat } from '@/i18n/units';
import { useTheme } from '@/theme';

import { AmountForm } from './amount-form';
import { FoodLoadState } from './food-load-state';
import { FoodRow, useRowLabels } from './food-row';
import {
  MIN_QUERY_LENGTH,
  quickAmountOf,
  refKey,
  useFood,
  useFoodSearch,
  useSettledQuery,
  type Amount,
  type FoodResult,
} from './foods';
import type { Ingredient } from './recipes';

type IngredientPickerProps = {
  /** The recipe's name, in the title, or empty while it has none. */
  recipeName: string;
  /** An ingredient to change the amount of, rather than finding new ones. */
  changing?: Ingredient;
  onPick: (ingredient: Ingredient) => void;
  onClose: () => void;
};

/**
 * Finds foods to put in a recipe, in a screen of its own over the form: + adds a food's default
 * portion, and a food opens its amount. Recipes are not offered, as a recipe holds foods only.
 * With `changing`, it opens at that ingredient's amount.
 */
export function IngredientPicker({ recipeName, changing, onPick, onClose }: IngredientPickerProps) {
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
        <IngredientSearch recipeName={recipeName} onPick={onPick} onClose={onClose} />
      )}
    </Modal>
  );
}

function IngredientSearch({
  recipeName,
  onPick,
  onClose,
}: Omit<IngredientPickerProps, 'changing'>) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const rowLabels = useRowLabels();
  const [query, setQuery] = useState('');
  const typed = query.trim();
  const term = useSettledQuery(typed);
  const search = useFoodSearch(term);
  // The foods added from here, which show a check instead of their +.
  const [added, setAdded] = useState<string[]>([]);
  const [opened, setOpened] = useState<Ingredient['food'] | null>(null);

  const add = (food: FoodResult & { ref: Ingredient['food'] }, amount: Amount) => {
    onPick({ food: food.ref, name: food.name, per100g: food.per100g, ...amount });
    setAdded((current) => [...current, refKey(food.ref)]);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    AccessibilityInfo.announceForAccessibility(t('nutrition.recipe.added', { name: food.name }));
  };

  if (opened) {
    return (
      <IngredientAmount
        food={opened}
        submitLabel="addToRecipe"
        onBack={() => setOpened(null)}
        onPick={(ingredient) => {
          onPick(ingredient);
          setAdded((current) => [...current, refKey(ingredient.food)]);
          setOpened(null);
        }}
      />
    );
  }

  // A recipe holds foods, not other recipes.
  const foods = (search.data ?? []).filter(
    (food): food is FoodResult & { ref: Ingredient['food'] } => food.ref.kind !== 'recipe',
  );
  const current = term === typed && !search.isPlaceholderData && !search.isFetching;
  let body;
  if (typed.length < MIN_QUERY_LENGTH) {
    body = (
      <Text variant="body" color="textMuted" style={{ padding: spacing.xl }}>
        {t('nutrition.recipe.searchHint')}
      </Text>
    );
  } else if (search.isError) {
    body = (
      <View style={{ padding: spacing.xl }}>
        <Note tone="danger">{t('nutrition.search.error')}</Note>
      </View>
    );
  } else if (search.data === undefined || (foods.length === 0 && !current)) {
    body = (
      <ActivityIndicator
        color={colors.primary}
        accessibilityLabel={t('common.loading')}
        style={{ padding: spacing.xl }}
      />
    );
  } else if (foods.length === 0) {
    body = (
      <Text variant="body" color="textMuted" style={{ padding: spacing.xl }}>
        {t('nutrition.search.noResults', { query: term })}
      </Text>
    );
  } else {
    body = (
      <FlatList
        data={foods}
        keyExtractor={(food) => refKey(food.ref)}
        renderItem={({ item: food, index }) => {
          const amount = quickAmountOf(food);
          const { portion, detail } = rowLabels(food, amount);
          return (
            <FoodRow
              food={food}
              detail={detail}
              addLabel={t('nutrition.search.quickAdd', { portion, name: food.name })}
              added={added.includes(refKey(food.ref))}
              adding={false}
              first={index === 0}
              onOpen={() => setOpened(food.ref)}
              onAdd={() => add(food, amount)}
            />
          );
        }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xl }}
      />
    );
  }

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
      <View style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.sm }}>
        <SearchField
          label={t('nutrition.search.placeholder')}
          value={query}
          onChangeText={setQuery}
          autoFocus
          maxLength={50}
        />
      </View>
      {body}
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
