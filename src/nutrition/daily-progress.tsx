import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ProgressBar } from '@/components/ui/progress-bar';
import { Text } from '@/components/ui/text';
import { useNumberFormat } from '@/i18n/units';
import { useTheme, type ColorTokens } from '@/theme';

import type { NutritionTargets } from './targets';

type Nutrient = keyof NutritionTargets;

const MACROS: { key: 'protein' | 'carbs' | 'fat'; nutrient: Nutrient; color: keyof ColorTokens }[] =
  [
    { key: 'protein', nutrient: 'proteinG', color: 'protein' },
    { key: 'carbs', nutrient: 'carbsG', color: 'carbs' },
    { key: 'fat', nutrient: 'fatG', color: 'fat' },
  ];

type DailyProgressProps = {
  targets: NutritionTargets;
  /** What was eaten today, in the same units as the targets. */
  eaten: NutritionTargets;
};

/** How much of a target was eaten, none for a target of none. */
export const shareOf = (eaten: number, target: number) => (target > 0 ? eaten / target : 0);

/** How much of the day's calories and macros was eaten, large, against the targets, small. */
export function DailyProgress({ targets, eaten }: DailyProgressProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { format } = useNumberFormat();

  return (
    <>
      <View style={{ gap: spacing.sm }}>
        <Text variant="title" color="primaryText">
          {format(Math.round(eaten.calories))}{' '}
          <Text variant="bodyStrong" color="textMuted">
            {t('nutrition.calorieTarget', { target: format(targets.calories) })}
          </Text>
        </Text>
        <ProgressBar
          value={shareOf(eaten.calories, targets.calories)}
          accessibilityLabel={t('nutrition.calorieLabel')}
        />
      </View>
      <MacroColumns targets={targets} eaten={eaten} />
    </>
  );
}

type MacroColumnsProps = DailyProgressProps & {
  /** What was eaten on an average day, shown under each macro, for a span of days. */
  average?: NutritionTargets;
};

/** Protein, carbs and fat side by side, each eaten against its target. */
export function MacroColumns({ targets, eaten, average }: MacroColumnsProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { format } = useNumberFormat();
  return (
    <View style={[styles.macros, { gap: spacing.md }]}>
      {MACROS.map(({ key, nutrient, color }) => (
        <View key={key} style={[styles.macro, { gap: spacing.xs }]}>
          <Text variant="caption" color="textMuted">
            {t(`nutrition.macros.${key}`)}
          </Text>
          <Text variant="headline">
            {format(Math.round(eaten[nutrient]))}{' '}
            <Text variant="caption" color="textMuted">
              {t('nutrition.gramTarget', { target: format(targets[nutrient]) })}
            </Text>
          </Text>
          <ProgressBar
            value={shareOf(eaten[nutrient], targets[nutrient])}
            color={color}
            accessibilityLabel={t(`nutrition.macros.${key}`)}
          />
          {average ? (
            <Text variant="caption" color="textMuted">
              {t('nutrition.averageGrams', {
                grams: format(Math.round(average[nutrient])),
              })}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  macros: {
    flexDirection: 'row',
  },
  macro: {
    flex: 1,
  },
});
