import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { allLoaded, LoadState } from '@/components/load-state';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { MessageView } from '@/components/ui/message-view';
import { RoundIconButton } from '@/components/ui/round-icon-button';
import { Text } from '@/components/ui/text';
import { useNumberFormat } from '@/i18n/units';
import { clamp, parseDecimal } from '@/lib/math';
import { typography, useTheme } from '@/theme';

import { AddEntryError } from './add-entry-error';
import { useAddEntry } from './entries';
import { amountOf, useFood, type Food } from './foods';
import { MACROS } from './macro-targets';
import { totalOf, useDayEntries, type Meal } from './meals';
import { usePortionLabel } from './portion-label';
import { useNutritionTargets } from './targets';

/** Portions go up and down in halves; grams in tens, up to what an entry may hold. */
const PORTION_STEP = 0.5;
const MAX_PORTIONS = 20;
const GRAMS_STEP = 10;
const MAX_GRAMS = 5000;

/** Typed grams as an entry keeps them, to one decimal; null unless above 0 and up to the most. */
function typedGrams(text: string): number | null {
  const value = parseDecimal(text);
  if (value === null) {
    return null;
  }
  const grams = Math.round(value * 10) / 10;
  return grams > 0 && grams <= MAX_GRAMS ? grams : null;
}

type AmountScreenProps = {
  foodId: string;
  /** The meal the food goes to: the one the search was opened for. */
  meal: Meal;
  /** YYYY-MM-DD. */
  day: string;
};

/** Picks how much of a food was eaten for a meal, showing what that adds to the day. */
export function AmountScreen({ foodId, meal, day }: AmountScreenProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const food = useFood(foodId);
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
        food={food.data}
        meal={meal}
        day={day}
        eatenCalories={totalOf(entries.data ?? []).calories}
        targetCalories={targets.data?.calories ?? null}
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
      <View style={[styles.header, { paddingHorizontal: spacing.md }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={() => router.back()}
          style={styles.back}
        >
          <Icon name="back" color="text" />
        </Pressable>
      </View>
      {content}
    </SafeAreaView>
  );
}

type AmountFormProps = {
  food: Food;
  meal: Meal;
  day: string;
  /** What the day has without this food. */
  eatenCalories: number;
  targetCalories: number | null;
};

function AmountForm({ food, meal, day, eatenCalories, targetCalories }: AmountFormProps) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const { format } = useNumberFormat();
  const portionLabel = usePortionLabel();
  const addEntry = useAddEntry();
  // The index of the chosen portion, or null for grams.
  const [portionIndex, setPortionIndex] = useState<number | null>(
    food.portions.length > 0 ? 0 : null,
  );
  const [count, setCount] = useState(1);
  const [grams, setGrams] = useState(food.portions[0]?.grams ?? 100);
  const [gramsText, setGramsText] = useState<string | null>(null);

  const portion = portionIndex === null ? null : food.portions[portionIndex]!;
  // As many portions as an entry's grams allow, such as 6.5 bottles of 750 g.
  const maxCount = portion
    ? Math.min(MAX_PORTIONS, Math.floor(MAX_GRAMS / portion.grams / PORTION_STEP) * PORTION_STEP)
    : 0;
  // Entries keep grams to one decimal.
  const amount = portion ? Math.round(portion.grams * count * 10) / 10 : grams;
  const adds = amountOf(food.per100g, amount);

  const step = (direction: 1 | -1) => {
    if (portion) {
      setCount((current) => clamp(current + direction * PORTION_STEP, PORTION_STEP, maxCount));
    } else {
      setGramsText(null);
      setGrams((current) =>
        clamp(
          Math.round((current + direction * GRAMS_STEP) / GRAMS_STEP) * GRAMS_STEP,
          1,
          MAX_GRAMS,
        ),
      );
    }
  };
  // Typed grams that are no amount, such as an empty field or more than an entry holds.
  const invalidGrams = !portion && gramsText !== null && typedGrams(gramsText) === null;
  const atMin = portion ? count <= PORTION_STEP : grams <= 1;
  const atMax = portion ? count >= maxCount : grams >= MAX_GRAMS;

  const save = () =>
    addEntry.mutate(
      {
        day,
        meal,
        foodId: food.id,
        grams: amount,
        portion: portion ? { unit: portion.unit, count } : undefined,
      },
      { onSuccess: () => router.dismissTo('/nutrition') },
    );

  return (
    <>
      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingTop: spacing.xs, gap: spacing.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <View>
          <Text variant="title" accessibilityRole="header">
            {food.name}
          </Text>
          <Text variant="bodyStrong" color="textMuted">
            {t('nutrition.amount.per100g', { calories: format(food.per100g.calories) })}
          </Text>
        </View>

        <View style={{ gap: spacing.sm }}>
          <Text variant="captionStrong" color="textMuted">
            {t('nutrition.amount.portion')}
          </Text>
          <View style={[styles.chips, { gap: spacing.sm }]}>
            {food.portions.map((option, index) => (
              <Chip
                key={option.unit}
                label={t('nutrition.amount.portionChip', {
                  portion: portionLabel(option.unit, 1),
                  grams: format(option.grams),
                })}
                selected={portionIndex === index}
                onPress={() => {
                  setPortionIndex(index);
                  setCount(1);
                }}
              />
            ))}
            <Chip
              label={t('nutrition.amount.grams')}
              selected={portionIndex === null}
              onPress={() => {
                setPortionIndex(null);
                setGrams(clamp(amount, 1, MAX_GRAMS));
                setGramsText(null);
              }}
            />
          </View>
        </View>

        <Card style={[styles.stepper, { gap: spacing.md }]}>
          <RoundIconButton
            icon="minus"
            color="text"
            background="track"
            size={48}
            label={t('nutrition.amount.less')}
            onPress={() => step(-1)}
            disabled={atMin}
          />
          <View style={styles.amount}>
            {portion ? (
              <>
                <Text variant="display" align="center">
                  {format(count)}
                </Text>
                <Text variant="caption" color="textMuted" align="center">
                  {portionLabel(portion.unit, count)} ·{' '}
                  {t('nutrition.amount.inGrams', { grams: format(amount) })}
                </Text>
              </>
            ) : (
              <View style={[styles.gramsRow, { gap: spacing.xs }]}>
                <TextInput
                  accessibilityLabel={t('nutrition.amount.grams')}
                  value={gramsText ?? String(grams)}
                  onChangeText={(text) => {
                    setGramsText(text);
                    const value = typedGrams(text);
                    if (value !== null) {
                      setGrams(value);
                    }
                  }}
                  // Text that is no amount stays, so that Add stays off until it is fixed.
                  onEndEditing={() => {
                    if (gramsText !== null && typedGrams(gramsText) !== null) {
                      setGramsText(null);
                    }
                  }}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  maxLength={6}
                  style={[
                    styles.gramsInput,
                    typography.display,
                    { color: colors.text, borderBottomColor: colors.border },
                  ]}
                />
                <Text variant="headline" color="textMuted">
                  g
                </Text>
              </View>
            )}
          </View>
          <RoundIconButton
            icon="plus"
            color="text"
            background="track"
            size={48}
            label={t('nutrition.amount.more')}
            onPress={() => step(1)}
            disabled={atMax}
          />
        </Card>

        <Card>
          <View style={styles.addsLine}>
            <Text variant="bodyStrong" color="textMuted">
              {t('nutrition.amount.adds')}
            </Text>
            <Text variant="headline" color="primaryText">
              {format(Math.round(adds.calories))}{' '}
              <Text variant="bodyStrong" color="textMuted">
                kcal
              </Text>
            </Text>
          </View>
          <View style={[styles.macros, { gap: spacing.sm }]}>
            {MACROS.map(({ key, grams: nutrient, color }) => (
              <View
                key={key}
                style={[
                  styles.macro,
                  {
                    borderRadius: radii.md,
                    backgroundColor: colors.background,
                    padding: spacing.md,
                  },
                ]}
              >
                <View style={[styles.macroName, { gap: spacing.xs }]}>
                  <View style={[styles.dot, { backgroundColor: colors[color] }]} />
                  <Text variant="caption" color="textMuted">
                    {t(`nutrition.macros.${key}`)}
                  </Text>
                </View>
                <Text variant="label">
                  {t('nutrition.grams', { count: Math.round(adds[nutrient]) })}
                </Text>
              </View>
            ))}
          </View>
          {targetCalories !== null ? (
            <Text variant="caption" color="textMuted">
              {t('nutrition.amount.dayWould', {
                eaten: format(Math.round(eatenCalories + adds.calories)),
                target: format(targetCalories),
              })}
            </Text>
          ) : null}
        </Card>

        {addEntry.isError ? <AddEntryError error={addEntry.error} /> : null}
      </ScrollView>
      <View style={{ paddingHorizontal: spacing.xl, paddingVertical: spacing.md }}>
        <Button
          label={t(`nutrition.addTo.${meal}`)}
          loading={addEntry.isPending}
          disabled={invalidGrams}
          onPress={save}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
  },
  back: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  amount: {
    flex: 1,
    alignItems: 'center',
  },
  gramsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  gramsInput: {
    minWidth: 80,
    textAlign: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 0,
  },
  addsLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  macros: {
    flexDirection: 'row',
  },
  macro: {
    flex: 1,
    gap: 2,
  },
  macroName: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
