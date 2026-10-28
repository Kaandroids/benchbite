import { router } from 'expo-router';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CheckBox } from '@/components/ui/check-box';
import { Chip } from '@/components/ui/chip';
import { Icon, type IconName } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { Note } from '@/components/ui/note';
import { PillButton } from '@/components/ui/pill-button';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { daysBetween, fromIsoDate } from '@/i18n/dates';
import { useNumberFormat } from '@/i18n/units';
import { useTheme } from '@/theme';

import { AddEntryError } from './add-entry-error';
import { useDayName } from './day-name';
import { useCopyEntries } from './entries';
import { refKey, type Amount, type FoodResult } from './foods';
import { totalOf, usePastMeal, type LoggedEntry, type Meal, type PastMeal } from './meals';
import { usePortionLabel } from './portion-label';
import { useFavouriteFoods, useFrequentFoods, useMyFoods } from './quick-foods';
import { useRecipes } from './recipes';

/** A food in one of the lists, with what + adds and, for a frequent food, how often it was logged. */
export type QuickFoodRow = {
  food: FoodResult;
  index: number;
  /** What + adds; the food's default portion when undefined. */
  amount?: Amount;
  times?: number;
};

type QuickFoodsProps = {
  meal: Meal;
  /** The day the foods are added to, YYYY-MM-DD. */
  day: string;
  renderRow: (row: QuickFoodRow) => ReactElement;
};

type Tab = 'frequent' | 'favourites' | 'recipes' | 'mine';

/**
 * What the add screen offers before anything is typed (ADR 0037): the foods logged most at the
 * meal with the meal as it was last eaten, the favourites, the recipes with a way to add one
 * (ADR 0038), and one's own foods.
 */
export function QuickFoods({ meal, day, renderRow }: QuickFoodsProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const [tab, setTab] = useState<Tab>('frequent');
  const frequent = useFrequentFoods(meal);
  const favourites = useFavouriteFoods();
  const recipes = useRecipes();
  const mine = useMyFoods();

  // Each tab's list, and what it says while empty.
  const tabs: Record<
    Tab,
    {
      query: { data?: FoodResult[]; isError: boolean };
      rows: Omit<QuickFoodRow, 'index'>[];
      empty: { icon: IconName; title: string; message: string };
    }
  > = {
    frequent: {
      query: frequent,
      rows: (frequent.data ?? []).map((food) => ({
        food,
        amount: food.amount,
        times: food.times,
      })),
      empty: {
        icon: 'history',
        title: t(`nutrition.quick.emptyFrequent.${meal}`),
        message: t('nutrition.quick.emptyFrequentText'),
      },
    },
    favourites: {
      query: favourites,
      rows: (favourites.data ?? []).map((food) => ({ food })),
      empty: {
        icon: 'star',
        title: t('nutrition.quick.noFavourites'),
        message: t('nutrition.quick.noFavouritesText'),
      },
    },
    recipes: {
      query: recipes,
      rows: (recipes.data ?? []).map((food) => ({ food })),
      empty: {
        icon: 'meal',
        title: t('nutrition.quick.noRecipes'),
        message: t('nutrition.quick.noRecipesText'),
      },
    },
    mine: {
      query: mine,
      rows: (mine.data ?? []).map((food) => ({ food })),
      empty: {
        icon: 'edit',
        title: t('nutrition.quick.noMine'),
        message: t('nutrition.quick.noMineText'),
      },
    },
  };
  const { query, rows, empty } = tabs[tab];

  let emptyList: ReactElement;
  if (query.isError) {
    emptyList = <Note tone="danger">{t('nutrition.quick.error')}</Note>;
  } else if (query.data === undefined) {
    emptyList = (
      <ActivityIndicator color={colors.primary} accessibilityLabel={t('common.loading')} />
    );
  } else {
    emptyList = (
      <Card style={[styles.empty, { gap: spacing.sm }]}>
        <IconTile name={empty.icon} />
        <Text variant="label" align="center">
          {empty.title}
        </Text>
        <Text variant="caption" color="textMuted" align="center">
          {empty.message}
        </Text>
      </Card>
    );
  }

  return (
    <FlatList
      data={query.isError ? [] : rows}
      keyExtractor={(row) => refKey(row.food.ref)}
      renderItem={({ item, index }) => renderRow({ ...item, index })}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xl }}
      ListHeaderComponent={
        <View style={{ gap: spacing.md, paddingBottom: spacing.sm }}>
          <View
            accessibilityRole="tablist"
            accessibilityLabel={t('nutrition.quick.tabs')}
            style={[styles.chips, { gap: spacing.sm, paddingBottom: spacing.md }]}
          >
            {(Object.keys(tabs) as Tab[]).map((value) => (
              <Chip
                key={value}
                label={t(`nutrition.quick.${value}`)}
                selected={tab === value}
                onPress={() => setTab(value)}
              />
            ))}
          </View>
          {tab === 'frequent' ? <PastMealCard meal={meal} day={day} /> : null}
          {tab === 'recipes' ? (
            <Button
              label={t('nutrition.quick.newRecipe')}
              variant="secondary"
              onPress={() =>
                router.push({ pathname: '/nutrition/recipe/new', params: { meal, day } })
              }
            />
          ) : null}
          {tab === 'frequent' && rows.length > 0 ? (
            <Text variant="captionStrong" color="textMuted">
              {t(`nutrition.quick.often.${meal}`)}
            </Text>
          ) : null}
        </View>
      }
      ListEmptyComponent={emptyList}
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

/**
 * The meal as it was last eaten in the week before: Add all adds all of it, Choose opens a sheet
 * to pick the foods.
 */
function PastMealCard({ meal, day }: { meal: Meal; day: string }) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { format } = useNumberFormat();
  const dayName = useDayName();
  const past = usePastMeal(day, meal);
  const copyEntries = useCopyEntries();
  const [choosing, setChoosing] = useState(false);
  if (!past.data) {
    return null;
  }
  const { entries } = past.data;
  const from = fromIsoDate(past.data.day);
  const name = dayName(from, daysBetween(from, fromIsoDate(day)));
  const add = (picked: LoggedEntry[]) =>
    copyEntries.mutate({ ids: picked.map((entry) => entry.id), day, meal });
  // A copy that added nothing found none of the foods loggable any more.
  const added = copyEntries.isSuccess && copyEntries.data > 0;

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
        {added ? (
          <View
            accessible
            accessibilityLabel={t('nutrition.quick.addedAll', { count: copyEntries.data })}
          >
            <Icon name="check" size={20} color="success" />
          </View>
        ) : (
          <View style={{ gap: spacing.xs }}>
            <PillButton
              label={t('nutrition.quick.addAll')}
              accessibilityLabel={t('nutrition.quick.addAllLabel', {
                count: entries.length,
                day: name,
              })}
              disabled={copyEntries.isPending}
              onPress={() => add(entries)}
            />
            <PillButton
              label={t('nutrition.quick.choose')}
              accessibilityLabel={t('nutrition.quick.chooseLabel', { day: name })}
              disabled={copyEntries.isPending}
              onPress={() => setChoosing(true)}
            />
          </View>
        )}
      </Card>
      {copyEntries.isError ? <AddEntryError error={copyEntries.error} /> : null}
      {copyEntries.isSuccess && !added ? (
        <Note tone="danger">{t('nutrition.addError.archived')}</Note>
      ) : null}
      {choosing ? (
        <PickSheet
          meal={meal}
          dayName={name}
          past={past.data}
          onClose={() => setChoosing(false)}
          onAdd={(picked) => {
            setChoosing(false);
            add(picked);
          }}
        />
      ) : null}
    </View>
  );
}

type PickSheetProps = {
  meal: Meal;
  dayName: string;
  past: PastMeal;
  onClose: () => void;
  onAdd: (picked: LoggedEntry[]) => void;
};

/** The foods of a past meal to tick, all ticked at first, and a button that adds the ticked ones. */
function PickSheet({ meal, dayName, past, onClose, onAdd }: PickSheetProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { format } = useNumberFormat();
  const portionLabel = usePortionLabel();
  const [unticked, setUnticked] = useState<number[]>([]);
  const picked = past.entries.filter((entry) => !unticked.includes(entry.id));

  const toggle = (id: number) =>
    setUnticked((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );

  return (
    <Sheet onClose={onClose}>
      <View>
        <Text variant="title" accessibilityRole="header">
          {t(`nutrition.quick.last.${meal}`)}
        </Text>
        <Text variant="body" color="textMuted">
          {t('nutrition.quick.pickNote', { day: dayName })}
        </Text>
      </View>
      <ScrollView style={styles.pickList}>
        {past.entries.map((entry, index) => {
          const ticked = !unticked.includes(entry.id);
          const amount = entry.portion
            ? `${portionLabel(entry.portion.unit, entry.portion.count)} · ${t('nutrition.amount.inGrams', { grams: format(entry.grams) })}`
            : t('nutrition.amount.inGrams', { grams: format(entry.grams) });
          return (
            <Pressable
              key={entry.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: ticked }}
              accessibilityLabel={`${entry.name}, ${amount}, ${format(Math.round(entry.calories))} kcal`}
              onPress={() => toggle(entry.id)}
              style={[
                styles.pickRow,
                {
                  gap: spacing.md,
                  paddingVertical: spacing.md,
                  borderTopColor: colors.border,
                  borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                },
              ]}
            >
              <CheckBox checked={ticked} />
              <View style={styles.pastText}>
                <Text variant="label">{entry.name}</Text>
                <Text variant="caption" color="textMuted">
                  {amount}
                </Text>
              </View>
              <Text variant="captionStrong" color={ticked ? 'text' : 'textMuted'}>
                {format(Math.round(entry.calories))} kcal
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Button
        label={
          picked.length > 0
            ? t('nutrition.quick.addPicked', {
                count: picked.length,
                calories: format(Math.round(totalOf(picked).calories)),
              })
            : t('nutrition.quick.pickNothing')
        }
        disabled={picked.length === 0}
        onPress={() => onAdd(picked)}
      />
    </Sheet>
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
  pickList: {
    maxHeight: 360,
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
