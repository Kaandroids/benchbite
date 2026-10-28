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
import { Screen } from '@/components/ui/screen';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { dbErrorMessage } from '@/lib/errors';
import { toTenth, useNumberFormat } from '@/i18n/units';
import { typography, useTheme } from '@/theme';

import { useCreateFood, useDeleteFood, useUpdateFood } from './custom-foods';
import { EMPTY_FORM, formOf, MAX_NAME_LENGTH, readForm, type FoodForm } from './food-form';
import { FoodLoadState } from './food-load-state';
import { amountOf, refKey, useFood } from './foods';
import { MacroDot } from './macro-dot';
import { MACROS } from './macro-targets';
import type { Meal } from './meals';
import { usePortionLabel } from './portion-label';
import { UnitPicker } from './unit-picker';

type FoodFormScreenProps = {
  /** The meal and day the search was opened for, where a new food goes on to be logged. */
  meal: Meal;
  day: string;
} & (
  { kind: 'new'; /** What was typed in the search. */ name?: string } | { kind: 'edit'; id: number }
);

/**
 * Adds a food of one's own from its label, then opens it to log an amount; or changes or deletes
 * one. Values are typed per 100 g, as labels print them.
 */
export function FoodFormScreen(props: FoodFormScreenProps) {
  return props.kind === 'new' ? (
    <FoodFormBody {...props} initial={{ ...EMPTY_FORM, name: props.name ?? '' }} />
  ) : (
    <EditFood {...props} />
  );
}

/** Loads a food of one's own to change it. */
function EditFood(props: FoodFormScreenProps & { kind: 'edit' }) {
  const food = useFood({ kind: 'custom', id: props.id });
  if (allLoaded([food]) && food.data) {
    return <FoodFormBody {...props} initial={formOf(food.data)} />;
  }
  return <FoodLoadState gone={food.data === null} queries={[food]} />;
}

function FoodFormBody(props: FoodFormScreenProps & { initial: FoodForm }) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const { format } = useNumberFormat();
  const portionLabel = usePortionLabel();
  const fieldStyle = useFieldStyle();
  const createFood = useCreateFood();
  const updateFood = useUpdateFood();
  const deleteFood = useDeleteFood();
  const [form, setForm] = useState(props.initial);
  const [pickingUnit, setPickingUnit] = useState(false);
  const set = (change: Partial<FoodForm>) => setForm((current) => ({ ...current, ...change }));

  const result = readForm(form);
  // What one portion adds, once the food is complete.
  const portionAdds =
    result.kind === 'valid' && result.values.portion
      ? amountOf(result.values.per100g, result.values.portion.grams)
      : null;
  const portion = form.unit ? portionLabel(form.unit, 1) : null;
  const saving = createFood.isPending || updateFood.isPending;
  const failed = props.kind === 'new' ? createFood : updateFood;
  // Each value problem shows under its field.
  const problem = result.kind === 'problem' ? result : null;
  // Why saving or deleting failed, above the button that saves.
  const serverError = failed.isError
    ? dbErrorMessage(
        failed.error,
        [
          ['uniqueViolation', t('nutrition.food.nameTaken')],
          ['customFoodLimit', t('nutrition.food.limit')],
          ['customFoodTotalLimit', t('nutrition.food.totalLimit')],
          ['customFoodDeleted', t('nutrition.food.deleted')],
        ],
        t('nutrition.food.saveError'),
      )
    : deleteFood.isError
      ? t('nutrition.food.deleteError')
      : null;

  const save = () => {
    if (result.kind !== 'valid') {
      return;
    }
    if (props.kind === 'new') {
      createFood
        .mutateAsync(result.values)
        .then((id) =>
          // The food opens to log an amount; closing it goes back to the search.
          router.replace({
            pathname: '/nutrition/food/[id]',
            params: { id: refKey({ kind: 'custom', id }), meal: props.meal, day: props.day },
          }),
        )
        .catch(() => {});
    } else {
      updateFood
        .mutateAsync({ id: props.id, values: result.values })
        .then(() => router.back())
        .catch(() => {});
    }
  };

  const remove = () => {
    if (props.kind !== 'edit') {
      return;
    }
    deleteFood
      .mutateAsync(props.id)
      .then(() =>
        router.dismissTo({
          pathname: '/nutrition/add',
          params: { meal: props.meal, day: props.day },
        }),
      )
      .catch(() => {});
  };

  const numberField = (key: 'kcal' | 'protein' | 'carbs' | 'fat', label: string) => (
    <TextInput
      accessibilityLabel={label}
      value={form[key]}
      onChangeText={(text) => set({ [key]: text })}
      keyboardType="decimal-pad"
      selectTextOnFocus
      maxLength={6}
      placeholder="0"
      placeholderTextColor={colors.placeholder}
      style={[
        key === 'kcal' ? typography.title : typography.headline,
        key === 'kcal' ? styles.calories : styles.macroNumber,
        { color: key === 'kcal' ? colors.primaryText : colors.text },
      ]}
    />
  );

  return (
    <KeyboardAvoiding>
      <Screen
        onBack={() => router.back()}
        title={props.kind === 'new' ? t('nutrition.food.title') : t('nutrition.food.editTitle')}
        footer={
          <View style={{ gap: spacing.md }}>
            {serverError ? <FormError>{serverError}</FormError> : null}
            <Button
              label={t('nutrition.food.save')}
              loading={saving}
              disabled={result.kind !== 'valid'}
              onPress={save}
            />
          </View>
        }
      >
        {/* The sections stand further apart than the lines within one. */}
        <View style={{ gap: spacing.xl }}>
          <View style={{ gap: spacing.sm }}>
            <FieldLabel text={t('nutrition.food.name')} />
            <TextInput
              accessibilityLabel={t('nutrition.food.name')}
              value={form.name}
              onChangeText={(name) => set({ name })}
              placeholder={t('nutrition.food.namePlaceholder')}
              placeholderTextColor={colors.placeholder}
              maxLength={MAX_NAME_LENGTH}
              style={fieldStyle}
            />
            <Text variant="caption" color="textMuted">
              {t('nutrition.food.onlyYou')}
            </Text>
          </View>

          <View style={{ gap: spacing.sm }}>
            <View style={styles.factsHeader}>
              <FieldLabel text={t('nutrition.food.facts')} />
              <Text variant="caption" color="textMuted" style={styles.perLabel}>
                {t('nutrition.food.perLabel')}
              </Text>
            </View>
            <Card style={[styles.caloriesRow, { gap: spacing.md }]}>
              <Text variant="label" style={styles.flex}>
                {t('nutrition.food.calories')}
              </Text>
              {numberField('kcal', t('nutrition.food.calories'))}
              <Text variant="bodyStrong" color="textMuted">
                kcal
              </Text>
            </Card>
            {problem?.problem === 'tooMuchEnergy' ? (
              <FormError>{t('nutrition.food.problems.tooMuchEnergy')}</FormError>
            ) : null}
            <View style={[styles.macros, { gap: spacing.sm }]}>
              {MACROS.map(({ key, color }) => (
                <Card key={key} style={[styles.macro, { gap: spacing.xs, padding: spacing.md }]}>
                  <View style={[styles.macroName, { gap: spacing.xs }]}>
                    <MacroDot color={color} />
                    <Text variant="captionStrong" color="textMuted">
                      {t(`nutrition.macros.${key}`)}
                    </Text>
                  </View>
                  <View style={[styles.macroValue, { gap: 2 }]}>
                    {numberField(key, t(`nutrition.macros.${key}`))}
                    <Text variant="bodyStrong" color="textMuted">
                      g
                    </Text>
                  </View>
                </Card>
              ))}
            </View>
            {problem?.problem === 'tooMuchMacros' ? (
              <FormError>{t('nutrition.food.problems.tooMuchMacros')}</FormError>
            ) : null}
            {problem?.problem === 'tooFewCalories' ? (
              <FormError>
                {t('nutrition.food.tooFewCalories', {
                  calories: format(Math.round(problem.calories)),
                  entered: format(problem.entered),
                })}
              </FormError>
            ) : null}
          </View>

          <Card>
            <View style={{ gap: spacing.xs }}>
              <Text variant="label">{t('nutrition.food.portion')}</Text>
              <Text variant="caption" color="textMuted">
                {t('nutrition.food.portionHint')}
              </Text>
            </View>
            <View style={[styles.gramsRow, { gap: spacing.sm }]}>
              <Text variant="bodyStrong">1 ×</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('nutrition.food.unitButton', {
                  unit: form.unit
                    ? t(`nutrition.food.units.${form.unit}`)
                    : t('nutrition.food.chooseUnit'),
                })}
                onPress={() => setPickingUnit(true)}
                style={[
                  styles.unitButton,
                  {
                    gap: spacing.sm,
                    borderRadius: radii.md,
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                    paddingHorizontal: spacing.md,
                  },
                ]}
              >
                <Text color={form.unit ? 'text' : 'placeholder'} style={styles.flex}>
                  {form.unit
                    ? t(`nutrition.food.units.${form.unit}`)
                    : t('nutrition.food.chooseUnit')}
                </Text>
                <Icon name="down" size={16} color="textMuted" />
              </Pressable>
              <Text variant="bodyStrong">=</Text>
              <TextInput
                accessibilityLabel={t('nutrition.food.portionGrams', {
                  portion: portion ?? t('nutrition.food.chooseUnit'),
                })}
                value={form.portionGrams}
                onChangeText={(portionGrams) => set({ portionGrams })}
                editable={form.unit !== null}
                keyboardType="decimal-pad"
                selectTextOnFocus
                maxLength={6}
                placeholder="0"
                placeholderTextColor={colors.placeholder}
                style={[
                  fieldStyle,
                  styles.gramsInput,
                  { borderRadius: radii.md, borderColor: colors.border },
                  form.unit === null ? styles.disabled : null,
                ]}
              />
              <Text variant="bodyStrong" color="textMuted">
                g
              </Text>
            </View>
            {problem?.problem === 'portion' ? (
              <FormError>{t('nutrition.food.problems.portion')}</FormError>
            ) : null}
            {portionAdds && portion ? (
              <Text variant="caption" color="textMuted">
                {t('nutrition.food.portionAdds', {
                  portion,
                  calories: format(Math.round(portionAdds.calories)),
                  protein: format(toTenth(portionAdds.proteinG)),
                  carbs: format(toTenth(portionAdds.carbsG)),
                  fat: format(toTenth(portionAdds.fatG)),
                })}
              </Text>
            ) : null}
          </Card>

          {props.kind === 'edit' ? (
            <Button
              label={t('nutrition.food.delete')}
              variant="ghost"
              loading={deleteFood.isPending}
              onPress={remove}
            />
          ) : null}
        </View>
      </Screen>
      {pickingUnit ? (
        <Sheet onClose={() => setPickingUnit(false)}>
          <UnitPicker
            title={t('nutrition.food.unitSheet.title')}
            message={t('nutrition.food.unitSheet.message')}
            noneLabel={t('nutrition.food.unitSheet.none')}
            value={form.unit}
            onPick={(unit) => {
              setPickingUnit(false);
              set(unit ? { unit } : { unit: null, portionGrams: '' });
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
  factsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  perLabel: {
    flexShrink: 1,
    textAlign: 'right',
  },
  unitButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    borderWidth: 1,
  },
  disabled: {
    opacity: 0.5,
  },
  caloriesRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  calories: {
    minWidth: 56,
    textAlign: 'right',
    paddingVertical: 0,
  },
  // Under its name, as wide as the number, so that the unit follows it.
  macroNumber: {
    minWidth: 24,
    flexShrink: 1,
    paddingVertical: 0,
  },
  macros: {
    flexDirection: 'row',
  },
  macro: {
    flex: 1,
  },
  macroName: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  macroValue: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  gramsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  gramsInput: {
    width: 96,
    textAlign: 'right',
  },
});
