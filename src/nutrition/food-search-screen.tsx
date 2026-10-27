import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Note } from '@/components/ui/note';
import { SearchField } from '@/components/ui/search-field';
import { Text } from '@/components/ui/text';
import { useNumberFormat } from '@/i18n/units';
import { useTheme } from '@/theme';

import { AddEntryError } from './add-entry-error';
import {
  amountOf,
  DEFAULT_GRAMS,
  MIN_QUERY_LENGTH,
  useFoodSearch,
  useSettledQuery,
  refKey,
  type Amount,
  type FoodResult,
} from './foods';
import { useAddEntry } from './entries';
import { FoodRow } from './food-row';
import type { Meal } from './meals';
import { usePortionLabel } from './portion-label';
import { useFavouriteKeys } from './quick-foods';
import { QuickFoods } from './quick-foods-view';

type FoodSearchScreenProps = {
  meal: Meal;
  /** The day the food is added to, YYYY-MM-DD. */
  day: string;
};

/** What + on a result adds: one default portion, or `DEFAULT_GRAMS` of a food without one. */
function quickAmountOf(food: FoodResult): Amount {
  return food.portion
    ? { grams: food.portion.grams, portion: { unit: food.portion.unit, count: 1 } }
    : { grams: DEFAULT_GRAMS, portion: null };
}

/**
 * Finds a food to add to a meal. Before anything is typed it offers the meal's frequent foods,
 * the favourites and one's own foods (ADR 0037). A food opens the amount screen, or its + adds it
 * at once: a frequent food as it was logged last, others by their default portion.
 */
export function FoodSearchScreen({ meal, day }: FoodSearchScreenProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { format } = useNumberFormat();
  const portionLabel = usePortionLabel();
  const [query, setQuery] = useState('');
  const typed = query.trim();
  const term = useSettledQuery(typed);
  const search = useFoodSearch(term);
  const addEntry = useAddEntry();
  const favourites = useFavouriteKeys();
  // The foods added from here, which show a check instead of their +, and the ones being saved,
  // whose + waits so that a double tap does not add them twice.
  const [added, setAdded] = useState<string[]>([]);
  const [saving, setSaving] = useState<string[]>([]);

  // Handled per call: callbacks passed to mutate() run only for the latest one.
  const quickAdd = (food: FoodResult, amount: Amount) => {
    const key = refKey(food.ref);
    setSaving((current) => [...current, key]);
    addEntry
      .mutateAsync({ day, meal, food: food.ref, ...amount })
      .then(() => {
        setAdded((current) => [...current, key]);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        AccessibilityInfo.announceForAccessibility(
          t('nutrition.search.added', { name: food.name }),
        );
      })
      // The mutation's error is shown above the results.
      .catch(() => {})
      .finally(() => setSaving((current) => current.filter((id) => id !== key)));
  };

  const row = (food: FoodResult, index: number, amount = quickAmountOf(food), times?: number) => {
    const key = refKey(food.ref);
    const portion = amount.portion
      ? portionLabel(amount.portion.unit, amount.portion.count)
      : t('nutrition.amount.inGrams', { grams: format(amount.grams) });
    const detail = t(amount.portion ? 'nutrition.search.result' : 'nutrition.search.resultGrams', {
      portion,
      grams: format(amount.grams),
      calories: format(Math.round(amountOf(food.per100g, amount.grams).calories)),
    });
    return (
      <FoodRow
        key={key}
        food={food}
        detail={
          times === undefined
            ? detail
            : `${detail} · ${t('nutrition.quick.times', { count: times })}`
        }
        addLabel={t('nutrition.search.quickAdd', { portion, name: food.name })}
        favourite={favourites.has(key)}
        added={added.includes(key)}
        adding={saving.includes(key)}
        first={index === 0}
        onOpen={() =>
          router.push({ pathname: '/nutrition/food/[id]', params: { id: key, meal, day } })
        }
        onAdd={() => quickAdd(food, amount)}
      />
    );
  };

  // The results belong to what is typed only once its search has finished; until then the last
  // ones stay, and an empty list is no answer yet.
  const current = term === typed && !search.isPlaceholderData && !search.isFetching;
  let body;
  if (typed.length === 0) {
    body = <QuickFoods meal={meal} day={day} renderRow={row} />;
  } else if (typed.length < MIN_QUERY_LENGTH) {
    body = (
      <Text variant="body" color="textMuted" style={{ padding: spacing.xl }}>
        {t('nutrition.search.hint')}
      </Text>
    );
  } else if (search.isError) {
    body = (
      <View style={{ padding: spacing.xl }}>
        <Note tone="danger">{t('nutrition.search.error')}</Note>
      </View>
    );
  } else if (search.data === undefined || (search.data.length === 0 && !current)) {
    body = (
      <ActivityIndicator
        color={colors.primary}
        accessibilityLabel={t('common.loading')}
        style={{ padding: spacing.xl }}
      />
    );
  } else if (search.data.length === 0) {
    body = (
      <Text variant="body" color="textMuted" style={{ padding: spacing.xl }}>
        {t('nutrition.search.noResults', { query: term })}
      </Text>
    );
  } else {
    body = (
      <FlatList
        data={search.data}
        keyExtractor={(item) => refKey(item.ref)}
        renderItem={({ item, index }) => row(item, index)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xl }}
      />
    );
  }

  return (
    <SafeAreaView
      style={[styles.root, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      <View style={[styles.header, { paddingHorizontal: spacing.md }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={() => router.back()}
          style={styles.close}
        >
          <Icon name="close" color="textMuted" />
        </Pressable>
        <Text variant="label" accessibilityRole="header" align="center" style={styles.title}>
          {t(`nutrition.addTo.${meal}`)}
        </Text>
        <View style={styles.close} />
      </View>

      <View style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.sm, gap: spacing.sm }}>
        <SearchField
          label={t('nutrition.search.placeholder')}
          value={query}
          onChangeText={setQuery}
          autoFocus
          maxLength={50}
        />
        {addEntry.isError ? <AddEntryError error={addEntry.error} /> : null}
      </View>

      <View style={styles.flex}>{body}</View>
      <View style={{ paddingHorizontal: spacing.xl, paddingVertical: spacing.md }}>
        <Button
          label={t('nutrition.food.create')}
          variant="secondary"
          onPress={() =>
            router.push({ pathname: '/nutrition/new-food', params: { meal, day, name: typed } })
          }
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
  },
  close: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
  },
});
