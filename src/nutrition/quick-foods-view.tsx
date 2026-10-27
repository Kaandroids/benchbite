import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { Note } from '@/components/ui/note';
import { PillButton } from '@/components/ui/pill-button';
import { Text } from '@/components/ui/text';
import { fromIsoDate, daysBetween } from '@/i18n/dates';
import { useNumberFormat } from '@/i18n/units';
import { useTheme } from '@/theme';

import { AddEntryError } from './add-entry-error';
import { useDayName } from './day-name';
import { useRepeatMeal } from './entries';
import { refKey, type Amount, type FoodResult } from './foods';
import { totalOf, usePastMeal, type Meal } from './meals';
import { useFavouriteFoods, useFrequentFoods, useMyFoods } from './quick-foods';

type Tab = 'frequent' | 'favourites' | 'mine';
const TABS: Tab[] = ['frequent', 'favourites', 'mine'];

type QuickFoodsProps = {
  meal: Meal;
  /** The day the foods are added to, YYYY-MM-DD. */
  day: string;
  /**
   * A food's row; `amount` is what + adds, the default portion when undefined, and `times` how
   * often it was logged.
   */
  renderRow: (food: FoodResult, index: number, amount?: Amount, times?: number) => ReactElement;
};

/**
 * What the add screen offers before anything is typed (ADR 0037): the foods logged most at the
 * meal with the meal as it was last eaten, the favourites, and one's own foods.
 */
export function QuickFoods({ meal, day, renderRow }: QuickFoodsProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const [tab, setTab] = useState<Tab>('frequent');
  const frequent = useFrequentFoods(meal);
  const favourites = useFavouriteFoods();
  const mine = useMyFoods();

  const chips = (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={t('nutrition.quick.tabs')}
      style={[styles.chips, { gap: spacing.sm, paddingBottom: spacing.md }]}
    >
      {TABS.map((value) => (
        <Chip
          key={value}
          label={t(`nutrition.quick.${value}`)}
          selected={tab === value}
          onPress={() => setTab(value)}
        />
      ))}
    </View>
  );

  const query = tab === 'frequent' ? frequent : tab === 'favourites' ? favourites : mine;
  let empty: ReactElement;
  if (query.isError) {
    empty = <Note tone="danger">{t('nutrition.quick.error')}</Note>;
  } else if (query.data === undefined) {
    empty = <ActivityIndicator color={colors.primary} accessibilityLabel={t('common.loading')} />;
  } else if (tab === 'frequent') {
    empty = (
      <EmptyList
        icon="history"
        title={t(`nutrition.quick.emptyFrequent.${meal}`)}
        message={t('nutrition.quick.emptyFrequentText')}
      />
    );
  } else if (tab === 'favourites') {
    empty = (
      <EmptyList
        icon="star"
        title={t('nutrition.quick.noFavourites')}
        message={t('nutrition.quick.noFavouritesText')}
      />
    );
  } else {
    empty = (
      <EmptyList
        icon="edit"
        title={t('nutrition.quick.noMine')}
        message={t('nutrition.quick.noMineText')}
      />
    );
  }

  const rows: { food: FoodResult; amount?: Amount; times?: number }[] =
    tab === 'frequent'
      ? (frequent.data ?? []).map((food) => ({ food, amount: food.amount, times: food.times }))
      : (query.data ?? []).map((food) => ({ food }));

  return (
    <FlatList
      data={query.isError ? [] : rows}
      keyExtractor={(item) => refKey(item.food.ref)}
      renderItem={({ item, index }) => renderRow(item.food, index, item.amount, item.times)}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xl }}
      ListHeaderComponent={
        <View style={{ gap: spacing.md, paddingBottom: spacing.sm }}>
          {chips}
          {tab === 'frequent' ? <PastMealCard meal={meal} day={day} /> : null}
          {tab === 'frequent' && rows.length > 0 ? (
            <Text variant="captionStrong" color="textMuted">
              {t(`nutrition.quick.often.${meal}`)}
            </Text>
          ) : null}
        </View>
      }
      ListEmptyComponent={empty}
      ListFooterComponent={
        tab === 'favourites' && rows.length > 0 ? (
          <Text
            variant="caption"
            color="textMuted"
            align="center"
            style={{ paddingTop: spacing.md }}
          >
            {t('nutrition.quick.favouritesNote')}
          </Text>
        ) : undefined
      }
    />
  );
}

function EmptyList({
  icon,
  title,
  message,
}: {
  icon: 'history' | 'star' | 'edit';
  title: string;
  message: string;
}) {
  const { spacing } = useTheme();
  return (
    <Card style={[styles.empty, { gap: spacing.sm }]}>
      <IconTile name={icon} />
      <Text variant="label" align="center">
        {title}
      </Text>
      <Text variant="caption" color="textMuted" align="center">
        {message}
      </Text>
    </Card>
  );
}

/** The meal as it was last eaten in the week before, to add all of it again. */
function PastMealCard({ meal, day }: { meal: Meal; day: string }) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { format } = useNumberFormat();
  const dayName = useDayName();
  const past = usePastMeal(day, meal);
  const repeatMeal = useRepeatMeal();
  if (!past.data) {
    return null;
  }
  const { entries, day: pastDay } = past.data;
  const from = fromIsoDate(pastDay);
  const name = dayName(from, daysBetween(from, fromIsoDate(day)));
  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="captionStrong" color="textMuted">
        {t(`nutrition.quick.last.${meal}`)}
      </Text>
      <Card style={[styles.past, { gap: spacing.md }]}>
        <View style={styles.pastText} accessible>
          <Text variant="label">
            {t('nutrition.quick.lastSize', {
              count: entries.length,
              calories: format(Math.round(totalOf(entries).calories)),
            })}
          </Text>
          <Text variant="caption" color="textMuted" numberOfLines={2}>
            {t('nutrition.quick.lastFoods', {
              day: name,
              names: entries.map((entry) => entry.name).join(', '),
            })}
          </Text>
        </View>
        {repeatMeal.isSuccess ? (
          <View
            accessible
            accessibilityLabel={t('nutrition.quick.addedAll', { count: repeatMeal.data })}
          >
            <Icon name="check" size={20} color="success" />
          </View>
        ) : (
          <PillButton
            label={t('nutrition.quick.addAll')}
            accessibilityLabel={t('nutrition.quick.addAllLabel', {
              count: entries.length,
              day: name,
            })}
            disabled={repeatMeal.isPending}
            onPress={() => repeatMeal.mutate({ from: pastDay, to: day, meal })}
          />
        )}
      </Card>
      {repeatMeal.isError ? <AddEntryError error={repeatMeal.error} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  empty: {
    alignItems: 'center',
  },
  past: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pastText: {
    flex: 1,
  },
});
