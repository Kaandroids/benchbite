import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { allLoaded, LoadState } from '@/components/load-state';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FieldLabel, useFieldStyle } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { KeyboardAvoiding } from '@/components/ui/keyboard-avoiding';
import { MessageView } from '@/components/ui/message-view';
import { Note } from '@/components/ui/note';
import { PillButton } from '@/components/ui/pill-button';
import { Screen } from '@/components/ui/screen';
import { ScreenTitle } from '@/components/ui/screen-title';
import { Sheet } from '@/components/ui/sheet';
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
import { amountOf, refKey, useFood, type PortionUnit } from './foods';
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
  const [pickingUnit, setPickingUnit] = useState(false);
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
            label={t('nutrition.food.save')}
            disabled={result.kind !== 'valid' || saving}
            onPress={save}
          />
        }
      >
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
            <Text variant="captionStrong" color="textMuted" style={styles.perLabel}>
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
          {check?.close ? (
            <View style={[styles.check, { gap: spacing.xs }]}>
              <Icon name="check" size={16} color="success" />
              <Text variant="caption" color="textMuted" style={styles.flex}>
                {t('nutrition.food.checkClose')}
              </Text>
            </View>
          ) : check ? (
            <Note tone="warning">
              {t('nutrition.food.checkFar', {
                calories: format(Math.round(check.calories)),
                entered: format(check.entered),
              })}
            </Note>
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
          <View style={[styles.gramsRow, { gap: spacing.sm }]}>
            <Text variant="bodyStrong">1</Text>
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
      {pickingUnit ? (
        <Sheet onClose={() => setPickingUnit(false)}>
          <UnitPicker
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

/** The units a portion can be counted in, and none, in a sheet. */
function UnitPicker({
  value,
  onPick,
}: {
  value: PortionUnit | null;
  onPick: (unit: PortionUnit | null) => void;
}) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  return (
    <View style={{ gap: spacing.md }}>
      <View>
        <Text variant="headline" accessibilityRole="header">
          {t('nutrition.food.unitSheet.title')}
        </Text>
        <Text color="textMuted">{t('nutrition.food.unitSheet.message')}</Text>
      </View>
      <View style={[styles.units, { gap: spacing.sm }]}>
        {UNITS.map((unit) => {
          const selected = unit === value;
          return (
            <Pressable
              key={unit}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onPick(unit)}
              style={({ pressed }) => [
                styles.unit,
                {
                  borderRadius: radii.md,
                  paddingHorizontal: spacing.md,
                  borderWidth: selected ? 2 : 1,
                  borderColor: selected ? colors.primaryButton : colors.border,
                  backgroundColor: selected ? colors.selected : colors.surface,
                  opacity: pressed ? 0.6 : 1,
                },
              ]}
            >
              <Text
                variant={selected ? 'label' : 'bodyStrong'}
                color={selected ? 'primaryText' : 'text'}
              >
                {t(`nutrition.food.units.${unit}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Button
        label={t('nutrition.food.unitSheet.none')}
        variant="ghost"
        onPress={() => onPick(null)}
      />
    </View>
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
  units: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  unit: {
    width: '48%',
    minHeight: 48,
    justifyContent: 'center',
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
