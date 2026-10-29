import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card, cardEntering } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useWeekLogs } from '@/history/history';
import { useWeekNutrition, weekNutrition } from '@/nutrition/week-nutrition';
import type { Streak } from '@/streak/streak';
import { useWeekStreak } from '@/streak/use-streak';
import { useTheme } from '@/theme';
import { useWeekSchedule } from '@/week/use-week-schedule';

import { WeekCard } from './week-card';
import { WeekMacrosCard } from './week-macros-card';
import { WeekSummaryCard } from './week-summary-card';
import { WeekWorkoutsCard } from './week-workouts-card';

type PastWeekProps = {
  today: Date;
  /** A day of the week shown. */
  week: Date;
  streak: Streak;
  /** The user's first day, YYYY-MM-DD. */
  startedOn?: string;
  /** Absent on the user's first week. */
  onPrevious?: () => void;
  onNext: () => void;
  onBackToToday: () => void;
};

/**
 * A past week, read only (ADR 0043, ADR 0046): its days with their streak marks, then its
 * workouts, its days' calories and macros, and a summary of what was eaten.
 */
export function PastWeek({
  today,
  week,
  streak,
  startedOn,
  onPrevious,
  onNext,
  onBackToToday,
}: PastWeekProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { schedule, queries: scheduleQueries } = useWeekSchedule(today, week);
  const streakDays = useWeekStreak(today, week);
  const logs = useWeekLogs(week);
  const nutrition = useWeekNutrition(today, week);
  const queries = [...scheduleQueries, streakDays, logs, nutrition];
  const failed = queries.filter((query) => query.isError && query.data === undefined);
  const loading = queries.some((query) => query.isPending);
  const summary = weekNutrition(nutrition.data ?? []);

  let cards;
  if (failed.length > 0) {
    cards = (
      <Card style={[styles.center, { gap: spacing.md }]}>
        <Text variant="body" color="textMuted" align="center">
          {t('today.error.message')}
        </Text>
        <Button
          label={t('common.tryAgain')}
          loading={failed.some((query) => query.isFetching)}
          onPress={() => void Promise.all(failed.map((query) => query.refetch()))}
        />
      </Card>
    );
  } else if (!loading) {
    cards = (
      <>
        <WeekWorkoutsCard entering={cardEntering(1)} logs={logs.data ?? []} schedule={schedule} />
        <WeekMacrosCard entering={cardEntering(2)} days={nutrition.data ?? []} week={summary} />
        {summary?.targets ? (
          <WeekSummaryCard
            entering={cardEntering(3)}
            week={{ ...summary, targets: summary.targets }}
          />
        ) : null}
      </>
    );
  }

  return (
    <>
      <WeekCard
        today={today}
        streak={streak}
        schedule={schedule}
        streakDays={streakDays.data}
        startedOn={startedOn}
        loading={loading || failed.length > 0}
        onPrevious={onPrevious}
        onNext={onNext}
        onBackToToday={onBackToToday}
      />
      {cards}
    </>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
  },
});
