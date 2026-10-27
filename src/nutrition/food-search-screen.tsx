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
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui/icon';
import { Note } from '@/components/ui/note';
import { RoundIconButton } from '@/components/ui/round-icon-button';
import { Text } from '@/components/ui/text';
import { useNumberFormat } from '@/i18n/units';
import { isDbError } from '@/lib/errors';
import { typography, useTheme } from '@/theme';

import { amountOf, MIN_QUERY_LENGTH, useAddEntry, useFoodSearch, type FoodResult } from './foods';
import type { Meal } from './meals';
import { usePortionLabel } from './portion-label';

type FoodSearchScreenProps = {
  meal: Meal;
  /** The day the food is added to, YYYY-MM-DD. */
  day: string;
};

/**
 * Finds a food to add to a meal. A result opens the amount screen, or its + adds the food's
 * default portion at once.
 */
export function FoodSearchScreen({ meal, day }: FoodSearchScreenProps) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const { format } = useNumberFormat();
  const portionLabel = usePortionLabel();
  const [query, setQuery] = useState('');
  const search = useFoodSearch(query);
  const addEntry = useAddEntry();
  // The foods added from here, which show a check instead of their +.
  const [added, setAdded] = useState<string[]>([]);
  const searching = query.trim().length >= MIN_QUERY_LENGTH;

  const quickAdd = (food: FoodResult) =>
    addEntry.mutate(
      {
        day,
        meal,
        foodId: food.id,
        grams: food.portion.grams,
        portion: { unit: food.portion.unit, count: 1 },
      },
      {
        onSuccess: () => {
          setAdded((current) => [...current, food.id]);
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          AccessibilityInfo.announceForAccessibility(
            t('nutrition.search.added', { name: food.name }),
          );
        },
      },
    );

  const row = ({ item }: { item: FoodResult }) => {
    const portion = portionLabel(item.portion.unit, 1);
    const done = added.includes(item.id);
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
            router.push({ pathname: '/nutrition/food/[id]', params: { id: item.id, meal, day } })
          }
          style={({ pressed }) => [styles.text, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text variant="label" numberOfLines={2}>
            {item.name}
          </Text>
          <Text variant="caption" color="textMuted">
            {t('nutrition.search.result', {
              portion,
              grams: format(item.portion.grams),
              calories: format(Math.round(amountOf(item.per100g, item.portion.grams).calories)),
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
          />
        )}
      </View>
    );
  };

  let body;
  if (!searching) {
    body = (
      <Text variant="body" color="textMuted" style={{ padding: spacing.xl }}>
        {t('nutrition.search.hint')}
      </Text>
    );
  } else if (search.isError && search.data === undefined) {
    body = (
      <View style={{ padding: spacing.xl }}>
        <Note tone="danger">{t('nutrition.search.error')}</Note>
      </View>
    );
  } else if (search.data === undefined) {
    body = (
      <ActivityIndicator
        color={colors.primary}
        accessibilityLabel={t('common.loading')}
        style={{ padding: spacing.xl }}
      />
    );
  } else if (search.data.length === 0 && !search.isFetching) {
    body = (
      <Text variant="body" color="textMuted" style={{ padding: spacing.xl }}>
        {t('nutrition.search.noResults', { query: query.trim() })}
      </Text>
    );
  } else {
    body = (
      <FlatList
        data={search.data}
        keyExtractor={(item) => item.id}
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
        <View
          style={[
            styles.search,
            {
              gap: spacing.sm,
              borderRadius: radii.md,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              paddingHorizontal: spacing.md,
            },
          ]}
        >
          <Icon name="search" size={20} color="textMuted" />
          <TextInput
            accessibilityLabel={t('nutrition.search.placeholder')}
            placeholder={t('nutrition.search.placeholder')}
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
            maxLength={50}
            style={[styles.input, typography.body, { color: colors.text }]}
          />
        </View>
        {addEntry.isError ? (
          <Note tone="danger">
            {isDbError(addEntry.error, 'closedDay')
              ? t('nutrition.amount.closedDay')
              : t('nutrition.amount.saveError')}
          </Note>
        ) : null}
      </View>

      {body}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
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
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    minHeight: 52,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  text: {
    flex: 1,
  },
  done: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
