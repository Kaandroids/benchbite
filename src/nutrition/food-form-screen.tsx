import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { allLoaded, LoadState } from '@/components/load-state';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { FieldLabel, useFieldStyle } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { KeyboardAvoiding } from '@/components/ui/keyboard-avoiding';
import { MessageView } from '@/components/ui/message-view';
import { Note } from '@/components/ui/note';
import { PillButton } from '@/components/ui/pill-button';
import { Screen } from '@/components/ui/screen';
import { ScreenTitle } from '@/components/ui/screen-title';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Text } from '@/components/ui/text';
import { Constants } from '@/lib/database.types';
import { isDbError } from '@/lib/errors';
import { useNumberFormat } from '@/i18n/units';
import { typography, useTheme, type ColorTokens } from '@/theme';

import { useCreateFood, useDeleteFood, useUpdateFood } from './custom-foods';
import {
  EMPTY_FORM,
  formOf,
  macroCheck,
  MAX_NAME_LENGTH,
  readForm,
  type FoodForm,
} from './food-form';
import { amountOf, refKey, useFood } from './foods';
import { MacroDot } from './macro-dot';
import type { Meal } from './meals';
import { usePortionLabel } from './portion-label';

type FoodFormScreenProps = {
  /** The meal and day the search was opened for, where a new food goes on to be logged. */
  meal: Meal;
  day: string;
} & (
  { kind: 'new'; /** What was typed in the search. */ name?: string } | { kind: 'edit'; id: number }
);

/**
 * Adds a food of one's own from its label, then opens it to log an amount; or changes or deletes
 * one. Values can be typed per 100 g or per portion, as the label prints them.
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
  const { t } = useTranslation();
  const food = useFood({ kind: 'custom', id: props.id });
  if (allLoaded([food]) && food.data) {
    return <FoodFormBody {...props} initial={formOf(food.data)} />;
  }
  return (
    <Screen onBack={() => router.back()} closes>
      {food.data === null ? (
        <MessageView
          icon="meal"
          title={t('nutrition.amount.notFound.title')}
          message={t('nutrition.amount.notFound.message')}
        />
      ) : (
        <LoadState queries={[food]} />
      )}
    </Screen>
  );
}

const UNITS = Constants.public.Enums.portion_unit;

const MACRO_FIELDS: {
  key: 'protein' | 'carbs' | 'fat';
  color: keyof ColorTokens;
}[] = [
  { key: 'protein', color: 'protein' },
  { key: 'carbs', color: 'carbs' },
  { key: 'fat', color: 'fat' },
];

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
  const set = (change: Partial<FoodForm>) => setForm((current) => ({ ...current, ...change }));

  const result = readForm(form);
  const check = macroCheck(form);
  // What one portion adds, once the food is complete.
  const portionAdds =
    result.kind === 'valid' && result.values.portion
      ? amountOf(result.values.per100g, result.values.portion.grams)
      : null;
  const portion = form.unit ? portionLabel(form.unit, 1) : null;
  const saving = createFood.isPending || updateFood.isPending;
  const failed = props.kind === 'new' ? createFood : updateFood;

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
        styles.number,
        { color: key === 'kcal' ? colors.primaryText : colors.text },
      ]}
    />
  );

  return (
    <KeyboardAvoiding>
      <Screen
        onBack={() => router.back()}
        closes
        title={
          <ScreenTitle
            title={props.kind === 'new' ? t('nutrition.food.title') : t('nutrition.food.editTitle')}
          />
        }
        action={
          <PillButton
            variant="primary"
            label={t('nutrition.food.save')}
            disabled={result.kind !== 'valid' || saving}
            onPress={save}
          />
        }
      >
        <Text color="textMuted">{t('nutrition.food.intro')}</Text>
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
        </View>

        <View style={{ gap: spacing.sm }}>
          <View style={styles.factsHeader}>
            <FieldLabel text={t('nutrition.food.facts')} />
            {portion ? (
              <View style={styles.basis}>
                <SegmentedControl
                  options={[
                    { value: 'per100g', label: t('nutrition.food.per100g') },
                    { value: 'perPortion', label: t('nutrition.food.perUnit', { portion }) },
                  ]}
                  value={form.basis}
                  onChange={(basis) => set({ basis })}
                  accessibilityLabel={t('nutrition.food.facts')}
                />
              </View>
            ) : (
              <Text variant="captionStrong" color="textMuted">
                {t('nutrition.food.per100g')}
              </Text>
            )}
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
          <View style={[styles.macros, { gap: spacing.sm }]}>
            {MACRO_FIELDS.map(({ key, color }) => (
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
          {check ? (
            <View style={[styles.check, { gap: spacing.xs }]}>
              <Icon
                name={check.close ? 'check' : 'warning'}
                size={16}
                color={check.close ? 'success' : 'warning'}
              />
              <Text variant="caption" color="textMuted" style={styles.flex}>
                {t(check.close ? 'nutrition.food.checkClose' : 'nutrition.food.checkFar', {
                  calories: format(Math.round(check.calories)),
                })}
              </Text>
            </View>
          ) : null}
        </View>

        <Card>
          <Text variant="label">
            {t('nutrition.food.portion')}{' '}
            <Text variant="caption" color="textMuted">
              · {t('nutrition.food.optional')}
            </Text>
          </Text>
          <Text variant="caption" color="textMuted">
            {t('nutrition.food.portionHint')}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.sm }}
          >
            {UNITS.map((unit) => (
              <Chip
                key={unit}
                label={portionLabel(unit, 1)}
                selected={form.unit === unit}
                onPress={() =>
                  // Choosing the unit again leaves the food without a portion.
                  form.unit === unit
                    ? set({ unit: null, portionGrams: '', basis: 'per100g' })
                    : set({ unit })
                }
              />
            ))}
          </ScrollView>
          {portion ? (
            <View style={[styles.gramsRow, { gap: spacing.sm }]}>
              <Text variant="bodyStrong" style={styles.flex}>
                {t('nutrition.food.portionGrams', { portion })}
              </Text>
              <TextInput
                accessibilityLabel={t('nutrition.food.portionGrams', { portion })}
                value={form.portionGrams}
                onChangeText={(portionGrams) => set({ portionGrams })}
                keyboardType="decimal-pad"
                selectTextOnFocus
                maxLength={6}
                placeholder="0"
                placeholderTextColor={colors.placeholder}
                style={[
                  fieldStyle,
                  styles.gramsInput,
                  { borderRadius: radii.md, borderColor: colors.border },
                ]}
              />
              <Text variant="bodyStrong" color="textMuted">
                g
              </Text>
            </View>
          ) : null}
          {portionAdds && portion ? (
            <Text variant="caption" color="textMuted">
              {t('nutrition.food.portionAdds', {
                portion,
                calories: format(Math.round(portionAdds.calories)),
                protein: format(Math.round(portionAdds.proteinG * 10) / 10),
                carbs: format(Math.round(portionAdds.carbsG * 10) / 10),
                fat: format(Math.round(portionAdds.fatG * 10) / 10),
              })}
            </Text>
          ) : null}
        </Card>

        {result.kind === 'problem' ? (
          <Note tone="warning">{t(`nutrition.food.problems.${result.problem}`)}</Note>
        ) : null}
        {failed.isError ? (
          <Note tone="danger">
            {isDbError(failed.error, 'uniqueViolation')
              ? t('nutrition.food.nameTaken')
              : isDbError(failed.error, 'customFoodLimit')
                ? t('nutrition.food.limit')
                : t('nutrition.food.saveError')}
          </Note>
        ) : null}
        {deleteFood.isError ? <Note tone="danger">{t('nutrition.food.deleteError')}</Note> : null}

        {props.kind === 'edit' ? (
          <Button
            label={t('nutrition.food.delete')}
            variant="ghost"
            loading={deleteFood.isPending}
            onPress={remove}
          />
        ) : null}
      </Screen>
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
  basis: {
    flexShrink: 1,
    minWidth: 180,
  },
  caloriesRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  number: {
    minWidth: 56,
    textAlign: 'right',
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
  check: {
    flexDirection: 'row',
    alignItems: 'center',
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
