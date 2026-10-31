import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ProgressBar } from '@/components/ui/progress-bar';
import { Text } from '@/components/ui/text';
import { useNumberFormat } from '@/i18n/units';
import { useTheme, type ColorTokens } from '@/theme';

import { Average } from './average';
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
  /** What was eaten on an average day, shown small under each macro, for a span of days. */
  average?: NutritionTargets;
};

/** How much of a target was eaten, none for a target of none. */
const shareOf = (eaten: number, target: number) => (target > 0 ? eaten / target : 0);

/** How much of the day's calories and macros was eaten, large, against the targets, small. */
export function DailyProgress({ targets, eaten, average }: DailyProgressProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { format } = useNumberFormat();
  const calorieTarget = t('nutrition.calorieTarget', { target: format(targets.calories) });

  return (
    <>
      <View style={{ gap: spacing.sm }}>
        <Text variant="title" color="primaryText">
          {format(Math.round(eaten.calories))} <Text color="textMuted">{calorieTarget}</Text>
        </Text>
        <ProgressBar
          value={shareOf(eaten.calories, targets.calories)}
          accessibilityLabel={t('nutrition.calorieLabel')}
        />
      </View>
      <MacroColumns targets={targets} eaten={eaten} average={average} />
    </>
  );
}

/** Protein, carbs and fat side by side, each eaten against its target. */
function MacroColumns({ targets, eaten, average }: DailyProgressProps) {
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
          {/* On one line, smaller where a large amount needs it. */}
          <Text variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit>
            {format(Math.round(eaten[nutrient]))}{' '}
            <Text variant="caption" color="textMuted">
              {/* A span's totals are long, so its targets leave the unit to the average. */}
              {t(average ? 'nutrition.spanTarget' : 'nutrition.gramTarget', {
                target: format(targets[nutrient]),
              })}
            </Text>
          </Text>
          <ProgressBar
            value={shareOf(eaten[nutrient], targets[nutrient])}
            color={color}
            accessibilityLabel={t(`nutrition.macros.${key}`)}
          />
          {average ? (
            <Average
              value={t('nutrition.grams', { count: Math.round(average[nutrient]) })}
              style={styles.average}
            />
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
  average: {
    fontSize: 12,
    lineHeight: 16,
  },
});
