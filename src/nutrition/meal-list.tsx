import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card, listDivider } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useNumberFormat } from '@/i18n/units';
import { useTheme } from '@/theme';

import { MEALS, type Meal, type MealSummary } from './meals';

type MealListProps = {
  meals: MealSummary[];
  /** The calories suggested for the empty meals, from `suggestedCalories`. */
  suggested: Map<Meal, number>;
};

/**
 * One row per meal with only its totals, so a day with many entries still fits. An empty meal
 * shows the calories suggested for it.
 */
export function MealList({ meals, suggested }: MealListProps) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const { format } = useNumberFormat();

  return (
    <Card list>
      {meals.map(({ meal, items, totals }, index) => {
        const icon = MEALS.find((m) => m.meal === meal)!.icon;
        const values = {
          calories: format(Math.round(totals.calories)),
          protein: format(Math.round(totals.proteinG)),
          carbs: format(Math.round(totals.carbsG)),
          fat: format(Math.round(totals.fatG)),
        };
        const calories = suggested.get(meal);
        return (
          <View
            key={meal}
            accessible
            style={[
              styles.row,
              { gap: spacing.md, paddingVertical: spacing.md },
              listDivider(index === 0, colors.border),
            ]}
          >
            <View
              style={[
                styles.tile,
                {
                  borderRadius: radii.md,
                  backgroundColor: items > 0 ? colors.iconBackground : colors.background,
                },
              ]}
            >
              <Icon name={icon} size={20} color={items > 0 ? 'primary' : 'textMuted'} />
            </View>
            <View style={styles.text}>
              <Text variant="label">
                {t(`nutrition.meals.${meal}`)}
                {items > 0 ? (
                  <Text variant="caption" color="textMuted">
                    {' · '}
                    {t('nutrition.items', { count: items })}
                  </Text>
                ) : null}
              </Text>
              {items > 0 ? (
                <Text
                  variant="caption"
                  color="textMuted"
                  accessibilityLabel={t('nutrition.mealTotalsLabel', values)}
                >
                  {t('nutrition.mealTotals', values)}
                </Text>
              ) : (
                <Text variant="caption" color="textMuted">
                  {calories === undefined
                    ? t('nutrition.nothingLogged')
                    : t('nutrition.suggested', { calories: format(calories) })}
                </Text>
              )}
            </View>
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tile: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
  },
});
