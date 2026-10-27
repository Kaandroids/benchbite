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
import { RoundIconButton } from '@/components/ui/round-icon-button';
import { SearchField } from '@/components/ui/search-field';
import { Tag } from '@/components/ui/tag';
import { Text } from '@/components/ui/text';
import { useNumberFormat } from '@/i18n/units';
import { useTheme } from '@/theme';

import { AddEntryError } from './add-entry-error';
import {
  amountOf,
  MIN_QUERY_LENGTH,
  useFoodSearch,
  useSettledQuery,
  refKey,
  type Amount,
  type FoodResult,
} from './foods';
import { useAddEntry } from './entries';
import type { Meal } from './meals';
import { usePortionLabel } from './portion-label';

type FoodSearchScreenProps = {
  meal: Meal;
  /** The day the food is added to, YYYY-MM-DD. */
  day: string;
};

/** What + on a result adds: one default portion, or 100 g of a food without one. */
function quickAmountOf(food: FoodResult): Amount {
  return food.portion
    ? { grams: food.portion.grams, portion: { unit: food.portion.unit, count: 1 } }
    : { grams: 100, portion: null };
}

/**
 * Finds a food to add to a meal. A result opens the amount screen, or its + adds the food's
 * default portion at once.
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
  // The foods added from here, which show a check instead of their +, and the ones being saved,
  // whose + waits so that a double tap does not add them twice.
  const [added, setAdded] = useState<string[]>([]);
  const [saving, setSaving] = useState<string[]>([]);

  // Handled per call: callbacks passed to mutate() run only for the latest one.
  const quickAdd = (food: FoodResult) => {
    const key = refKey(food.ref);
    setSaving((current) => [...current, key]);
    addEntry
      .mutateAsync({ day, meal, food: food.ref, ...quickAmountOf(food) })
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

  const row = ({ item }: { item: FoodResult }) => {
    const key = refKey(item.ref);
    const quick = quickAmountOf(item);
    const portion = item.portion
      ? portionLabel(item.portion.unit, 1)
      : t('nutrition.amount.inGrams', { grams: format(quick.grams) });
    const done = added.includes(key);
    return (
      <View
        style={[
          styles.row,
          { gap: spacing.md, paddingVertical: spacing.md, borderTopColor: colors.border },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({ pathname: '/nutrition/food/[id]', params: { id: key, meal, day } })
          }
          style={({ pressed }) => [styles.text, { opacity: pressed ? 0.6 : 1 }]}
        >
          <View style={[styles.name, { gap: spacing.sm }]}>
            <Text variant="label" numberOfLines={2} style={styles.flexText}>
              {item.name}
            </Text>
            {item.ref.kind === 'custom' ? <Tag label={t('nutrition.search.mine')} /> : null}
          </View>
          <Text variant="caption" color="textMuted">
            {t(item.portion ? 'nutrition.search.result' : 'nutrition.search.resultGrams', {
              portion,
              grams: format(quick.grams),
              calories: format(Math.round(amountOf(item.per100g, quick.grams).calories)),
            })}
          </Text>
        </Pressable>
        {done ? (
          <View style={styles.done}>
            <Icon name="check" size={18} color="success" />
          </View>
        ) : (
          <RoundIconButton
            icon="plus"
            color="primary"
            background="iconBackground"
            size={36}
            label={t('nutrition.search.quickAdd', { portion, name: item.name })}
            onPress={() => quickAdd(item)}
            disabled={saving.includes(key)}
          />
        )}
      </View>
    );
  };

  // The results belong to what is typed only once its search has finished; until then the last
  // ones stay, and an empty list is no answer yet.
  const current = term === typed && !search.isPlaceholderData && !search.isFetching;
  let body;
  if (typed.length < MIN_QUERY_LENGTH) {
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
        renderItem={row}
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
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
