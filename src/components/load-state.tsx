import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { MessageView } from '@/components/ui/message-view';
import { useTheme } from '@/theme';

type Query = {
  data: unknown;
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  refetch: () => unknown;
};

/** Whether a query has nothing to show because it failed; failing to refresh keeps its data. */
const failed = (query: Query) => query.isError && query.data === undefined;

/**
 * A spinner while the queries load, or an error with a retry for the ones that failed. Renders
 * nothing once everything has loaded, so the screen shows its content.
 */
export function LoadState({ queries }: { queries: Query[] }) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();

  if (queries.some(failed)) {
    return (
      <View style={[styles.center, { gap: spacing.xl }]}>
        <MessageView icon="offline" title={t('loadError.title')} message={t('loadError.message')} />
        <Button
          label={t('common.tryAgain')}
          loading={queries.some((query) => query.isFetching)}
          onPress={() => {
            for (const query of queries.filter(failed)) {
              void query.refetch();
            }
          }}
        />
      </View>
    );
  }
  if (queries.some((query) => query.isPending)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} accessibilityLabel={t('common.loading')} />
      </View>
    );
  }
  return null;
}

/**
 * Whether every query has data, so the screen can show its content. A query that loaded and then
 * failed to refresh, or to load a further page, keeps what it has rather than taking it away.
 */
export function allLoaded(queries: Query[]): boolean {
  return queries.every((query) => query.data !== undefined);
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
  },
});
