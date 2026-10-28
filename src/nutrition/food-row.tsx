import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { RoundIconButton } from '@/components/ui/round-icon-button';
import { Tag } from '@/components/ui/tag';
import { Text } from '@/components/ui/text';
import { useNumberFormat } from '@/i18n/units';
import { useTheme } from '@/theme';

import { Star } from './favourite-star';
import { amountOf, type Amount, type FoodResult } from './foods';
import { usePortionLabel } from './portion-label';

/**
 * What a row says of an amount of a food: the portions, such as "1 bowl", and a line with the
 * portions, grams and calories, such as "1 bowl · 250 g · 208 kcal".
 */
export function useRowLabels() {
  const { t } = useTranslation();
  const { format } = useNumberFormat();
  const portionLabel = usePortionLabel();
  return (food: FoodResult, amount: Amount) => {
    const portion = amount.portion
      ? portionLabel(amount.portion.unit, amount.portion.count)
      : t('nutrition.amount.inGrams', { grams: format(amount.grams) });
    const detail = t(amount.portion ? 'nutrition.search.result' : 'nutrition.search.resultGrams', {
      portion,
      grams: format(amount.grams),
      calories: format(Math.round(amountOf(food.per100g, amount.grams).calories)),
    });
    return { portion, detail };
  };
}

type FoodRowProps = {
  food: FoodResult;
  /** The amount + adds and what it holds, such as "1 bowl · 250 g · 208 kcal". */
  detail: string;
  /** What + says to screen readers, such as "Add 1 bowl of Bulgur". */
  addLabel: string;
  favourite?: boolean;
  /** Added from this screen: a check instead of +. */
  added: boolean;
  /** Being added: + waits, so that a double tap does not add the food twice. */
  adding: boolean;
  first: boolean;
  onOpen: () => void;
  onAdd: () => void;
};

/** A food to add to a meal: the row opens the amount screen, + adds it at once. */
export function FoodRow({
  food,
  detail,
  addLabel,
  favourite = false,
  added,
  adding,
  first,
  onOpen,
  onAdd,
}: FoodRowProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  return (
    <View
      style={[
        styles.row,
        {
          gap: spacing.md,
          paddingVertical: spacing.md,
          borderTopColor: colors.border,
          borderTopWidth: first ? 0 : StyleSheet.hairlineWidth,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[
          food.name,
          favourite ? t('nutrition.quick.isFavourite') : null,
          food.ref.kind === 'custom' ? t('nutrition.search.mine') : null,
          detail,
        ]
          .filter(Boolean)
          .join(', ')}
        onPress={onOpen}
        style={({ pressed }) => [styles.text, { opacity: pressed ? 0.6 : 1 }]}
      >
        <View style={[styles.name, { gap: spacing.sm }]}>
          <Text variant="label" numberOfLines={2} style={styles.flexText}>
            {food.name}
          </Text>
          {favourite ? <Star filled size={14} /> : null}
          {food.ref.kind === 'custom' ? <Tag label={t('nutrition.search.mine')} /> : null}
        </View>
        <Text variant="caption" color="textMuted">
          {detail}
        </Text>
      </Pressable>
      {added ? (
        <View style={styles.done}>
          <Icon name="check" size={18} color="success" />
        </View>
      ) : (
        <RoundIconButton
          icon="plus"
          color="primary"
          background="iconBackground"
          size={36}
          label={addLabel}
          onPress={onAdd}
          disabled={adding}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    flex: 1,
  },
  name: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flexText: {
    flexShrink: 1,
  },
  done: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
