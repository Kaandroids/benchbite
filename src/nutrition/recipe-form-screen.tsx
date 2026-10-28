import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { allLoaded } from '@/components/load-state';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FieldLabel, useFieldStyle } from '@/components/ui/field';
import { FormError } from '@/components/ui/form-error';
import { Icon } from '@/components/ui/icon';
import { KeyboardAvoiding } from '@/components/ui/keyboard-avoiding';
import { RoundIconButton } from '@/components/ui/round-icon-button';
import { Screen } from '@/components/ui/screen';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { isDbError } from '@/lib/errors';
import { toTenth, useNumberFormat } from '@/i18n/units';
import { useTheme } from '@/theme';

import { FoodLoadState } from './food-load-state';
import { MAX_NAME_LENGTH } from './food-form';
import { amountOf, refKey } from './foods';
import { IngredientPicker } from './ingredient-picker';
import type { Meal } from './meals';
import { usePortionLabel } from './portion-label';
import {
  MAX_INGREDIENTS,
  MAX_SERVING_GRAMS,
  MAX_SERVINGS,
  recipeTotals,
  useDeleteRecipe,
  useRecipe,
  useSaveRecipe,
  type Ingredient,
  type RecipeValues,
} from './recipes';
import { UnitPicker } from './unit-picker';

type RecipeFormScreenProps = {
  /** The meal and day the add screen was opened for, where a new recipe goes on to be logged. */
  meal: Meal;
  day: string;
} & ({ kind: 'new' } | { kind: 'edit'; id: number });

const NEW_RECIPE: RecipeValues = { name: '', servings: 4, servingUnit: 'bowl', ingredients: [] };

/**
 * Adds a recipe from its ingredients and how many servings it makes, then opens it to log a
 * serving; or changes or deletes one (ADR 0038).
 */
export function RecipeFormScreen(props: RecipeFormScreenProps) {
  return props.kind === 'new' ? (
    <RecipeFormBody {...props} initial={NEW_RECIPE} />
  ) : (
    <EditRecipe {...props} />
  );
}

/** Loads a recipe to change it. */
function EditRecipe(props: RecipeFormScreenProps & { kind: 'edit' }) {
  const recipe = useRecipe(props.id);
  if (allLoaded([recipe]) && recipe.data) {
    return <RecipeFormBody {...props} initial={recipe.data} />;
  }
  return <FoodLoadState gone={recipe.data === null} queries={[recipe]} />;
}

function RecipeFormBody(props: RecipeFormScreenProps & { initial: RecipeValues }) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const { format } = useNumberFormat();
  const portionLabel = usePortionLabel();
  const fieldStyle = useFieldStyle();
  const saveRecipe = useSaveRecipe();
  const deleteRecipe = useDeleteRecipe();
  const [recipe, setRecipe] = useState(props.initial);
  // The picker, to add ingredients or to change the amount of the one at an index.
  const [picking, setPicking] = useState<{ changing?: number } | null>(null);
  const [pickingUnit, setPickingUnit] = useState(false);
  const set = (change: Partial<RecipeValues>) =>
    setRecipe((current) => ({ ...current, ...change }));

  const totals = recipeTotals(recipe);
  const tooHeavy = totals.servingGrams > MAX_SERVING_GRAMS;
  const complete = recipe.name.trim() !== '' && recipe.ingredients.length > 0 && !tooHeavy;
  const serverError = saveRecipe.isError
    ? isDbError(saveRecipe.error, 'uniqueViolation')
      ? t('nutrition.recipe.nameTaken')
      : isDbError(saveRecipe.error, 'recipeLimit')
        ? t('nutrition.recipe.limit')
        : isDbError(saveRecipe.error, 'recipeTotalLimit')
          ? t('nutrition.recipe.totalLimit')
          : isDbError(saveRecipe.error, 'recipeDeleted')
            ? t('nutrition.recipe.deleted')
            : t('nutrition.recipe.saveError')
    : deleteRecipe.isError
      ? t('nutrition.recipe.deleteError')
      : null;

  const save = () => {
    if (!complete) {
      return;
    }
    const values = { ...recipe, name: recipe.name.trim() };
    if (props.kind === 'new') {
      saveRecipe
        .mutateAsync({ values })
        .then((id) =>
          // The recipe opens to log a serving; closing it goes back to the add screen.
          router.replace({
            pathname: '/nutrition/food/[id]',
            params: { id: refKey({ kind: 'recipe', id }), meal: props.meal, day: props.day },
          }),
        )
        .catch(() => {});
    } else {
      saveRecipe
        .mutateAsync({ id: props.id, values })
        .then(() => router.back())
        .catch(() => {});
    }
  };

  const remove = () => {
    if (props.kind !== 'edit') {
      return;
    }
    deleteRecipe
      .mutateAsync(props.id)
      .then(() =>
        router.dismissTo({
          pathname: '/nutrition/add',
          params: { meal: props.meal, day: props.day },
        }),
      )
      .catch(() => {});
  };

  const pick = (ingredient: Ingredient) =>
    setRecipe((current) => {
      const ingredients = [...current.ingredients];
      if (picking?.changing !== undefined) {
        ingredients[picking.changing] = ingredient;
      } else if (ingredients.length < MAX_INGREDIENTS) {
        ingredients.push(ingredient);
      }
      return { ...current, ingredients };
    });

  const amountLabel = ({ grams, portion }: Ingredient) =>
    portion
      ? `${portionLabel(portion.unit, portion.count)} · ${t('nutrition.amount.inGrams', { grams: format(grams) })}`
      : t('nutrition.amount.inGrams', { grams: format(grams) });

  const servingPortion = portionLabel(recipe.servingUnit, 1);

  return (
    <KeyboardAvoiding>
      <Screen
        onBack={() => router.back()}
        title={props.kind === 'new' ? t('nutrition.recipe.title') : t('nutrition.recipe.editTitle')}
        footer={
          <View style={{ gap: spacing.md }}>
            {serverError ? <FormError>{serverError}</FormError> : null}
            <Button
              label={t('nutrition.recipe.save')}
              loading={saveRecipe.isPending}
              disabled={!complete}
              onPress={save}
            />
          </View>
        }
      >
        {/* The sections stand further apart than the lines within one. */}
        <View style={{ gap: spacing.xl }}>
          <View style={{ gap: spacing.sm }}>
            <FieldLabel text={t('nutrition.recipe.name')} />
            <TextInput
              accessibilityLabel={t('nutrition.recipe.name')}
              value={recipe.name}
              onChangeText={(name) => set({ name })}
              placeholder={t('nutrition.recipe.namePlaceholder')}
              placeholderTextColor={colors.placeholder}
              maxLength={MAX_NAME_LENGTH}
              style={fieldStyle}
            />
          </View>

          <View style={{ gap: spacing.sm }}>
            <FieldLabel
              text={t('nutrition.recipe.ingredients', { count: recipe.ingredients.length })}
            />
            <Card list>
              {recipe.ingredients.length === 0 ? (
                <Text variant="caption" color="textMuted" style={{ paddingTop: spacing.lg }}>
                  {t('nutrition.recipe.noIngredients')}
                </Text>
              ) : null}
              {recipe.ingredients.map((ingredient, index) => (
                <View
                  key={`${refKey(ingredient.food)}-${index}`}
                  style={[
                    styles.row,
                    {
                      gap: spacing.sm,
                      borderTopColor: colors.border,
                      borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                    },
                  ]}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('nutrition.recipe.change', { name: ingredient.name })}
                    accessibilityHint={amountLabel(ingredient)}
                    onPress={() => setPicking({ changing: index })}
                    style={({ pressed }) => [
                      styles.ingredient,
                      { gap: spacing.md, paddingVertical: spacing.md, opacity: pressed ? 0.6 : 1 },
                    ]}
                  >
                    <View style={styles.flex}>
                      <Text variant="label">{ingredient.name}</Text>
                      <Text variant="caption" color="textMuted">
                        {amountLabel(ingredient)}
                      </Text>
                    </View>
                    <Text variant="captionStrong" color="textMuted">
                      {format(Math.round(amountOf(ingredient.per100g, ingredient.grams).calories))}{' '}
                      kcal
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('nutrition.recipe.remove', { name: ingredient.name })}
                    onPress={() =>
                      set({ ingredients: recipe.ingredients.filter((_, other) => other !== index) })
                    }
                    hitSlop={6}
                    style={styles.remove}
                  >
                    <Icon name="close" size={16} color="textMuted" />
                  </Pressable>
                </View>
              ))}
              {recipe.ingredients.length < MAX_INGREDIENTS ? (
                <Button
                  label={t('nutrition.recipe.addIngredient')}
                  variant="ghost"
                  onPress={() => setPicking({})}
                />
              ) : null}
            </Card>
          </View>

          <Card>
            <View style={[styles.row, { gap: spacing.md }]}>
              <Text variant="label" style={styles.flex}>
                {t('nutrition.recipe.makes')}
              </Text>
              <RoundIconButton
                icon="minus"
                color="text"
                background="track"
                size={36}
                label={t('nutrition.recipe.fewer')}
                onPress={() => set({ servings: recipe.servings - 1 })}
                disabled={recipe.servings <= 1}
              />
              <Text
                variant="headline"
                accessibilityLabel={t('nutrition.recipe.servings', { count: recipe.servings })}
                style={styles.count}
              >
                {format(recipe.servings)}
              </Text>
              <RoundIconButton
                icon="plus"
                color="text"
                background="track"
                size={36}
                label={t('nutrition.recipe.more')}
                onPress={() => set({ servings: recipe.servings + 1 })}
                disabled={recipe.servings >= MAX_SERVINGS}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('nutrition.recipe.unitButton', {
                  unit: t(`nutrition.food.units.${recipe.servingUnit}`),
                })}
                onPress={() => setPickingUnit(true)}
                style={[
                  styles.unit,
                  {
                    gap: spacing.xs,
                    borderRadius: radii.full,
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                    paddingHorizontal: spacing.md,
                  },
                ]}
              >
                <Text variant="label">{t(`nutrition.food.units.${recipe.servingUnit}`)}</Text>
                <Icon name="down" size={14} color="textMuted" />
              </Pressable>
            </View>
            {recipe.ingredients.length > 0 ? (
              <Text variant="caption" color="textMuted">
                {t('nutrition.recipe.serving', {
                  portion: servingPortion,
                  calories: format(Math.round(totals.serving.calories)),
                  grams: format(Math.round(totals.servingGrams)),
                  protein: format(toTenth(totals.serving.proteinG)),
                  carbs: format(toTenth(totals.serving.carbsG)),
                  fat: format(toTenth(totals.serving.fatG)),
                })}
              </Text>
            ) : null}
            {tooHeavy ? (
              <FormError>
                {t('nutrition.recipe.tooHeavy', { grams: format(Math.round(totals.servingGrams)) })}
              </FormError>
            ) : null}
          </Card>

          {props.kind === 'edit' ? (
            <Button
              label={t('nutrition.recipe.delete')}
              variant="ghost"
              loading={deleteRecipe.isPending}
              onPress={remove}
            />
          ) : null}
        </View>
      </Screen>
      {picking ? (
        <IngredientPicker
          recipeName={recipe.name}
          changing={
            picking.changing !== undefined ? recipe.ingredients[picking.changing] : undefined
          }
          onPick={pick}
          onClose={() => setPicking(null)}
        />
      ) : null}
      {pickingUnit ? (
        <Sheet onClose={() => setPickingUnit(false)}>
          <UnitPicker
            title={t('nutrition.recipe.unitSheet.title')}
            message={t('nutrition.recipe.unitSheet.message')}
            value={recipe.servingUnit}
            onPick={(unit) => {
              setPickingUnit(false);
              if (unit) {
                set({ servingUnit: unit });
              }
            }}
          />
        </Sheet>
      ) : null}
    </KeyboardAvoiding>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ingredient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  remove: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: {
    minWidth: 28,
    textAlign: 'center',
  },
  unit: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
    borderWidth: 1.5,
  },
});
