import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card, type CardProps } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { fromIsoDate, isoWeekday, useWeekdayFormat } from '@/i18n/dates';
import { useNumberFormat } from '@/i18n/units';
import { isOverTarget, type DayNutrition, type NutritionSummary } from '@/nutrition/day-nutrition';
import { MacroBars } from '@/nutrition/macro-bars';
import { useTheme } from '@/theme';

type WeekMacrosCardProps = {
  entering?: CardProps['entering'];
  /** Each day of the week, from Monday. */
  days: DayNutrition[];
  week: NutritionSummary | null;
};

/**
 * A past week's days as bars of their macros (ADR 0046): each as tall as its calories, made of its
 * protein, carbs and fat by their calories, in the macros' colours. A day over its target says so
 * in red; a day without entries is left empty.
 */
export function WeekMacrosCard({ entering, days, week }: WeekMacrosCardProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { format } = useNumberFormat();
  const weekdayName = useWeekdayFormat('short');
  const longWeekday = useWeekdayFormat();
  const thousands = (kcal: number) =>
    t('today.pastWeek.macros.thousands', {
      value: format(kcal / 1000, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    });

  const labelOf = (day: DayNutrition) => {
    const weekday = longWeekday(isoWeekday(fromIsoDate(day.day)));
    if (day.entries === 0) {
      return t('today.pastWeek.macros.notLogged', { day: weekday });
    }
    return [
      t('today.pastWeek.macros.day', {
        day: weekday,
        kcal: format(Math.round(day.eaten.calories)),
        protein: format(Math.round(day.eaten.proteinG)),
        carbs: format(Math.round(day.eaten.carbsG)),
        fat: format(Math.round(day.eaten.fatG)),
      }),
      ...(isOverTarget(day) ? [t('today.pastWeek.macros.overTarget')] : []),
    ].join(', ');
  };

  return (
    <Card entering={entering} style={{ gap: spacing.sm }}>
      <View style={styles.header}>
        <Text variant="headline" accessibilityRole="header" style={styles.flex}>
          {t('today.pastWeek.macros.title')}
        </Text>
        {week ? (
          <Text variant="captionStrong" color="textMuted">
            {t('today.pastWeek.macros.average', {
              kcal: format(Math.round(week.average.calories)),
            })}
          </Text>
        ) : null}
      </View>
      {week ? (
        <MacroBars
          bars={days.map((day) => ({
            key: day.day,
            eaten: day.eaten,
            logged: day.entries > 0,
            over: isOverTarget(day),
            accessibilityLabel: labelOf(day),
            amount: day.entries > 0 ? thousands(day.eaten.calories) : '–',
            label: weekdayName(isoWeekday(fromIsoDate(day.day))),
          }))}
        />
      ) : (
        <Text variant="caption" color="textMuted">
          {t('today.pastWeek.macros.none')}
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  flex: {
    flex: 1,
  },
});
