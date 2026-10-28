import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { TabScreen } from '@/components/tab-screen';
import { Button } from '@/components/ui/button';
import { Card, cardEntering } from '@/components/ui/card';
import { MessageView } from '@/components/ui/message-view';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { toIsoDate } from '@/i18n/dates';
import { DailyProgress } from '@/nutrition/daily-progress';
import { totalOf, useDayEntries } from '@/nutrition/meals';
import { useNutritionTargets } from '@/nutrition/targets';
import { useDisplayName } from '@/profile/display-name';
import { useStreak } from '@/streak/use-streak';
import { useTheme } from '@/theme';
import { useWeekSchedule } from '@/week/use-week-schedule';
import { hasWorkouts, missedWorkouts } from '@/workouts/week-schedule';
import type { WeekSession } from '@/workouts/workouts';

import { useGreeting } from './greeting';
import { CatchUp } from './catch-up';
import { DayMenu } from './day-menu';
import { MissedCard } from './missed-card';
import { PickDay } from './pick-day';
import { WeekCard } from './week-card';
import { WorkoutCard } from './workout-card';

/** What the sheet over the screen shows: a day of the week card, or the days to move a workout to. */
type SheetContent =
  | { kind: 'day'; date: string }
  | { kind: 'pick'; session: WeekSession; fromOn: string }
  | { kind: 'catchUp' };

/** The home tab: a greeting, the week, the daily targets, missed workouts and today's workout. */
export function TodayScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const targets = useNutritionTargets();
  const streak = useStreak();
  const name = useDisplayName().data;
  const greeting = useGreeting();
  const today = new Date();
  const { schedule, plan, queries: weekQueries } = useWeekSchedule(today);
  const todayOn = toIsoDate(today);
  const eaten = useDayEntries(todayOn);
  const queries = [...weekQueries, targets, eaten];

  const refetchFailed = () =>
    Promise.all(queries.filter((query) => query.isError).map((query) => query.refetch()));
  const [sheet, setSheet] = useState<SheetContent | null>(null);

  const sheetDay =
    sheet?.kind === 'day'
      ? schedule.days.find((day) => day.date === sheet.date && hasWorkouts(day))
      : undefined;
  const missed = missedWorkouts(schedule);
  // A day left with nothing to show, for example after undoing the only move to it, closes, as
  // does catching up once every missed workout is moved or skipped.
  if ((sheet?.kind === 'day' && !sheetDay) || (sheet?.kind === 'catchUp' && missed.length === 0)) {
    setSheet(null);
  }

  let content;
  // A query that loaded and then failed to refresh keeps showing what it has.
  if (queries.some((query) => query.isError && query.data === undefined)) {
    content = (
      <View style={[styles.center, { gap: spacing.xl }]}>
        <MessageView
          icon="offline"
          title={t('today.error.title')}
          message={t('today.error.message')}
        />
        <Button
          label={t('common.tryAgain')}
          loading={queries.some((query) => query.isFetching)}
          onPress={() => void refetchFailed()}
        />
      </View>
    );
  } else if (queries.some((query) => query.isPending)) {
    content = (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} accessibilityLabel={t('today.loading')} />
      </View>
    );
  } else {
    content = (
      <>
        <WeekCard
          entering={cardEntering(0)}
          today={today}
          streak={streak}
          schedule={schedule}
          onDayPress={(day) => setSheet({ kind: 'day', date: day.date })}
        />
        {targets.data ? (
          <Card entering={cardEntering(1)}>
            <Text variant="headline">{t('today.targets')}</Text>
            <DailyProgress targets={targets.data} eaten={totalOf(eaten.data ?? [])} />
          </Card>
        ) : null}
        {missed.length > 0 ? (
          <MissedCard
            entering={cardEntering(2)}
            missed={missed}
            onCatchUp={() => setSheet({ kind: 'catchUp' })}
          />
        ) : null}
        {plan.data ? (
          <WorkoutCard
            entering={cardEntering(2)}
            schedule={schedule}
            sessions={plan.data.sessions}
            today={today}
          />
        ) : null}
      </>
    );
  }

  return (
    <TabScreen
      queries={queries}
      overlay={
        // One sheet whose content changes, as a modal cannot open while another one closes.
        sheet ? (
          <Sheet onClose={() => setSheet(null)}>
            {sheet.kind === 'catchUp' ? (
              <CatchUp
                missed={missed}
                schedule={schedule}
                today={today}
                onDone={() => setSheet(null)}
              />
            ) : sheet.kind === 'pick' ? (
              <PickDay
                schedule={schedule}
                session={sheet.session}
                fromOn={sheet.fromOn}
                today={today}
                onDone={() => setSheet(null)}
              />
            ) : sheetDay ? (
              <DayMenu
                schedule={schedule}
                day={sheetDay}
                today={today}
                onMove={(session, fromOn) => setSheet({ kind: 'pick', session, fromOn })}
              />
            ) : null}
          </Sheet>
        ) : null
      }
    >
      <Text variant="title" accessibilityRole="header">
        {greeting(today, name)}
      </Text>
      {content}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
  },
});
