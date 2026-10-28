import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, View } from 'react-native';

import { Note } from '@/components/ui/note';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { MIN_QUERY_LENGTH, refKey, type FoodResult } from './foods';

type SearchResultsProps = {
  /** What is typed, trimmed. */
  typed: string;
  /** What was searched, once typing paused. */
  term: string;
  search: UseQueryResult<FoodResult[]> & { isPlaceholderData: boolean };
  /** Shown before enough is typed to search. */
  hint: string;
  renderRow: (food: FoodResult, index: number) => ReactElement | null;
};

/**
 * The answer to a food search: a hint before enough is typed, the error, a spinner, that nothing
 * matches, or the foods found.
 */
export function SearchResults({ typed, term, search, hint, renderRow }: SearchResultsProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  // The results belong to what is typed only once its search has finished; until then the last
  // ones stay, and an empty list is no answer yet.
  const current = term === typed && !search.isPlaceholderData && !search.isFetching;

  if (typed.length < MIN_QUERY_LENGTH) {
    return (
      <Text variant="body" color="textMuted" style={{ padding: spacing.xl }}>
        {hint}
      </Text>
    );
  }
  if (search.isError) {
    return (
      <View style={{ padding: spacing.xl }}>
        <Note tone="danger">{t('nutrition.search.error')}</Note>
      </View>
    );
  }
  if (search.data === undefined || (search.data.length === 0 && !current)) {
    return (
      <ActivityIndicator
        color={colors.primary}
        accessibilityLabel={t('common.loading')}
        style={{ padding: spacing.xl }}
      />
    );
  }
  if (search.data.length === 0) {
    return (
      <Text variant="body" color="textMuted" style={{ padding: spacing.xl }}>
        {t('nutrition.search.noResults', { query: term })}
      </Text>
    );
  }
  return (
    <FlatList
      data={search.data}
      keyExtractor={(food) => refKey(food.ref)}
      renderItem={({ item, index }) => renderRow(item, index)}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xl }}
    />
  );
}
