import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, listDivider } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { RoundIconButton } from '@/components/ui/round-icon-button';
import { Text } from '@/components/ui/text';
import { useNumberFormat } from '@/i18n/units';
import { useTheme } from '@/theme';

import { MacroDot } from './macro-dot';
import { MACROS } from './macro-targets';
import { MEAL_COLORS, type Meal, type MealSummary } from './meals';

type MealListProps = {
  meals: MealSummary[];
  /** The calories suggested for the empty meals, from `suggestedCalories`. */
  suggested: Map<Meal, number>;
  /** Opens the meal with its entries. */
  onOpen: (meal: Meal) => void;
  /** Opens the search to add a food to the meal. */
  onAdd: (meal: Meal) => void;
};

/**
 * One row per meal with only its totals, so a day with many entries still fits. An empty meal
 * shows the calories suggested for it. Each meal has its own colour, so that the meals read apart
 * and the screen is not all orange.
 */
export function MealList({ meals, suggested, onOpen, onAdd }: MealListProps) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const { format } = useNumberFormat();

  return (
    <Card list>
      {meals.map(({ meal, icon, items, totals }, index) => {
        const values = {
          calories: format(Math.round(totals.calories)),
          protein: format(Math.round(totals.proteinG)),
          carbs: format(Math.round(totals.carbsG)),
          fat: format(Math.round(totals.fatG)),
        };
        const calories = suggested.get(meal);
        const logged = items > 0;
        const { color, background } = MEAL_COLORS[meal];
        return (
          <View
            key={meal}
            style={[
              styles.row,
              { gap: spacing.md, paddingVertical: spacing.md },
              listDivider(index === 0, colors.border),
            ]}
          >
            <Pressable
              accessibilityRole="button"
              onPress={() => onOpen(meal)}
              style={({ pressed }) => [
                styles.open,
                { gap: spacing.md, opacity: pressed ? 0.6 : 1 },
              ]}
            >
              {/* An empty meal's icon is lighter, not grey, so that it reads as not yet logged
                  rather than off. */}
              <View
                style={[
                  styles.tile,
                  { borderRadius: radii.md, backgroundColor: colors[background] },
                ]}
              >
                <View style={{ opacity: logged ? 1 : 0.6 }}>
                  <Icon name={icon} size={20} color={color} />
                </View>
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
                {logged ? (
                  // The macros by the dots of their colours, as in the summary above.
                  <View
                    accessible
                    accessibilityLabel={t('nutrition.mealTotalsLabel', values)}
                    style={[styles.totals, { gap: spacing.sm }]}
                  >
                    <Text variant="caption" color="textMuted">
                      {t('nutrition.kcal', values)}
                    </Text>
                    {MACROS.map(({ key, color }) => (
                      <View key={key} style={[styles.totals, { gap: spacing.xs }]}>
                        <MacroDot color={color} size={7} />
                        <Text variant="caption" color="textMuted">
                          {values[key]}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text variant="caption" color="textMuted">
                    {calories === undefined
                      ? t('nutrition.nothingLogged')
                      : t('nutrition.suggested', { calories: format(calories) })}
                  </Text>
                )}
              </View>
            </Pressable>
            <RoundIconButton
              icon="plus"
              color={color}
              background={background}
              size={40}
              label={t(`nutrition.addTo.${meal}`)}
              onPress={() => onAdd(meal)}
            />
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
  open: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    flex: 1,
  },
  totals: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
