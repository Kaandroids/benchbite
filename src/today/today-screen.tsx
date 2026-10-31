import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { TabScreen } from '@/components/tab-screen';
import { Button } from '@/components/ui/button';
import { cardEntering } from '@/components/ui/card';
import { MessageView } from '@/components/ui/message-view';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { Toast } from '@/components/ui/toast';
import { toIsoDate } from '@/i18n/dates';
import { totalOf, useDayEntries } from '@/nutrition/meals';
import { useNutritionTargets } from '@/nutrition/targets';
import { useDisplayName } from '@/profile/display-name';
import { useBreakPrompt } from '@/streak/break-prompt';
import { BreakSheet } from '@/streak/break-sheet';
import { StreakBadge } from '@/streak/streak-badge';
import { useStreak } from '@/streak/use-streak';
import { useTheme } from '@/theme';
import { useWeekSchedule } from '@/week/use-week-schedule';
import { hasWorkouts, missedWorkouts } from '@/workouts/week-schedule';
import type { WeekSession } from '@/workouts/workouts';

import { useGreeting } from './greeting';
import { CatchUp } from './catch-up';
import { DayMenu } from './day-menu';
import { MissedCard } from './missed-card';
import { PastWeek } from './past-week';
import { PickDay } from './pick-day';
import { TargetsCard } from './targets-card';
import { usePastWeek } from './use-past-week';
import { WeekCard } from './week-card';
import { useWeekPaging } from './week-paging';
import { WorkoutCard } from './workout-card';

/** What the sheet over the screen shows: a day of the week card, or the days to move a workout to. */
type SheetContent =
  | { kind: 'day'; date: string }
  | { kind: 'pick'; session: WeekSession; fromOn: string }
  | { kind: 'catchUp' };

/**
 * The home tab: a greeting, the week, the daily targets, missed workouts and today's workout. The
 * week pages back to the user's first week, which shows a past week's own cards (ADR 0043).
 */
export function TodayScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const targets = useNutritionTargets();
  const name = useDisplayName().data;
  const greeting = useGreeting();
  const today = new Date();
  const { streak, streakBreak, failed: streakFailed, retry: retryStreak } = useStreak(today);
  const { schedule, plan, queries: weekQueries } = useWeekSchedule(today);
  const todayOn = toIsoDate(today);
  const eaten = useDayEntries(todayOn);
  const queries = [...weekQueries, targets, eaten];

  // The streak is tried again too, though the tab shows without it.
  const refetchFailed = () =>
    Promise.all([
      ...queries.filter((query) => query.isError).map((query) => query.refetch()),
      ...(streakFailed ? [retryStreak()] : []),
    ]);
  const [sheet, setSheet] = useState<SheetContent | null>(null);
  const prompt = useBreakPrompt(streakBreak);
  const paging = useWeekPaging(today);
  const pastWeek = usePastWeek(today, paging.week, paging.weeksBack > 0);

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
  } else if (paging.weeksBack > 0) {
    content = (
      <PastWeek
        today={today}
        data={pastWeek}
        startedOn={paging.startedOn}
        onPrevious={paging.onPrevious}
        onNext={paging.onNext}
        onBackToToday={paging.onBackToToday}
      />
    );
  } else {
    content = (
      <>
        <WeekCard
          entering={cardEntering(0)}
          today={today}
          schedule={schedule}
          streakDays={streak.days}
          startedOn={paging.startedOn}
          onDayPress={(day) => setSheet({ kind: 'day', date: day.date })}
          onPrevious={paging.onPrevious}
        />
        {targets.data ? (
          <TargetsCard
            entering={cardEntering(1)}
            targets={targets.data}
            eaten={totalOf(eaten.data ?? [])}
            day={todayOn}
          />
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

  const showBreak =
    streakBreak !== null &&
    prompt.open &&
    sheet === null &&
    !queries.some((query) => query.isPending);

  return (
    <TabScreen
      // Pulling down loads again the week shown.
      queries={paging.weeksBack > 0 ? pastWeek.queries : queries}
      overlay={
        // One sheet whose content changes, as a modal cannot open while another one closes.
        showBreak ? (
          <Sheet onClose={prompt.close}>
            <BreakSheet
              streakBreak={streakBreak}
              today={today}
              schedule={schedule}
              onLog={prompt.log}
              onAnswered={prompt.setMessage}
            />
          </Sheet>
        ) : sheet ? (
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
        ) : prompt.message ? (
          <Toast message={prompt.message} onHide={prompt.hideMessage} />
        ) : null
      }
    >
      <View style={[styles.title, { gap: spacing.md }]}>
        <Text variant="title" accessibilityRole="header" style={styles.flex}>
          {greeting(today, name)}
        </Text>
        <StreakBadge streak={streak} />
      </View>
      {content}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
});
