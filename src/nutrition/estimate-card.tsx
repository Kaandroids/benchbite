import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Tag } from '@/components/ui/tag';
import { Text } from '@/components/ui/text';
import { useNumberFormat } from '@/i18n/units';
import { useTheme, type ColorTokens } from '@/theme';

import { MACROS } from './macro-targets';
import { confidenceOf, estimateTotals, itemTotals, type EstimateItem } from './meal-estimate';
import type { Meal } from './meals';

type EstimateCardProps = {
  meal: Meal;
  items: EstimateItem[];
  /** Opens an item to change its grams. */
  onOpen: (index: number) => void;
};

/**
 * A meal as Bite estimated it from photos: how sure it is, each food with its grams and calories,
 * marked when the library did not have it, and what they add up to.
 */
export function EstimateCard({ meal, items, onOpen }: EstimateCardProps) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const { format } = useNumberFormat();
  const totals = estimateTotals(items);

  return (
    <Card style={{ gap: spacing.md }}>
      <View style={styles.header}>
        <Text variant="label" accessibilityRole="header">
          {t(`nutrition.meals.${meal}`)}
        </Text>
        <Text variant="captionStrong" color="textMuted">
          {t(`nutrition.photo.confidence.${confidenceOf(items)}`)}
        </Text>
      </View>
      <View>
        {items.map((item, index) => {
          const calories = format(Math.round(itemTotals(item).calories));
          const grams = format(item.grams);
          return (
            <Pressable
              // An item has no id; its place in the estimate stays while it shows.
              key={index}
              accessibilityRole="button"
              accessibilityLabel={t(
                item.estimated ? 'nutrition.photo.rowEstimated' : 'nutrition.photo.row',
                { name: item.name, grams, calories },
              )}
              onPress={() => onOpen(index)}
              style={({ pressed }) => [
                styles.row,
                {
                  gap: spacing.sm,
                  borderTopColor: colors.track,
                  borderTopWidth: index === 0 ? 0 : 1,
                  opacity: pressed ? 0.6 : 1,
                },
              ]}
            >
              <View style={[styles.name, { gap: 2 }]}>
                <Text variant="bodyStrong">{item.name}</Text>
                {item.estimated ? (
                  <Tag label={t('nutrition.photo.estimated')} tone="warning" />
                ) : null}
              </View>
              <View
                style={{
                  backgroundColor: colors.track,
                  borderRadius: radii.sm,
                  paddingHorizontal: spacing.sm,
                  paddingVertical: spacing.xs,
                }}
              >
                <Text variant="captionStrong">{t('nutrition.amount.inGrams', { grams })}</Text>
              </View>
              <Text variant="caption" color="textMuted" align="right" style={styles.calories}>
                {calories} kcal
              </Text>
              <Icon name="forward" size={16} color="textMuted" />
            </Pressable>
          );
        })}
      </View>
      <View style={[styles.totals, { gap: spacing.xs }]}>
        <Total value={format(Math.round(totals.calories))} label="kcal" />
        {MACROS.map(({ key, grams, color }) => (
          <Total
            key={key}
            value={t('nutrition.grams', { count: Math.round(totals[grams]) })}
            label={t(`nutrition.macros.${key}`)}
            color={color}
          />
        ))}
      </View>
    </Card>
  );
}

/**
 * How far a total and its label may shrink to stay on one line in its quarter of the card, as
 * "Kohlenhydrate" does on a narrow phone.
 */
const TOTAL_MIN_SCALE = 0.7;

function Total({
  value,
  label,
  color = 'text',
}: {
  value: string;
  label: string;
  color?: keyof ColorTokens;
}) {
  return (
    <View accessible accessibilityLabel={`${value} ${label}`} style={styles.total}>
      <Text
        variant="label"
        color={color}
        align="center"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={TOTAL_MIN_SCALE}
      >
        {value}
      </Text>
      <Text
        variant="caption"
        color="textMuted"
        align="center"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={TOTAL_MIN_SCALE}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingVertical: 4,
  },
  name: {
    flex: 1,
  },
  calories: {
    minWidth: 64,
  },
  totals: {
    flexDirection: 'row',
  },
  total: {
    flex: 1,
  },
});
