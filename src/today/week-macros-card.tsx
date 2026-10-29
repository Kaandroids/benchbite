import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card, type CardProps } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { fromIsoDate, isoWeekday, useWeekdayFormat } from '@/i18n/dates';
import { useNumberFormat } from '@/i18n/units';
import { KCAL_PER_GRAM } from '@/nutrition/targets';
import { isOverTarget, type DayNutrition, type WeekNutrition } from '@/nutrition/week-nutrition';
import { fonts, useTheme } from '@/theme';

const CHART_HEIGHT = 120;
const BAR_WIDTH = 22;
const EMPTY_HEIGHT = 3;

/** The macros from the top of a bar down. */
const LAYERS: { key: 'fat' | 'carbs' | 'protein'; grams: keyof typeof KCAL_PER_GRAM }[] = [
  { key: 'fat', grams: 'fatG' },
  { key: 'carbs', grams: 'carbsG' },
  { key: 'protein', grams: 'proteinG' },
];

type WeekMacrosCardProps = {
  entering?: CardProps['entering'];
  /** Each day of the week, from Monday. */
  days: DayNutrition[];
  week: WeekNutrition | null;
};

/**
 * A past week's days as bars of their macros (ADR 0046): each as tall as its calories, made of its
 * protein, carbs and fat by their calories, in the macros' colours. A day over its target says so
 * in red; a day without entries is left empty.
 */
export function WeekMacrosCard({ entering, days, week }: WeekMacrosCardProps) {
  const { t } = useTranslation();
  const { colors, spacing, radii } = useTheme();
  const { format } = useNumberFormat();
  const weekdayName = useWeekdayFormat('short');
  const longWeekday = useWeekdayFormat();
  const tallest = Math.max(...days.map((day) => day.eaten.calories));
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
        <>
          <View style={[styles.chart, { gap: spacing.xs }]}>
            {days.map((day) => {
              const logged = day.entries > 0;
              const layers = LAYERS.map((layer) => ({
                ...layer,
                kcal: day.eaten[layer.grams] * KCAL_PER_GRAM[layer.grams],
              }));
              const fromMacros = layers.reduce((sum, layer) => sum + layer.kcal, 0);
              const height = tallest > 0 ? (day.eaten.calories / tallest) * CHART_HEIGHT : 0;
              return (
                <View key={day.day} accessible accessibilityLabel={labelOf(day)} style={styles.day}>
                  <Text color={isOverTarget(day) ? 'danger' : 'textMuted'} style={styles.amount}>
                    {logged ? thousands(day.eaten.calories) : '–'}
                  </Text>
                  <View style={styles.column}>
                    <View
                      style={[
                        styles.bar,
                        {
                          borderTopLeftRadius: radii.sm,
                          borderTopRightRadius: radii.sm,
                          height: logged && height > EMPTY_HEIGHT ? height : EMPTY_HEIGHT,
                          backgroundColor: colors.track,
                        },
                      ]}
                    >
                      {logged && fromMacros > 0
                        ? layers.map((layer) => (
                            <View
                              key={layer.key}
                              style={{
                                flex: layer.kcal / fromMacros,
                                backgroundColor: colors[layer.key],
                              }}
                            />
                          ))
                        : null}
                    </View>
                  </View>
                  <Text variant="caption" color="textMuted" style={styles.weekday}>
                    {weekdayName(isoWeekday(fromIsoDate(day.day)))}
                  </Text>
                </View>
              );
            })}
          </View>
          <View style={[styles.legend, { gap: spacing.md }]}>
            {[...LAYERS].reverse().map((layer) => (
              <View key={layer.key} style={[styles.legendItem, { gap: spacing.xs }]}>
                <View style={[styles.swatch, { backgroundColor: colors[layer.key] }]} />
                <Text variant="caption" color="textMuted">
                  {t(`nutrition.macros.${layer.key}`)}
                </Text>
              </View>
            ))}
          </View>
        </>
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
  chart: {
    flexDirection: 'row',
  },
  day: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  amount: {
    fontFamily: fonts.bold,
    fontSize: 10,
    lineHeight: 13,
  },
  column: {
    height: CHART_HEIGHT,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  bar: {
    width: BAR_WIDTH,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
    overflow: 'hidden',
  },
  weekday: {
    fontFamily: fonts.bold,
  },
  legend: {
    flexDirection: 'row',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  swatch: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
});
