import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Tag } from '@/components/ui/tag';
import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';
import { useNumberFormat } from '@/i18n/units';
import { EstimateItemRow, EstimateTotals } from '@/nutrition/estimate-card';
import { ItemAmount } from '@/nutrition/item-amount';
import { confidenceOf, estimateTotals, itemTotals } from '@/nutrition/meal-estimate';
import { MEAL_COLORS } from '@/nutrition/meal-list';
import { MEALS } from '@/nutrition/meals';
import { spacing, useTheme } from '@/theme';

import { CardRefusal, DecidedLine } from './decided-line';
import {
  type MealCard,
  type MealCardState,
  type MealCardStatus,
  useMealCardAction,
} from './meal-cards';
import { proposalFailure } from './proposals';

type MealCardViewProps = {
  card: MealCard;
  /** Where it stands; unknown while it loads, or for one Bite just made. */
  state?: MealCardState;
  /** Waits for where it stands before it may be added. */
  waiting?: boolean;
};

/**
 * A meal Bite estimated, under its answer (board 9, ADR 0066): the meal, how sure Bite is, each
 * food with its grams and calories, and what they add up to, to add to the meal. Edit changes the
 * grams here, before the meal is added. Once added it folds into a line that says so, with Undo
 * (board 10).
 */
export function MealCardView({ card, state, waiting = false }: MealCardViewProps) {
  const { t } = useTranslation();
  const { format } = useNumberFormat();
  const action = useMealCardAction(card);
  // The grams the user changed, which only this card keeps until it is added.
  const [grams, setGrams] = useState(() => card.items.map((item) => item.grams));
  // Rows to tap to change their grams, for a meal of more than one item.
  const [editing, setEditing] = useState(false);
  const [amountOf, setAmountOf] = useState<number | null>(null);
  // What the user did here wins over where it stood when loaded, as for a proposal.
  const [done, setDone] = useState<{ status: MealCardStatus; kcal: number | null }>();
  const status = done?.status ?? state?.status ?? 'pending';
  const items = card.items.map((item, index) => ({ ...item, grams: grams[index] ?? item.grams }));
  // A refusal says why on the card while it stands where it was refused: an undo is refused
  // logged, an add pending.
  const refused =
    action.isError && (action.variables.action === 'undo') === (status === 'logged')
      ? proposalFailure(action.error)
      : undefined;
  const act = (request: Parameters<typeof action.mutate>[0]) =>
    action.mutate(request, {
      onSuccess: (row) => {
        setDone({ status: row.status, kcal: row.kcal });
        setEditing(false);
      },
    });

  if (status === 'logged') {
    const kcal = done?.kcal ?? state?.kcal ?? estimateTotals(items).calories;
    return (
      <View>
        <DecidedLine
          icon="check"
          iconColor="success"
          text={t(`bite.mealCard.added.${card.meal}`, { calories: format(Math.round(kcal)) })}
          action={
            // Undo stands as long as the entries are as they were added, on a day still open.
            refused === 'changed' ||
            refused === 'outOfDate' ||
            refused === 'closedDay' ? undefined : (
              <TextLink
                label={t('bite.proposal.undo')}
                size="regular"
                disabled={action.isPending}
                onPress={() => act({ action: 'undo' })}
              />
            )
          }
        />
        {refused ? <CardRefusal failure={refused} /> : null}
      </View>
    );
  }
  if (status === 'undone') {
    return <DecidedLine icon="undo" iconColor="textMuted" text={t('bite.proposal.undone')} />;
  }

  // A meal on a day that is closed, or that was added elsewhere, can no longer be added.
  const canAdd = refused !== 'closedDay' && refused !== 'outOfDate';
  const edit = () => (items.length === 1 ? setAmountOf(0) : setEditing((now) => !now));
  return (
    <Card style={{ gap: spacing.md }}>
      <Header card={card} confidence={t(`nutrition.photo.confidence.${confidenceOf(items)}`)} />
      <View>
        {items.map((item, index) =>
          editing ? (
            <EstimateItemRow
              // An item has no id; its place in the card stays.
              key={index}
              item={item}
              first={index === 0}
              onPress={() => setAmountOf(index)}
            />
          ) : (
            <ItemRow key={index} item={item} first={index === 0} />
          ),
        )}
      </View>
      <EstimateTotals items={items} />
      {refused ? <CardRefusal failure={refused} /> : null}
      {canAdd ? (
        <View style={styles.buttons}>
          <Button
            label={t(`nutrition.addTo.${card.meal}`)}
            size="small"
            style={styles.flex}
            disabled={waiting}
            loading={action.isPending}
            onPress={() => act({ action: 'log', grams })}
          />
          <Button
            label={t(editing ? 'common.done' : 'bite.mealCard.edit')}
            variant="secondary"
            size="small"
            disabled={waiting || action.isPending}
            onPress={edit}
          />
        </View>
      ) : null}
      {amountOf !== null && items[amountOf] ? (
        <ItemAmount
          item={items[amountOf]}
          day={card.day}
          onClose={() => setAmountOf(null)}
          onSave={(changed) => {
            setGrams(grams.map((value, index) => (index === amountOf ? changed : value)));
            setAmountOf(null);
          }}
        />
      ) : null}
    </Card>
  );
}

/** The meal in its colour, with its icon, and how sure Bite is of the estimate. */
function Header({ card, confidence }: { card: MealCard; confidence: string }) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const { color, background } = MEAL_COLORS[card.meal];
  const icon = MEALS.find(({ meal }) => meal === card.meal)?.icon ?? 'sun';
  return (
    <View style={[styles.header, { gap: spacing.sm }]}>
      <View style={[styles.meal, { gap: spacing.sm - 2 }]}>
        <View
          style={[styles.tile, { backgroundColor: colors[background], borderRadius: radii.sm }]}
        >
          <Icon name={icon} size={14} color={color} />
        </View>
        <Text variant="label" accessibilityRole="header">
          {t(`nutrition.meals.${card.meal}`)}
        </Text>
      </View>
      <Text variant="captionStrong" color="textMuted" style={styles.shrink} align="right">
        {confidence}
      </Text>
    </View>
  );
}

/** An item as Bite estimated it: its name, and its grams and calories. */
function ItemRow({ item, first }: { item: MealCard['items'][number]; first: boolean }) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { format } = useNumberFormat();
  const grams = format(item.grams);
  const calories = format(Math.round(itemTotals(item).calories));
  return (
    <View
      accessible
      accessibilityLabel={t(item.estimated ? 'bite.mealCard.rowEstimated' : 'bite.mealCard.row', {
        name: item.name,
        grams,
        calories,
      })}
      style={[
        styles.row,
        {
          gap: spacing.sm,
          borderTopColor: colors.track,
          borderTopWidth: first ? 0 : 1,
        },
      ]}
    >
      <View style={[styles.flex, { gap: 2 }]}>
        <Text variant="bodyStrong">{item.name}</Text>
        {item.estimated ? <Tag label={t('nutrition.photo.estimated')} tone="warning" /> : null}
      </View>
      <Text variant="caption" color="textMuted">
        {t('bite.mealCard.amount', { grams, calories })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  shrink: {
    flexShrink: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  meal: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tile: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  buttons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
