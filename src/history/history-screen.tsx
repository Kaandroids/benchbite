import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, SectionList, StyleSheet, View } from 'react-native';

import { allLoaded, LoadState } from '@/components/load-state';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { fonts, useTheme } from '@/theme';

import { useDurationFormat, useWeekTitle } from './format';
import { byWeek, useLogSummaries } from './history';
import { LogRow } from './log-row';

/**
 * Every finished workout, by week, latest first. The workouts load a page at a time as the list
 * scrolls, and only the rows on screen are drawn (#87).
 */
export function HistoryScreen() {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const logs = useLogSummaries();
  const weekTitle = useWeekTitle();
  const duration = useDurationFormat();
  // Grouped after the pages are joined, so that a week split between two pages shows as one.
  const weeks = byWeek(logs.data?.pages.flatMap((page) => page.logs) ?? []).map((week) => ({
    ...week,
    data: week.logs,
  }));

  return (
    <Screen
      onBack={() => router.back()}
      scrolls={false}
      title={
        <Text variant="bodyStrong" accessibilityRole="header" style={styles.bold}>
          {t('workout.history.title')}
        </Text>
      }
    >
      {!allLoaded([logs]) ? (
        <View style={{ padding: spacing.xl }}>
          <LoadState queries={[logs]} />
        </View>
      ) : (
        <SectionList
          testID="history-list"
          sections={weeks}
          keyExtractor={(log) => String(log.id)}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ padding: spacing.xl }}
          onEndReached={() => {
            if (logs.hasNextPage && !logs.isFetchingNextPage && !logs.isFetchNextPageError) {
              void logs.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={<Text color="textMuted">{t('workout.history.empty')}</Text>}
          ListFooterComponent={
            logs.isFetchingNextPage ? (
              <ActivityIndicator
                accessibilityLabel={t('workout.history.loadingMore')}
                color={colors.textMuted}
                style={{ marginTop: spacing.lg }}
              />
            ) : logs.isFetchNextPageError ? (
              <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
                <Text color="textMuted" align="center">
                  {t('workout.history.loadMoreError')}
                </Text>
                <Button
                  variant="secondary"
                  label={t('common.tryAgain')}
                  onPress={() => void logs.fetchNextPage()}
                />
              </View>
            ) : undefined
          }
          renderSectionHeader={({ section: week }) => (
            <View
              style={[
                styles.header,
                { paddingBottom: spacing.sm, paddingTop: week === weeks[0] ? 0 : spacing.lg },
              ]}
            >
              <Text variant="caption" color="textMuted" style={[styles.bold, styles.flex]}>
                {weekTitle(week.start)}
              </Text>
              {/* The last week may go on in the next page, so its total waits until it has loaded. */}
              {logs.hasNextPage && week === weeks[weeks.length - 1] ? null : (
                <View
                  style={[
                    styles.chip,
                    { borderRadius: radii.full, backgroundColor: colors.selected },
                  ]}
                >
                  <Text variant="caption" color="primaryText" style={styles.bold}>
                    {t('history.weekTotal', {
                      count: week.logs.length,
                      time: duration(week.minutes),
                    })}
                  </Text>
                </View>
              )}
            </View>
          )}
          // A week's workouts in one card: the first row rounds its top, the last its bottom.
          renderItem={({ item: log, index, section: week }) => {
            const first = index === 0;
            const last = index === week.data.length - 1;
            return (
              <View
                style={[
                  styles.row,
                  {
                    paddingHorizontal: spacing.lg,
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                    borderTopWidth: first ? 1 : 0,
                    borderBottomWidth: last ? 1 : 0,
                    borderTopLeftRadius: first ? radii.lg : 0,
                    borderTopRightRadius: first ? radii.lg : 0,
                    borderBottomLeftRadius: last ? radii.lg : 0,
                    borderBottomRightRadius: last ? radii.lg : 0,
                  },
                ]}
              >
                <LogRow log={log} divider={!first} icons />
              </View>
            );
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
  bold: {
    fontFamily: fonts.extraBold,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  row: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
});
