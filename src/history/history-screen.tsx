import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, SectionList, StyleSheet, View } from 'react-native';

import { allLoaded, LoadState } from '@/components/load-state';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Tag } from '@/components/ui/tag';
import { Text } from '@/components/ui/text';
import { OutsideWorkoutRow } from '@/health/outside-workout-row';
import { OutsideWorkoutSheet } from '@/health/outside-workout-sheet';
import {
  useOutsideWorkoutsIn,
  type ListedOutsideWorkout,
  type TimeRange,
} from '@/health/outside-workouts';
import { ReadAskCard } from '@/health/read-ask-card';
import { useReadAsk } from '@/health/use-read-ask';
import { useDurationFormat, weekStart } from '@/i18n/dates';
import { useTheme } from '@/theme';

import { useWeekTitle } from './format';
import { byWeek, useLogSummaries, type HistoryEntry } from './history';
import { LogRow } from './log-row';

const keyOf = (entry: HistoryEntry<ListedOutsideWorkout>) =>
  entry.kind === 'log' ? String(entry.log.id) : entry.other.key;

/**
 * Every finished workout, by week, latest first, with the workouts other apps recorded among them
 * (#468, ADR 0106). The workouts load a page at a time as the list scrolls, and only the rows on
 * screen are drawn (#87); other apps' workouts load for the weeks the pages reach.
 */
export function HistoryScreen() {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const logs = useLogSummaries();
  const workoutsAsk = useReadAsk('workouts');
  const [open, setOpen] = useState<ListedOutsideWorkout | null>(null);
  const weekTitle = useWeekTitle();
  const duration = useDurationFormat();
  const pages = logs.data?.pages ?? [];
  const loadedLogs = pages.flatMap((page) => page.logs);
  // Other apps' workouts of the weeks each page reaches, a range a page, so that loading an older
  // page reads only its own time; all the rest once there are no more pages.
  const ranges: TimeRange[] = [];
  let to: Date | null = null;
  pages.forEach((page, index) => {
    const oldest = page.logs.at(-1);
    const last = index === pages.length - 1;
    const from = last && !logs.hasNextPage ? null : oldest ? weekStart(oldest.startedAt) : to;
    if (from === null || to === null || from < to) ranges.push({ from, to });
    to = from ?? to;
  });
  const outside = useOutsideWorkoutsIn(ranges, logs.isSuccess);
  // Grouped after the pages are joined, so that a week split between two pages shows as one. The
  // last week may go on in the next page, so it is complete only once there are no more pages.
  const weeks = byWeek(loadedLogs, outside).map((week, index, all) => ({
    ...week,
    data: week.entries,
    complete: !logs.hasNextPage || index < all.length - 1,
  }));

  return (
    <Screen onBack={() => router.back()} scrolls={false} title={t('workout.history.title')}>
      {!allLoaded([logs]) ? (
        <View style={{ padding: spacing.xl }}>
          <LoadState queries={[logs]} />
        </View>
      ) : (
        <SectionList
          testID="history-list"
          sections={weeks}
          keyExtractor={keyOf}
          ListHeaderComponent={
            workoutsAsk.asking ? (
              <View style={{ paddingBottom: spacing.lg }}>
                <ReadAskCard ask={workoutsAsk} />
              </View>
            ) : undefined
          }
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
              <Text variant="captionStrong" color="textMuted" style={styles.flex}>
                {weekTitle(week.start)}
              </Text>
              {week.complete && week.logs.length > 0 ? (
                <Tag
                  label={t('history.weekTotal', {
                    count: week.logs.length,
                    time: duration(week.minutes),
                  })}
                />
              ) : null}
            </View>
          )}
          // A week's workouts in one card: the first row rounds its top, the last its bottom.
          renderItem={({ item: entry, index, section: week }) => {
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
                {entry.kind === 'log' ? (
                  <LogRow log={entry.log} divider={!first} icons />
                ) : (
                  <OutsideWorkoutRow
                    workout={entry.other}
                    divider={!first}
                    onPress={() => setOpen(entry.other)}
                  />
                )}
              </View>
            );
          }}
        />
      )}
      {open ? <OutsideWorkoutSheet workout={open} onClose={() => setOpen(null)} /> : null}
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
  row: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
});
